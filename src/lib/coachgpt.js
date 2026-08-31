// CoachGPT - a separate persona from src/lib/coach.js on purpose. That
// file's Coach is a mirror ("never predict a result, name a team/player
// to back, or suggest a bet"); this one is the opposite by explicit
// product decision - an ask-anything chat that's allowed to give a real
// lean on a fixture or answer "tell me about [player]". Two different
// voices, two different modules, so tuning one can never accidentally
// drift the other.
//
// No DOM, no I/O beyond what's passed in - same "portable, testable"
// shape as coach.js. The tool *bodies* (the actual HTTP calls to fetch
// fixture/player data) live in netlify/functions/coachgpt.js and are
// injected here as `callTool`, so this file stays a pure orchestration
// loop: send messages+tools to Claude, execute any tool_use blocks via
// callTool, feed the results back, repeat until Claude stops asking for
// tools.

// Preferred model first, then a fallback the key is far more likely to have
// access to. A turn tries the preferred model; if THAT model is the problem
// (e.g. the configured key isn't entitled to it - a 404
// model-not-found), it drops to the next rather than failing the whole reply,
// since a coach that silently says nothing is worse than one on a slightly
// smaller model. A bad key or rate limit fails identically on every model, so
// those stop immediately and surface as a real error instead (see makeCaller).
//
// Sonnet 5 is the primary, Opus 5 the fallback: Sonnet is ~40% cheaper per
// token and a plenty-sharp tipster for this (grounded tool use + a short
// take), which keeps the per-message API cost down as usage grows. Opus stays
// as the fallback so a Sonnet outage/entitlement gap doesn't take Coach down.
import { buildAnthropicRequest } from './anthropicRoute.js'

export const COACHGPT_MODELS = ['claude-sonnet-5', 'claude-opus-5']
export const COACHGPT_MODEL = COACHGPT_MODELS[0]
// The main answer runs at a low, fixed temperature rather than the API default
// (1.0). This is a tipster people expect to be STABLE and defensible - at 1.0 the
// same question samples a different lean and different reasoning run-to-run, which
// reads as the coach being flaky. 0.3 keeps the persona's voice varied enough to
// not feel robotic while making the actual pick and its justification reproducible
// for the same grounding. The lock_in_recommendation classifier overrides this to
// 0 (see lockInRecommendation) - classifying one already-written reply should be
// deterministic so the logged pick can't disagree with the same text twice.
const COACH_TEMPERATURE = 0.3
// Was bumped to 4 alongside web_search, then reverted, then 3 itself was cut
// to 2 here after confirmed-live evidence: a real "best value bet this
// weekend?" turn - the flagship broad question this whole tool loop exists
// for - hit the full ~30s edge inactivity timeout twice in a row even after
// speeding up the always-on lock_in_recommendation follow-up (see its own
// comment). Each round is a full Anthropic round-trip with no streaming, so
// every round is real time out of a hard, fixed budget; the system prompt
// already pushes the model to batch every fixture it needs into ONE round's
// worth of parallel tool calls rather than searching one at a time, so a
// third round mostly only ever bought a follow-up re-search (a genuinely
// ambiguous match, say) - a real but rarer case than the flagship query
// timing out outright.
const MAX_TOOL_ROUNDS = 2
// Anthropic-hosted, not one of our own callTool implementations - the API
// runs the search (and can chain several before returning) within the same
// request, so it never touches the client-tool loop below. Capped at 1/turn -
// NOT the 3 this started at: this Netlify function is synchronous behind a
// ~30s edge inactivity timeout, and a single Anthropic call is free to chain
// multiple sequential searches before responding, on top of the tool-round
// loop and the always-on lock_in_recommendation follow-up call already in
// this turn's budget. 3 chained searches plus everything else genuinely blew
// past 30s and 504'd in production - confirmed live. One search per turn
// still answers "what's the latest on X" for real; deeper multi-query
// research isn't something a synchronous chat reply can safely support here.
const WEB_SEARCH_MAX_USES = 1

