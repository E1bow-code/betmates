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

export const COACHGPT_MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOOL_ROUNDS = 3

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
  'this week\'s form, injuries, results, or prices - so you have three tools;',
  'reach for the right one before answering ANY question about something',
  'current, even if you think you already know:',
  '- find_fixture(query, sport?): looks up a specific upcoming fixture,',
  '  fight, or horse race and its prices, including pre-computed value',
  '  edges (where the best price beats the market average by a meaningful',
  '  margin). Covers football/tennis/UFC/other team sports AND horse',
  '  racing (search a course, race name, or horse - it\'ll return the field).',
  '  sport, if given, is one of: football, ufc, racing, tennis, basketball,',
  '  hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, boxing. Omit it',
  '  if you\'re not sure - every sport gets searched in turn.',
  '- get_player_profile(name): looks up bio/physical stats for a real',
  '  player or athlete.',
  '- get_recent_news(query?): pulls CURRENT sports headlines (live BBC Sport /',
  '  Sky Sports feeds), optionally filtered by a team/player/keyword. Use it',
  '  for anything about current form, injuries, team news, results, or "what\'s',
  '  the latest on X" - this is how you stay current instead of guessing from',
  '  stale training data. Cite a headline when you lean on it.',
  '',
  'Hard rules:',
  '- You ARE allowed to name a selection and give a real lean ("I\'d go with',
  '  X here") - unlike the reflective Coach card elsewhere in this app.',
  '- Every lean about a PRICE must cite the concrete numbers a tool actually',
  '  returned (price, bookmaker, % edge). Never invent a number, a price, or',
  '  odds - if a tool didn\'t hand you a figure, don\'t state one.',
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
  'Format: short, punchy replies (2-5 sentences, or a couple of tight bullets',
  'for a multi-part answer). No preamble, no sign-off. American English,',
  'confident coach\'s tone - you have an opinion, and you back it up, but',
  'you\'re not vague or hedging about things you\'re actually sure of.'
].join('\n')

export const COACHGPT_TOOLS = [
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
  }
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

async function callClaude(apiKey, messages, extra) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: COACHGPT_MODEL,
        max_tokens: 800,
        system: COACHGPT_SYSTEM,
        messages,
        ...extra
      })
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`coachgpt: Anthropic ${res.status}: ${detail.slice(0, 300)}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('coachgpt: request failed:', err.message)
    return null
  }
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
async function lockInRecommendation(apiKey, messages, text) {
  const followUp = [
    ...messages,
    { role: 'assistant', content: text },
    {
      role: 'user',
      content:
        'Call lock_in_recommendation now to record whether your reply above named one specific selection as your lean.'
    }
  ]
  const data = await callClaude(apiKey, followUp, { tools: [RECOMMENDATION_TOOL], tool_choice: { type: 'tool', name: 'lock_in_recommendation' } })
  const block = data?.content?.find((b) => b.type === 'tool_use' && b.name === 'lock_in_recommendation')
  return block?.input?.hasPick ? block.input : null
}

// history: [{ role: 'user'|'assistant', content: string }] - prior turns
// of this conversation, oldest first. message: the new user message.
// callTool: async (name, input) => JSON-serialisable result.
// Returns { text, recommendation } - text is the final assistant reply
// (null only if the Anthropic request itself failed outright - bad key,
// network error, etc; a vague/broad question that eats the whole
// tool-round budget still gets a real answer, see the forced no-tools
// call below). recommendation is lock_in_recommendation's raw input from
// the forced follow-up call below, or null if it found no real pick (or
// text itself is null).
export async function runCoachGptTurn({ apiKey, history, message, callTool }) {
  if (!apiKey) return { text: null, recommendation: null }

  const messages = [...(history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

  let text = null
  for (let round = 0; round < MAX_TOOL_ROUNDS && text === null; round++) {
    const data = await callClaude(apiKey, messages, { tools: COACHGPT_TOOLS })
    if (!data) return { text: null, recommendation: null }

    const content = data.content ?? []
    if (data.stop_reason !== 'tool_use') {
      text = content.find((b) => b.type === 'text')?.text?.trim() ?? null
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
  if (text === null) {
    const finalData = await callClaude(apiKey, messages, {})
    text = finalData?.content?.find((b) => b.type === 'text')?.text?.trim() ?? null
  }

  const recommendation = text ? await lockInRecommendation(apiKey, messages, text) : null
  return { text, recommendation }
}