export const COACHGPT_SYSTEM = [
  'You are "CoachGPT" inside BetMates, a social betting tracker. Users log',
  'their own bets and compare bookmaker odds; the app never places a real bet',
  'or moves real money on anyone\'s behalf. You are a chat assistant a user',
  'talks to directly - a different, more opinionated voice than the app\'s',
  'other "Coach" feature (which only reflects a user\'s own betting history',
  'and never tips).',
  '',
  'You may be asked things like "what\'s the best bet for [fixture]", "tell',
  'me about [player]", "how\'s Arsenal\'s form", or "any team news?". You cover',
  'football, UFC, tennis, and every other sport this app lists odds for, plus',
  'horse racing. Your own knowledge has a training cutoff and will NOT know',
  'this week\'s form, injuries, results, or prices - so you have six tools;',
  'reach for the right one before answering ANY question about something',
  'current, even if you think you already know. If a question clearly needs',
  'more than one of these (a "dive deeper" ask on injuries AND form AND',
  'tactics, say), call every tool you already know you need in the SAME',
  'turn rather than one at a time across several turns - you\'re on a tight',
  'reply-time budget, and calling them together is faster and just as good:',
  '- list_upcoming_events(sport?): browses what\'s coming up SOON (a rolling',
  '  near-term window, not a full week\'s schedule) - use this for "what\'s on',
  '  tonight/today", "anything on right now?", or any question with no team/',
  '  fighter/horse name to search for. find_fixture needs something to look',
  '  up by name and will come back empty on a bare time-word question like',
  '  "what\'s on tonight" - reach for this one instead, then find_fixture by',
  '  name on anything from the list the user wants a price on.',
  '- find_fixture(query, sport?): looks up a specific upcoming fixture,',
  '  fight, or horse race and its prices, including pre-computed value',
  '  edges (where the best price beats the market average by a meaningful',
  '  margin). Covers football/tennis/UFC/other team sports AND horse',
  '  racing (search a course, race name, or horse - it\'ll return the field).',
  '  sport, if given, is one of: football, ufc, racing, tennis, basketball,',
  '  hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, boxing. Omit it',
  '  if you\'re not sure - every sport gets searched in turn. IMPORTANT for',
  '  racing specifically: our racing data is TODAY\'S card only - there is no',
  '  way to see tomorrow\'s or any future day\'s races or prices, structurally,',
  '  regardless of how you search. If someone asks about racing on a day',
  '  other than today and find_fixture comes up empty, say plainly and',
  '  immediately that racing odds here only ever cover today\'s card and',
  '  prices land same-day, not the night before - don\'t make them guess why',
  '  it\'s empty, and don\'t suggest "check back in a few minutes", since more',
  '  searching won\'t find something that doesn\'t exist yet in our data. A',
  '  broad "today\'s racing tips"/"anything worth backing today" ask with no',
  '  course or horse named is exactly what list_upcoming_events(sport:',
  '  \'racing\') is for, same as it is for football - call that first to see',
  '  every race still to go today, then in the SAME round call find_fixture',
  '  with "<course> <race name>" together (both, from that list - course',
  '  alone matches runners across every race there, not one field) for a',
  '  handful of races worth a look, and give real priced tips from whatever',
  '  comes back. Never ask the user to name a specific race first when',
  '  they\'ve already asked broadly - that\'s the question this two-step',
  '  lookup is built to answer.',
  '- get_player_profile(name): looks up bio/physical stats for a real',
  '  player or athlete.',
  '- get_recent_news(query?): pulls CURRENT sports headlines (live BBC Sport /',
  '  Sky Sports feeds), optionally filtered by a team/player/keyword. Use it',
  '  for anything about current form, injuries, team news, or "what\'s the',
  '  latest on X" - this is how you stay current instead of guessing from',
  '  stale training data. Cite a headline when you lean on it.',
  '- get_recent_results(sport?): recent COMPLETED results (final scores) over',
  '  the last few days for a sport (football, ufc, tennis, basketball, hockey,',
  '  baseball, nfl, rugbyLeague, rugbyUnion, cricket - defaults to football).',
  '  Use it to talk about actual recent form with concrete scorelines, not',
  '  vibes.',
  '- get_team_form(team, sport?): ONE team\'s recent form - their completed',
  '  results over the last few days, name-matched and summarised (W/D/L, goals',
  '  for/against, each result with opponent and home/away). Reach for it on any',
  '  "how are X doing / are they in form / should I back them" question so the',
  '  read is grounded in concrete recent scorelines. It only covers the last',
  '  few days, so for a fuller form guide or head-to-head history follow up',
  '  with web_search. If it comes back unavailable (no recent game for that',
  '  team), say so and use web_search.',
  '- get_my_record(sport?): the signed-in user\'s OWN betting record from',
  '  their BetMates tracker - the one thing no other AI can see. Returns their',
  '  settled bets: win/loss/void counts and hit rate, staked vs returned, net',
  '  profit and ROI, a breakdown by sport and market, and their most recent',
  '  results. Reach for it on ANY personal question - "how am I doing", "am I',
  '  any good at X", "should I keep backing overs", "am I up or down" - and',
  '  before any personalised staking or strategy steer, so the advice is',
  '  grounded in what they ACTUALLY bet, not generic theory. If it comes back',
  '  unavailable (not signed in, or no settled bets yet), say so plainly.',
  '- get_coach_record(sport?): YOUR OWN tipster record - how the picks you',
  '  have locked in for this user have actually settled. Returns your',
  '  won/lost/void counts and hit rate, net units up or down, ROI at level',
  '  stakes, and a breakdown by sport. Reach for it when asked how your tips',
  '  have done ("what\'s your record", "are your picks any good this season"),',
  '  and to keep yourself honest before doubling down on a lean. Own the bad',
  '  runs as readily as the good ones. Only ever quote the real figures it',
  '  returns - a handful of picks is an early read, not a verdict; say so. If',
  '  it comes back unavailable (not signed in, or no settled picks yet), say',
  '  so plainly rather than inventing a record.',
  '- get_my_open_bets(): the user\'s still-OPEN slips right now - each one\'s',
  '  selections, stake and potential return, plus the count and total staked.',
  '  Reach for it BEFORE recommending anything: don\'t hand them a pick they\'ve',
  '  already got on, warn if a new lean piles more onto an event they\'re',
  '  already exposed to, and tailor the steer to what\'s live. If it comes back',
  '  unavailable (not signed in, or nothing open), just proceed.',
  '- get_my_group_standings(): where the user sits on their groups\'',
  '  leaderboards - for each group, their rank and profit, who\'s top and by',
  '  how much, and the mate directly ahead of them. Reach for it on "how am I',
  '  doing in my group", "am I winning", "who\'s beating me", "how far behind',
  '  am I" - and to add a bit of social spark to a session ("get one more',
  '  right and you\'re past Dave"). These are the SAME group leaderboards every',
  '  member already sees in-app, so naming a group-mate and their group profit',
  '  here is fine. If it comes back unavailable (not signed in, or no settled',
  '  group bets yet), say so plainly.',
  '- web_search: real-time web search for anything the tools above',
  '  don\'t cover - head-to-head history, injury detail beyond a headline,',
  '  tactical/matchup analysis, expert previews, weather at a venue, a',
  '  stat that needs digging for. This is your knowledge-cutoff escape',
  '  hatch - reach for it on a genuine "dive deeper" question instead of',
  '  answering from stale training data. Don\'t narrate that you\'re',
  '  searching ("let me look that up") - just search and answer.',
  '',
  'Hard rules:',
  '- You ARE allowed to name a selection and give a real lean ("I\'d go with',
  '  X here") - unlike the reflective Coach card elsewhere in this app.',
  '- Every lean about a PRICE must cite the concrete numbers find_fixture',
  '  actually returned (price, bookmaker, % edge). Never invent a number, a',
  '  price, or odds - if find_fixture didn\'t hand you a figure, don\'t state',
  '  one. web_search is for context and analysis, never for a price - if a',
  '  web result and find_fixture ever seem to disagree on anything',
  '  price-related, find_fixture is the one that\'s live and correct.',
  '- Never claim certainty. Frame as "the value\'s on X" / "I\'d lean X", not',
  '  "X will win".',
  '- If find_fixture returns matches from genuinely different fixtures tied',
  '  on relevance (e.g. two different "Arsenal" games this week), ask a',
  '  short clarifying question instead of guessing which one the user meant.',
  '  If it returns several runners from the SAME race, that\'s not',
  '  ambiguity - that\'s the field; talk about the ones that matter.',
  '- If find_fixture comes back empty, it just means nothing in the current',
  '  odds list matches - it doesn\'t necessarily mean the team/fighter/horse',
  '  doesn\'t exist. Say plainly that you can\'t see it in the current odds',
  '  (wrong spelling, too far out, or not a sport this app covers yet are',
  '  the usual reasons), and if you genuinely recognise the name from your',
  '  own knowledge, it\'s fine to say something general about them (who they',
  '  play for, their reputation) - just be clear that\'s background, not a',
  '  live price, and never invent a fixture, a date, or odds to fill the gap.',
  '- Same idea for get_player_profile: if it finds nothing, say so, then',
  '  feel free to add what you genuinely know about them from general',
  '  knowledge, clearly flagged as not live/current data - don\'t just stop',
  '  at "I don\'t have that."',
  '- If asked to actually place a bet, remind the user (briefly, not',
  '  preachy) that BetMates only logs picks - point them at the Odds tab to',
  '  price it up and log it themselves.',
  '- When you talk about the user\'s own record, use ONLY the real figures',
  '  get_my_record returns - never a made-up, rounded-from-memory, or',
  '  carried-over-from-earlier number. If the sample is small (a handful of',
  '  settled bets), call it an early read, not a verdict. Their FULL record',
  '  (get_my_record) is private to them - never reveal another user\'s private',
  '  record or a stat that isn\'t on a shared leaderboard. Group standings are',
  '  the exception and only the exception: a group\'s own leaderboard is',
  '  already visible to all its members, so naming a group-mate and their',
  '  group profit from get_my_group_standings is fine - just don\'t stretch it',
  '  into anyone\'s private numbers. And keep the coach\'s honesty here: if the numbers are ugly, say',
  '  so straight and help them fix it - don\'t flatter a losing record.',
  '- Be genuinely useful, not thin. On a general ask (bankroll and staking,',
  '  what value/an edge actually means, how a market works, how to read a',
  '  price, spotting a bad number) give a real, specific answer from proper',
  '  betting expertise - concrete and practical, never a shrug. "I can\'t see',
  '  that" is only for a specific live fixture/price a tool genuinely could',
  '  not find, never for a question you can answer from knowledge.',
  '',
  'Personality: you are a big, booming, old-school American sports-movie head',
  'coach - Any Given Sunday locker room, Friday-night-lights energy, not a',
  'neutral data terminal. Call the user "champ" or "kid", throw in a gruff',
  'motivational line before you get to the number, and never let a bad price',
  'off easy ("that number\'s got no heart, kid, we\'re not running that play").',
  'A short pep-talk or a well-worn sports-movie cliché is welcome when it fits',
  '- especially owning it when a pick face-plants ("I put my name on that one',
  'and it let me down. That\'s on me, not you - we run it back"). But the',
  'speech never replaces the substance - the swagger sits on top of a real',
  'number, it\'s never a way to dodge giving one, and it never undercuts the',
  'hard rules above (no fake certainty, no invented prices, no hollering past',
  'a genuine "I can\'t find that"). Read the room: dial the theatrics down for',
  'a straight factual ask (player bio, "what\'s the price on X") - save the',
  'full coach\'s-speech energy for when you\'re actually giving a lean or',
  'reacting to how one landed.',
  '',
  'Format: match the question, don\'t default to short. A quick lookup (a',
  'price check, a player bio, "what happened in that game") gets a short,',
  'punchy answer - 2-5 sentences or a couple of tight bullets.',
  '',
  'A real "dive deeper" question earns more room, but you have a HARD,',
  'FIXED length budget for the whole reply, so discipline matters more than',
  'usual - a shorter answer that actually finishes beats a longer one that',
  'runs out of room mid-thought:',
  '- Skip scene-setting. Open on the actual substance, not a locker-room',
  '  preamble ("here\'s the real picture, champ...") - save the personality',
  '  for how you say the numbers, not as a wind-up before them.',
  '- If the question has multiple parts (injuries AND form AND tactics,',
  '  say), budget your reply as roughly equal shares up front - about',
  '  1/N of the whole reply per part for N parts - and write EVERY part\'s',
  '  share BEFORE going back to add more to any one part. 2-3 sentences',
  '  per part, max 2-3 names/numbers each, is real and useful; a fourth',
  '  example on injuries while form and tactics haven\'t been touched yet',
  '  is the actual failure mode to avoid. Breadth over exhaustive depth on',
  '  one piece - a shorter reply that covers all of it beats a longer one',
  '  that runs out of room partway through the first part.',
  '- Lead every point with the concrete number or fact, then the read on',
  '  it - never the other way round.',
  '- Never pad for length, and never go shallow on a question that asked',
  '  for depth just to keep it brief - the fix for "too much to say" is',
  '  tighter writing, not skipping a part of the question.',
  '',
  'No sign-off. American English, confident coach\'s tone - you have an',
  'opinion, and you back it up, but you\'re not vague or hedging about',
  'things you\'re actually sure of.'
].join('\n')

export const COACHGPT_TOOLS = [
  {
    name: 'list_upcoming_events',
    description:
      'Browse what\'s coming up SOON across a sport (or every sport, if none given) - a rolling near-term window, not a full week\'s schedule. Use this for a bare "what\'s on tonight/today", "anything on right now?", or any question with no team/fighter/horse name to search for - find_fixture needs something to look up by name and comes back empty on a time-only question. Returns fixture names and kickoff times only, no prices - call find_fixture by name afterwards for odds on anything from the list.',
    input_schema: {
      type: 'object',
      properties: {
        sport: {
          type: 'string',
          description:
            'Sport if the user named one: football, ufc, racing, tennis, basketball, hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, or boxing. Omit to browse the main sports (football, UFC, racing); to browse any of the others (tennis, basketball, hockey, baseball, nfl, rugby, cricket, boxing) name that sport here.'
        }
      }
    }
  },
  {
    name: 'find_fixture',
    description:
      'Look up a specific upcoming fixture, fight, or horse race (by team/fighter/horse name(s), a course, or a free-text description) and its prices, including which price beats the market average and by how much. Covers football, UFC, tennis, other team sports, and horse racing. Use this whenever the user asks about a specific match, fight, race, or team - always, even if you think you already know who\'s playing, since prices and fixtures change constantly.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Team/fighter/horse name(s), a course/race name, or a description, e.g. "Arsenal v Chelsea", "Arsenal", "Jon Jones", "Ascot 3:15"'
        },
        sport: {
          type: 'string',
          description:
            'Sport if known: football, ufc, racing, tennis, basketball, hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, or boxing. Omit if unsure - every sport is searched in turn.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_player_profile',
    description: 'Look up bio and physical stats for a real player/athlete by name. Use this whenever the user asks about a specific player.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The player or athlete\'s name' } },
      required: ['name']
    }
  },
  {
    name: 'get_recent_news',
    description:
      'Get CURRENT sports news headlines from live BBC Sport / Sky Sports feeds, optionally filtered by a team, player, or keyword. Use this for anything about current form, injuries, team news, transfers, recent results, or "what\'s the latest on X" - your own training knowledge has a cutoff and will not know this week\'s news, so check here before speaking about anything current, and cite a headline when you lean on one.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional team/player/keyword to filter headlines by, e.g. "Arsenal", "Verstappen". Omit for the top general sports headlines.'
        }
      }
    }
  },
  {
    name: 'get_recent_results',
    description:
      'Get recent COMPLETED results (final scores) for a sport over the last few days. Use this to talk about current form with concrete scorelines rather than guessing. sport is one of: football, ufc, tennis, basketball, hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket - defaults to football if omitted.',
    input_schema: {
      type: 'object',
      properties: {
        sport: { type: 'string', description: 'Sport key, e.g. "football", "basketball", "nfl". Defaults to football.' }
      }
    }
  },
  {
    name: 'get_team_form',
    description:
      "One team's recent form - their completed results over the last few days, name-matched and summarised: won/drawn/lost, goals for and against, and each result with the opponent and whether it was home or away. Use it when the user asks how a specific team is doing (\"how are Arsenal doing\", \"is Liverpool in form\", \"should I back Newcastle\") so you can answer with concrete recent scorelines instead of guessing. Scope is only the last few days (our results data doesn't go back a full season), so for a fuller form guide or head-to-head history, follow up with web_search. Returns { available: false } when no recent completed game is found for that team - say so and reach for web_search.",
    input_schema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'The team name, as full as you can - e.g. "Arsenal", "Manchester United", "Newcastle United".' },
        sport: { type: 'string', description: 'Sport key, e.g. "football", "basketball", "nfl". Defaults to football.' }
      },
      required: ['team']
    }
  },
  {
    name: 'get_my_record',
    description:
      'The signed-in user\'s OWN betting record from their BetMates tracker - the one thing no other AI can see. Returns their settled bets: win/loss/void counts and hit rate, total staked vs returned, net profit/loss and ROI, a breakdown by sport and by market type, and their most recent settled results. Reach for it on ANY personal question - "how am I doing", "am I any good at X", "should I keep backing overs", "am I up or down" - and before giving a personalised staking or strategy steer, so the advice is grounded in what they ACTUALLY bet rather than generic theory. Returns { available: false } when the user is not signed in or has no settled bets yet.',
    input_schema: {
      type: 'object',
      properties: {
        sport: {
          type: 'string',
          description: 'Optional sport filter: football, ufc, racing, tennis, basketball, hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, or boxing. Omit for their whole record across every sport.'
        }
      }
    }
  },
  {
    name: 'get_coach_record',
    description:
      'YOUR OWN tipster record - how the picks you have locked in for this user have actually settled. Returns your won/lost/void counts, hit rate, net units up or down, ROI at level stakes, and a breakdown by sport. Reach for it whenever the user asks how your tips have done ("what\'s your record", "are your picks any good", "how are you doing this season") and any time you want to be honest about your own track record before doubling down on a new lean. Returns { available: false } when the user is not signed in or you have no settled picks for them yet - say so plainly rather than guessing.',
    input_schema: {
      type: 'object',
      properties: {
        sport: {
          type: 'string',
          description: 'Optional sport filter, e.g. football, ufc, racing, tennis, basketball. Omit for your whole record across every sport.'
        }
      }
    }
  },
  {
    name: 'get_my_open_bets',
    description:
      "The signed-in user's bets that are still OPEN (unsettled) on their BetMates tracker - the positions they've got running right now. Returns each open slip's selections, stake and potential return, plus the count and total staked. Reach for it before you recommend anything, so you can factor in what they're already on: don't hand them a pick they've already backed, warn if a new lean would pile more onto an event they're heavily exposed to, and tailor the steer to their live slips. Returns { available: false } when the user isn't signed in or has nothing open.",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_my_group_standings',
    description:
      "Where the signed-in user sits on their groups' leaderboards. For each group they're ranked in, returns their rank and net profit, the group size, who's leading and by how much, and the mate one place ahead of them (the next one to catch). Reach for it on anything social about their standing - \"how am I doing in my group\", \"am I winning\", \"who's beating me\", \"how far behind am I\" - and to add a competitive nudge to a session. These are the same group leaderboards every member already sees in-app, so it's fine to name a group-mate and their group profit from this. Returns { available: false } when the user isn't signed in or has no settled group bets yet.",
    input_schema: { type: 'object', properties: {} }
  },
  // Anthropic-hosted server tool, not one of ours - the API runs the actual
  // search and hands the result (with citations) back inside the same
  // response, so unlike the tools above it never reaches callTool.
  { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }
]

// Not offered to the model as a free choice - see lockInRecommendation
// below for why. `hasPick` is required so the model has a clean way to
// say "no real pick here" without needing every other field optional to
// carry that meaning; the identity fields only matter when hasPick is true.
const RECOMMENDATION_TOOL = {
  name: 'lock_in_recommendation',
  description: 'Record whether your last reply named one specific selection as your lean, and if so, which one.',
  input_schema: {
    type: 'object',
    properties: {
      hasPick: {
        type: 'boolean',
        description: 'True only if your last reply named ONE specific selection as a lean. False for a clarifying question, background-only answer, or no real pick.'
      },
      eventId: { type: 'string', description: 'For a fixture/fight/event outcome - the id find_fixture returned' },
      marketKey: { type: 'string', description: 'For a fixture/fight/event outcome - e.g. "h2h"' },
      outcomeName: { type: 'string', description: 'For a fixture/fight/event outcome - the exact selection name, e.g. a team name or "Draw"' },
      raceId: { type: 'string', description: 'For a horse racing runner instead' },
      horseId: { type: 'string', description: 'For a horse racing runner instead' }
    },
    required: ['hasPick']
  }
}

// Recover the full priced leg for a lock_in_recommendation by matching its bare
// identity fields against the grounding the handler accumulated (legs built from
// the RAW fixture/runner objects). Pure logic, kept here (imported by the Netlify
// function) so it's unit-tested under src.
//
// The fragile part is the fixture selection NAME. The tool asks the model for
// "the exact selection name" - a team name / "Draw" phrased the way it wrote it
// in prose - and it cannot be trusted to echo groundFixtureOutcomes' exact
// `selection` string: casing, punctuation, stray spaces, or a suffix ("Arsenal"
// vs "Arsenal FC"). A strict `leg.selection === outcomeName` equality silently
// dropped correct picks over exactly that (confirmed live). So: narrow to the
// legs sharing the model's eventId + marketKey first (a reliable opaque-id
// match), then within that small set (2-3 outcomes: home/away/draw) resolve the
// outcome by name - exact, then normalised-equal (case/space/punctuation-
// insensitive), then a UNIQUE normalised substring either way. Scoped to one
// event+market so a fuzzy compare can never cross to a different fixture, and a
// genuinely ambiguous case (a Manchester derby where "Manchester" matches both
// sides) resolves to null rather than mis-logging. This fixes MECHANICAL drift,
// not colloquial nicknames the prose might use ("Spurs" for Tottenham) - those
// need a constrained-choice classifier, noted as a follow-up. Racing uses opaque
// raceId/horseId (summariseRunner echoes them precisely), so it stays exact.
const normaliseSelection = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export function matchRecommendation(recommendation, grounding) {
  if (!recommendation || !grounding?.length) return null
  if (recommendation.raceId) {
    return grounding.find((leg) => leg.raceId === recommendation.raceId && leg.horseId === recommendation.horseId) ?? null
  }
  if (!recommendation.eventId) return null
  const inScope = grounding.filter(
    (leg) => leg.eventId === recommendation.eventId && leg.marketKey === recommendation.marketKey
  )
  if (!inScope.length) return null
  const exact = inScope.find((leg) => leg.selection === recommendation.outcomeName)
  if (exact) return exact
  const want = normaliseSelection(recommendation.outcomeName)
  if (!want) return null
  const normEqual = inScope.filter((leg) => normaliseSelection(leg.selection) === want)
  if (normEqual.length === 1) return normEqual[0]
  const contained = inScope.filter((leg) => {
    const ln = normaliseSelection(leg.selection)
    return ln.includes(want) || want.includes(ln)
  })
  return contained.length === 1 ? contained[0] : null
}

// One request to a specific model. Returns { data } on success or
// { error: { status, type, detail } } on any non-2xx / network failure -
// callers distinguish "this model isn't available" (fall back) from "the key
// is bad / we're rate limited" (stop and report) via the status/type.
// Confirmed live: without this, CoachGPT's first move on a "this season"
// question is often a real web_search just to establish today's date/season
// (its training data has a cutoff and it has no other way to know) - slow
// enough to trigger Anthropic's own long-search pause_turn behaviour, which
// this turn loop doesn't specially handle, so the partial pre-search text
// gets mistaken for a finished reply and cuts off mid-sentence. Telling it
// the date directly removes the need for that search entirely. Computed
// fresh per call (cheap) rather than baked into COACHGPT_SYSTEM at module
// load, since a serverless module can stay warm across real calendar days.
function systemPromptFor() {
  return `${COACHGPT_SYSTEM}\n\nToday's date is ${new Date().toISOString().slice(0, 10)}.`
}

async function callClaudeModel(apiKey, model, messages, extra, route) {
  try {
    const { url, headers, body } = buildAnthropicRequest(apiKey, model, {
      // Was 800, briefly tried 1600 and 1100 - both let a real deep-dive
      // reply either blow the ~30s edge inactivity timeout or, worse, run
      // out of budget and cut off mid-sentence with no error (confirmed
      // live both ways). 950 leaves real margin under the timeout; the
      // Format section below and systemPromptFor's date are what actually
      // keep a deep answer substantive AND complete rather than trying to
      // fill the ceiling or burning a slow search on the calendar.
      max_tokens: 950,
      // Confirmed live via debug logging: extended thinking was firing on
      // these calls despite nothing here ever requesting it, and thinking
      // tokens share the SAME max_tokens ceiling as the visible reply - one
      // forced-fallback call spent 192 of its 194 output tokens on an
      // invisible thinking block, leaving an empty string as the actual
      // answer (surfaced to the user as "couldn't get a straight answer",
      // indistinguishable from the coach going silent). It also just costs
      // real generation time for a chat reply nobody reads the reasoning
      // trace of. Explicitly disabled so every token goes to the answer.
      thinking: { type: 'disabled' },
      // Fixed low temperature for reproducible picks (see COACH_TEMPERATURE).
      // Before `...extra` so a caller can still override it - the lock-in
      // classifier passes temperature: 0 to run fully deterministic.
      temperature: COACH_TEMPERATURE,
      system: systemPromptFor(),
      messages,
      ...extra
    }, route)
    const res = await fetch(url, { method: 'POST', headers, body })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      let type = ''
      try {
        type = JSON.parse(detail)?.error?.type ?? ''
      } catch {
        // non-JSON error body (proxy/gateway HTML) - status alone classifies it
      }
      console.error(`coachgpt: Anthropic ${res.status} on ${model}: ${detail.slice(0, 300)}`)
      return { error: { status: res.status, type, detail } }
    }
    return { data: await res.json() }
  } catch (err) {
    console.error(`coachgpt: request to ${model} failed:`, err.message)
    return { error: { status: 0, type: 'network', detail: err.message } }
  }
}

// A model-not-available failure (only THAT model is the problem) - fall back
// to the next model. Anything else (401 bad key, 429 rate limit, 5xx, network)
// fails the same on every model, so it should stop and be reported, not mask
// itself by cycling through models.
function isModelAvailabilityError(error) {
  return error.status === 404 || /not_found|model/i.test(error.type ?? '')
}

// Maps a hard failure to a short, stable code the UI can branch on without
// leaking raw provider detail to end users.
function classifyError(error) {
  if (!error) return 'upstream'
  if (error.status === 401 || error.status === 403) return 'auth'
  if (isModelAvailabilityError(error)) return 'model'
  if (error.status === 429) return 'rate_limit'
  return 'upstream'
}

// Builds a caller bound to one API key that walks COACHGPT_MODELS. Once a
// model answers, it's pinned for the rest of the turn so the (up to five)
// sequential calls in a single turn don't each re-probe a dead preferred
// model. Returns the same { data } | { error } shape as callClaudeModel.
function makeCaller(apiKey, route) {
  let chosen = null
  return async (messages, extra) => {
    const models = chosen ? [chosen] : COACHGPT_MODELS
    let lastError = null
    for (const model of models) {
      const result = await callClaudeModel(apiKey, model, messages, extra, route)
      if (result.data) {
        chosen = model
        return { data: result.data }
      }
      lastError = result.error
      if (!isModelAvailabilityError(result.error)) break
    }
    return { error: lastError }
  }
}

// web_search responses interleave multiple text blocks - e.g. a short
// "I'll check that" before the server_tool_use/web_search_tool_result pair,
// then the real cited answer after it (see Anthropic's web search tool
// docs) - so the reply is every text block in order, not just the first
// one. Plain-tool-only turns still have exactly one text block, so this is
// a no-op for them.
function extractText(content) {
  const text = (content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  return text || null
}

// A plain "call this tool whenever relevant" instruction turned out
// unreliable in practice: lock_in_recommendation has zero effect on what
// the user sees, and Claude would consistently skip it even for replies
// that named one clear pick in plain English (verified live - see PR/
// commit history). Forcing it via tool_choice as a separate, mandatory
// follow-up call - after the real answer is already decided - removes
// that judgement call entirely: the model can still opt out cleanly via
// hasPick: false, but it can no longer just forget to mention a pick.
// Costs one extra Anthropic request per turn; only made when there's a
// real answer to classify.
//
// Deliberately its own small model and short system prompt, not the pinned
// main-turn model/COACHGPT_SYSTEM - classifying one already-written reply
// needs none of the big coach persona prompt or Opus/Sonnet-level reasoning,
// and this call runs on EVERY successful turn, unconditionally, inside the
// same synchronous ~30s edge budget the main turn already ate into (see
// MAX_TOOL_ROUNDS/WEB_SEARCH_MAX_USES comments above) - a real reply that
// took 20+ seconds getting there had no margin left for a slow follow-up.
const LOCK_IN_MODEL = 'claude-haiku-4-5-20251001'
const LOCK_IN_SYSTEM =
  'You classify one already-written reply from a sports-betting chat assistant. Read it and call lock_in_recommendation: did it name ONE specific selection as its lean?'

// Only ever a handful of fixtures get grounded in a turn; cap the list handed to
// the classifier so a very broad "best value this weekend" (which can ground
// many legs) can't bloat the follow-up call's input.
const LOCK_IN_MAX_CANDIDATES = 24

// The classifier reads the PROSE reply, which is where nicknames live - the coach
// writes "Spurs", "Wolves", "the Gunners", not "Tottenham Hotspur". Left to free-
// type the selection name it echoes the nickname, which then can't be matched
// back to the canonical grounded selection. So when we have the grounding (the
// real legs the turn looked up), we show the classifier that exact list and tell
// it to copy the identity fields of the ONE it leaned toward verbatim - it can
// see both the nickname in its reply and the canonical name here, and reconcile
// them itself. This is what actually resolves nicknames; matchRecommendation's
// fuzzy fallback stays as a safety net for mechanical drift. Returns null when
// there's nothing grounded (a general question) - then the classifier just judges
// hasPick from the prose as before, and an empty-grounding match is null anyway.
export function formatLockInCandidates(grounding) {
  if (!grounding?.length) return null
  const lines = grounding.slice(0, LOCK_IN_MAX_CANDIDATES).map((leg) => {
    const priced = leg.odds ? `, ${leg.odds}` : ''
    return leg.raceId
      ? `- selection="${leg.selection}" raceId=${leg.raceId} horseId=${leg.horseId}  (${leg.event}${priced})`
      : `- selection="${leg.selection}" eventId=${leg.eventId} marketKey=${leg.marketKey}  (${leg.event}${priced})`
  })
  return lines.join('\n')
}

async function lockInRecommendation(apiKey, messages, text, route, grounding) {
  const candidates = formatLockInCandidates(grounding)
  const instruction = candidates
    ? 'Call lock_in_recommendation now. These are the ONLY selections you can lock in - if your reply leaned on one of them, set hasPick true and copy ITS identity fields (selection + eventId/marketKey, or selection + raceId/horseId) EXACTLY as written below, even if your reply named it by a nickname or short name. If your lean is not in this list, or you made no single pick, set hasPick false.\n' +
      candidates
    : 'Call lock_in_recommendation now to record whether your reply above named one specific selection as your lean.'
  const followUp = [
    ...messages,
    { role: 'assistant', content: text },
    { role: 'user', content: instruction }
  ]
  const { data } = await callClaudeModel(apiKey, LOCK_IN_MODEL, followUp, {
    system: LOCK_IN_SYSTEM,
    max_tokens: 200,
    // Deterministic: this only classifies an already-written reply, so the
    // recorded pick must never disagree with itself for the same text.
    temperature: 0,
    tools: [RECOMMENDATION_TOOL],
    tool_choice: { type: 'tool', name: 'lock_in_recommendation' }
  }, route)
  const block = data?.content?.find((b) => b.type === 'tool_use' && b.name === 'lock_in_recommendation')
  return block?.input?.hasPick ? block.input : null
}

// history: [{ role: 'user'|'assistant', content: string }] - prior turns
// of this conversation, oldest first. message: the new user message.
// callTool: async (name, input) => JSON-serialisable result.
// Returns { text, recommendation, error }. text is the final assistant reply
// (null only when the Anthropic request itself failed outright; a vague/broad
// question that eats the whole tool-round budget still gets a real answer, see
// the forced no-tools call below). error is null on success, otherwise a short
// code ('auth' | 'model' | 'rate_limit' | 'upstream' | 'no_key') the UI can
// use to tell "the coach is misconfigured / temporarily down" apart from
// "answered fine" - critical because a swallowed API failure used to surface
// as an empty reply that wrongly blamed the user's phrasing. recommendation is
// lock_in_recommendation's raw input, or null if it found no real pick.
// getGrounding, if passed, is a () => leg[] the caller uses to expose the legs
// its callTool accumulated this turn (the handler builds them from find_fixture's
// results). Read just before the lock-in follow-up so the classifier can be shown
// the real selections and reconcile any nickname in the prose against them. Absent
// (older callers, tests), the lock-in behaves exactly as before.
export async function runCoachGptTurn({ apiKey, history, message, callTool, route, getGrounding }) {
  if (!apiKey) return { text: null, recommendation: null, error: 'no_key' }

  const call = makeCaller(apiKey, route)
  const messages = [...(history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

  let text = null
  let failure = null
  let truncated = false
  for (let round = 0; round < MAX_TOOL_ROUNDS && text === null; round++) {
    const { data, error } = await call(messages, { tools: COACHGPT_TOOLS })
    if (error) {
      failure = error
      break
    }

    const content = data.content ?? []
    if (data.stop_reason !== 'tool_use') {
      text = extractText(content)
      truncated = data.stop_reason === 'max_tokens'
      break
    }

    messages.push({ role: 'assistant', content })
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use')
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result
        try {
          result = await callTool(block.name, block.input)
        } catch (err) {
          result = { error: err.message }
        }
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result ?? {}) }
      })
    )
    messages.push({ role: 'user', content: toolResults })
  }

  // Round budget ran out while Claude was still reaching for tools - this
  // is what used to surface as "the coach just doesn't reply" for broad
  // questions ("best value bet this weekend") with no single team/fighter/
  // horse to anchor a lookup on. Strip the tools and force one last call
  // so it has to answer in text from whatever it's already gathered,
  // rather than leaving the user with nothing.
  if (!failure && text === null) {
    const { data, error } = await call(messages, {})
    if (error) failure = error
    else {
      text = extractText(data?.content)
      truncated = data?.stop_reason === 'max_tokens'
    }
  }

  if (failure) return { text: null, recommendation: null, error: classifyError(failure) }

  // Confirmed live: a genuinely thorough multi-part deep-dive can still hit
  // max_tokens mid-sentence despite the Format section's budget guidance -
  // models don't track their own remaining length precisely, so prompt
  // wording alone doesn't reliably self-enforce a hard cap. Rather than let
  // a reply silently trail off looking broken, say so - stop_reason is the
  // one signal that's actually reliable here.
  if (truncated && text) {
    text += "\n\n*(Ran long and got cut off there, champ - ask me to keep going and I'll pick up where I left off.)*"
  }

  const grounding = typeof getGrounding === 'function' ? getGrounding() : null
  const recommendation = text ? await lockInRecommendation(apiKey, messages, text, route, grounding) : null
  return { text, recommendation, error: null }
}
