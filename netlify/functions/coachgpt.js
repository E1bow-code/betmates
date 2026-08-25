// CoachGPT chat proxy - the client sends its own recent conversation turns
// (same trust level as the stats summary coach.js already accepts as-is)
// and the new message, this function talks to Claude (with tool use) and
// returns the reply text. Persistence of the conversation is the client's
// job via the ordinary data layer (dataStore.js's
// listCoachMessages/addCoachMessage), not this function's.
//
// Missing COACH_ANTHROPIC_KEY degrades like every other proxy here:
// { configured: false } at HTTP 200, never a crash.
//
// Named COACH_ANTHROPIC_KEY, not ANTHROPIC_API_KEY - Netlify's AI Gateway
// silently intercepts the latter name in local `netlify dev` and swaps in
// its own short-lived proxy token, which this function then sends straight
// to api.anthropic.com and gets a real 401 back. Confirmed live: the
// intercepted value was a fresh ~413-char JWT every dev-server restart,
// completely invisible in netlify dev's own env-injection log (it's
// neither the .env.local value nor the dashboard value). Production was
// never affected - the interception is local-dev-only - but the rename
// avoids the collision everywhere rather than just working around it locally.
//
// One real auth check DOES exist here now (P2-M): the free/Plus message
// allowance needs to know who's asking, so the client sends its Supabase
// access token and this function creates a client authenticated AS that
// user (Authorization header, not the service-role key) - RLS's own
// "user reads own profile"/"user reads own coach messages" policies do
// the actual access control, no admin client needed for a read-only check.
import { createClient } from '@supabase/supabase-js'
import { runCoachGptTurn } from '../../src/lib/coachgpt.js'
import { matchFixtureQuery, matchRaceQuery, startsWithinHours } from '../../src/utils/matchFixtureQuery.js'
import { computeBestValue } from '../../src/utils/bestValue.js'
import { getPlayerProfile } from '../../src/lib/playerProfile.js'
import { GENERIC_SPORTS, apiKeysForSport, sgoLeagueForSport } from '../../src/lib/sportsConfig.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const FREE_MONTHLY_MESSAGE_LIMIT = 10

// Missing Supabase config means local/no-backend mode, which was never
// metered in the first place - degrades to "unlimited" same as every
// other proxy's missing-API-key contract.
//
// A missing/invalid accessToken on an otherwise-configured (real,
// deployed) backend is a DIFFERENT case and must NOT take the same
// unlimited path - this function is reachable directly over HTTP by
// anyone, not just through the app's own UI, so "no token" here means
// "unauthenticated caller", not "local dev". This used to return
// `limited: false` for both cases, which meant simply omitting
// accessToken from the request body (or sending a garbage/expired one)
// bypassed the free/Plus message cap entirely - confirmed live, an
// unauthenticated curl to this endpoint got a real Claude reply with no
// allowance check at all. Fails closed now: anything that isn't a real,
// currently-valid session is treated as at the limit.
async function checkMessageAllowance(accessToken) {
  if (!SUPABASE_URL || !ANON_KEY) return { limited: false }
  if (!accessToken) return { limited: true }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) return { limited: true }

  const { data: profile } = await userClient.from('profiles').select('is_premium').eq('id', userData.user.id).single()
  if (profile?.is_premium) return { limited: false }

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)
  const { count } = await userClient
    .from('coach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id)
    .eq('role', 'user')
    .gte('created_at', startOfMonth.toISOString())

  return { limited: (count ?? 0) >= FREE_MONTHLY_MESSAGE_LIMIT }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Trims a fixture down to what the model actually needs - full market
// data (every bookmaker's price on every market) would burn a lot of
// tokens for signal the model shouldn't be doing its own arithmetic on
// anyway; the value edges are computed here, once, so the model only
// ever sees numbers this codebase has already verified.
function summariseFixture(fixture) {
  const h2h = fixture.markets?.find((m) => m.key === 'h2h')
  const valueEdges = (h2h?.outcomes ?? [])
    .map((outcome) => {
      const value = computeBestValue(outcome.allOdds)
      return value && { selection: outcome.name, ...value, bestBookmaker: outcome.bestOdds?.bookmaker }
    })
    .filter(Boolean)

  return {
    id: fixture.id,
    competition: fixture.competition,
    homeTeam: fixture.homeTeam ?? fixture.participantA ?? fixture.fighterA,
    awayTeam: fixture.awayTeam ?? fixture.participantB ?? fixture.fighterB,
    kickoff: fixture.kickoff,
    h2hPrices: (h2h?.outcomes ?? []).map((o) => ({ selection: o.name, bestPrice: o.bestOdds?.decimal, bookmaker: o.bestOdds?.bookmaker })),
    valueEdges
  }
}

// A matched runner, trimmed the same way summariseFixture trims a fixture -
// the value edge is computed here (reusing the exact same computeBestValue
// the Odds tab's own "value on the board" flag uses) rather than handing
// the model a raw allOdds array to reason about itself.
//
// raceId/horseId are real ids, not shown for the model to describe the
// runner (course/raceName/horse already cover that) - they're here purely
// so lock_in_recommendation's forced follow-up call has real values to
// echo back. Without them the model had nothing but the human-readable
// race name and horse name to fill those fields with, which never matched
// groundRunner's actual raceId/horseId and silently dropped every racing
// recommendation - confirmed live via a debug field on a real call.
function summariseRunner(race, runner) {
  return {
    course: race.course,
    raceName: race.raceName,
    offTime: race.offTime,
    horse: runner.name,
    jockey: runner.jockey,
    trainer: runner.trainer,
    bestPrice: runner.bestOdds?.decimal,
    bestBookmaker: runner.bestOdds?.bookmaker,
    valueEdge: computeBestValue(runner.allOdds),
    raceId: race.id,
    horseId: runner.id
  }
}

// Builds real BetSlip legs (the shape FixtureDetailPage.jsx's own `pick()`
// builds) from the RAW fixture/runner objects - not the trimmed summaries
// above, which drop fields (bookmaker deep link, race/runner id) the model
// doesn't need but the client does to pre-fill "Log this". Kept separate
// from summariseFixture/summariseRunner so what Claude sees never grows
// just because the client needs more; this never reaches Claude at all.
function groundFixtureOutcomes(fixture, sportKey) {
  const h2h = fixture.markets?.find((m) => m.key === 'h2h')
  if (!h2h) return null
  const homeTeam = fixture.homeTeam ?? fixture.participantA ?? fixture.fighterA
  const awayTeam = fixture.awayTeam ?? fixture.participantB ?? fixture.fighterB
  const legs = (h2h.outcomes ?? [])
    .map((outcome) => {
      const best = outcome.bestOdds
      if (!best) return null
      return {
        event: `${homeTeam} v ${awayTeam}`,
        market: h2h.label,
        selection: outcome.name === 'Home' ? homeTeam : outcome.name === 'Away' ? awayTeam : outcome.name,
        odds: best.decimal,
        bookmaker: best.bookmaker,
        link: best.link,
        linkIsBetslip: best.isBetslipLink,
        sport: sportKey,
        kickoff: fixture.kickoff,
        eventId: fixture.id,
        marketKey: 'h2h',
        outcomeName: outcome.name
      }
    })
    .filter(Boolean)
  return legs.length ? legs : null
}

function groundRunner(race, runner) {
  if (!runner.bestOdds) return null
  return {
    event: `${race.course} - ${race.raceName}`,
    market: 'Win',
    selection: runner.name,
    odds: runner.bestOdds.decimal,
    bookmaker: runner.bestOdds.bookmaker,
    sport: 'racing',
    kickoff: race.offTime,
    runnerCount: race.runners.length,
    raceId: race.id,
    horseId: runner.id
  }
}

// Every sport this tool knows how to search, in the order a "no sport
// given" search tries them - football first since it's this app's primary
// sport, UFC/racing next since a fighter or horse name is unambiguous
// (unlike a one-word team query it'd be wasteful to try every generic
// sport for), then everything else GENERIC_SPORTS covers.
const SPORT_ORDER = ['football', 'ufc', 'racing', ...Object.keys(GENERIC_SPORTS)]

async function fetchJson(siteUrl, path) {
  try {
    const res = await fetch(`${siteUrl}${path}`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

function fetchListFor(siteUrl, sport) {
  if (sport === 'football') return fetchJson(siteUrl, '/api/odds')
  if (sport === 'ufc') return fetchJson(siteUrl, '/api/ufc')
  if (sport === 'racing') return fetchJson(siteUrl, '/api/racing')
  if (GENERIC_SPORTS[sport]) return fetchJson(siteUrl, `/api/sport?sport=${sport}`)
  return fetchJson(siteUrl, '/api/odds')
}

async function searchSport(siteUrl, sport, query) {
  if (sport === 'racing') {
    const races = await fetchListFor(siteUrl, sport)
    const matches = matchRaceQuery(races, query)
    return matches.length ? { kind: 'racing', matches } : null
  }
  const fixtures = await fetchListFor(siteUrl, sport)
  const matches = matchFixtureQuery(fixtures, query)
  return matches.length ? { kind: 'fixture', matches } : null
}

// groundingOut, if passed, gets a `.value` set to real BetSlip-ready legs
// for the match(es) this call resolved to - but only when unambiguous
// (nothing safe to pre-fill for "which Arsenal game"). Left untouched
// (not even set to null) on an ambiguous/not-found result, so the caller
// decides what "no grounding this call" means - see the handler below,
// which always overwrites on every find_fixture call so only the LAST
// call's result can ever be offered as "Log this".
async function toolFindFixture(siteUrl, { query, sport }, groundingOut) {
  const normalisedSport = sport && SPORT_ORDER.includes(sport) ? sport : null
  let matchedSport = normalisedSport
  let result = normalisedSport ? await searchSport(siteUrl, normalisedSport, query) : null

  // No sport specified (or nothing found in the one given) - try every
  // sport this tool covers in turn, stopping at the first with a hit,
  // rather than assuming football and coming back empty for anything else.
  if (!result) {
    for (const key of SPORT_ORDER) {
      if (key === normalisedSport) continue
      result = await searchSport(siteUrl, key, query)
      if (result) {
        matchedSport = key
        break
      }
    }
  }
  if (!result) return { found: false }

  if (result.kind === 'racing') {
    const topScore = result.matches[0].score
    const leaders = result.matches.filter((m) => m.score === topScore)
    // A single race naturally returns every runner tied on a course/
    // race-name match (see matchRaceQuery) - that's not ambiguity the
    // way two different fixtures matching equally is, it's "here's the
    // field", so only flag ambiguous when the leaders are from
    // different races entirely.
    const ambiguous = new Set(leaders.map((m) => m.race.id)).size > 1
    if (!ambiguous && groundingOut) groundingOut.value = leaders.map((m) => groundRunner(m.race, m.runner)).filter(Boolean)
    return {
      found: true,
      sport: 'racing',
      ambiguous,
      matches: leaders.map((m) => summariseRunner(m.race, m.runner))
    }
  }

  const topScore = result.matches[0].score
  const leaders = result.matches.filter((m) => m.score === topScore)
  const ambiguous = leaders.length > 1
  if (!ambiguous && groundingOut) groundingOut.value = groundFixtureOutcomes(leaders[0].fixture, matchedSport ?? 'football')
  return {
    found: true,
    sport: matchedSport,
    ambiguous,
    matches: leaders.map((m) => summariseFixture(m.fixture))
  }
}

async function toolGetPlayerProfile(name) {
  const profile = await getPlayerProfile(name)
  return profile ?? { found: false }
}

// Current sports headlines (live BBC Sport / Sky Sports feeds via
// /api/sports-news), optionally filtered by a team/player/keyword - the
// model's own knowledge has a training cutoff, so this is how it talks about
// this week's form/injuries/results instead of guessing. A query with no hits
// falls back to the top general headlines with a note, rather than nothing.
async function toolGetNews(siteUrl, { query } = {}) {
  const items = await fetchJson(siteUrl, '/api/sports-news')
  if (!Array.isArray(items) || !items.length) return { headlines: [] }
  const q = (query ?? '').trim().toLowerCase()
  const matched = q ? items.filter((i) => i.title?.toLowerCase().includes(q)) : items
  const chosen = (matched.length ? matched : items).slice(0, 8).map((i) => ({ title: i.title, source: i.source }))
  return {
    headlines: chosen,
    note: q && !matched.length ? `No current headlines mention "${query}" - these are the top general sports headlines instead.` : undefined
  }
}

// Recent completed results (final scores) for a sport over the last few days,
// via /api/scores' completed-games path (the same data auto-settle reads) -
// concrete recent form to reason about, not just prices. Resolves the sport to
// its Odds API keys and/or SportsGameOdds league, exactly the way auto-settle
// and the Results tab do. Defaults to football, this app's primary sport.
async function toolGetResults(siteUrl, { sport } = {}) {
  const key = sport && SPORT_ORDER.includes(sport) ? sport : 'football'
  const params = new URLSearchParams()
  const keys = apiKeysForSport(key)
  if (keys.length) params.set('keys', keys.join(','))
  const league = sgoLeagueForSport(key)
  if (league) params.set('sgoLeague', league)
  if (![...params.keys()].length) return { sport: key, results: [] }

  const games = await fetchJson(siteUrl, `/api/scores?${params.toString()}`)
  const results = (Array.isArray(games) ? games : []).slice(0, 12).map((g) => {
    const home = g.scores?.find((s) => s.name === g.homeTeam)?.score
    const away = g.scores?.find((s) => s.name === g.awayTeam)?.score
    return { home: g.homeTeam, away: g.awayTeam, score: `${home}-${away}` }
  })
  return { sport: key, results }
}

// "What's on tonight/today" browses by TIME, unlike find_fixture which
// needs a name to search on and comes back empty for a bare time-word
// question (matchFixtureQuery's STOPWORDS deliberately strip "tonight"/
// "today" as name-search noise - confirmed live, CoachGPT had no way to
// actually answer "what sports on tonight"). 20 hours covers "tonight"/
// "today"/"this evening" without needing to reason about UK BST/GMT
// calendar-day boundaries exactly - anything 20+ hours out is squarely
// "later in the week" by any reasonable reading. Racing races get no
// upper bound since our racing data is structurally always today's card
// already (see COACHGPT_SYSTEM's own note) - just "hasn't run yet".
const UPCOMING_WINDOW_HOURS = 20
const UPCOMING_LIMIT = 15

function summariseUpcomingFixture(fixture, sportKey) {
  return {
    sport: sportKey,
    competition: fixture.competition,
    homeTeam: fixture.homeTeam ?? fixture.participantA ?? fixture.fighterA,
    awayTeam: fixture.awayTeam ?? fixture.participantB ?? fixture.fighterB,
    kickoff: fixture.kickoff
  }
}

async function toolListUpcoming(siteUrl, { sport } = {}) {
  const normalisedSport = sport && SPORT_ORDER.includes(sport) ? sport : null
  const sportsToCheck = normalisedSport ? [normalisedSport] : SPORT_ORDER
  const now = Date.now()

  const perSport = await Promise.all(
    sportsToCheck.map(async (key) => {
      if (key === 'racing') {
        const races = await fetchListFor(siteUrl, key)
        return (Array.isArray(races) ? races : [])
          .filter((race) => {
            const t = new Date(race.offTime).getTime()
            return !Number.isNaN(t) && t >= now
          })
          .map((race) => ({ sport: 'racing', course: race.course, raceName: race.raceName, offTime: race.offTime, runnerCount: race.runners?.length ?? 0 }))
      }
      const fixtures = await fetchListFor(siteUrl, key)
      return (Array.isArray(fixtures) ? fixtures : [])
        .filter((f) => startsWithinHours(f.kickoff, UPCOMING_WINDOW_HOURS, now))
        .map((f) => summariseUpcomingFixture(f, key))
    })
  )

  const events = perSport
    .flat()
    .sort((a, b) => new Date(a.kickoff ?? a.offTime).getTime() - new Date(b.kickoff ?? b.offTime).getTime())
    .slice(0, UPCOMING_LIMIT)

  return { count: events.length, events }
}

// lock_in_recommendation's tool input carries bare identity fields
// (eventId/marketKey/outcomeName, or raceId/horseId) - matched back
// against the last grounding array (built from the RAW fixture/runner
// objects, not the trimmed summary Claude sees) to recover the full
// priced leg: price, bookmaker, kickoff, etc. Storing that whole leg, not
// just the identity fields, is what lets the CoachGPT scoreboard later
// show what it actually recommended, not just settle it blind.
//
// recommendation.outcomeName is matched against leg.selection, NOT
// leg.outcomeName - confirmed live: the tool asks the model for "the
// exact selection name, e.g. a team name or Draw" (matching how it
// phrases its own prose reply), but groundFixtureOutcomes' outcomeName
// field holds the RAW h2h outcome key ("Home"/"Away"/"Draw"), while its
// selection field holds the translated team name/"Draw" the model
// actually returns. Matching against outcomeName silently dropped every
// recommendation until this was caught via a debug field on a live call.
function matchRecommendation(recommendation, grounding) {
  if (!recommendation || !grounding?.length) return null
  return (
    grounding.find((leg) => {
      if (recommendation.eventId) {
        return leg.eventId === recommendation.eventId && leg.marketKey === recommendation.marketKey && leg.selection === recommendation.outcomeName
      }
      if (recommendation.raceId) {
        return leg.raceId === recommendation.raceId && leg.horseId === recommendation.horseId
      }
      return false
    }) ?? null
  )
}

export default async (req) => {
  if (req.method !== 'POST') return json({ configured: true, error: 'POST only' }, 405)

  const apiKey = process.env.COACH_ANTHROPIC_KEY
  if (!apiKey) return json({ configured: false })

  let body
  try {
    body = await req.json()
  } catch {
    return json({ configured: true, error: 'Bad request body' }, 400)
  }

  const message = body?.message?.trim()
  if (!message) return json({ configured: true, error: 'Missing message' }, 400)

  const { limited } = await checkMessageAllowance(body?.accessToken)
  if (limited) return json({ configured: true, limited: true, reply: null, grounding: null, recommendation: null })

  const siteUrl = process.env.URL || new URL(req.url).origin

  // Every find_fixture call's grounding accumulates - a "best value this
  // weekend?" turn routinely looks up several fixtures before settling on
  // one as the actual lean, and that lean is very often NOT the last one
  // searched (confirmed live: a reply naming Newcastle as the pick after
  // Hull and Arsenal were checked and rejected first). Keeping only the
  // last call's grounding meant matchRecommendation had nothing to match
  // the real pick against whenever it wasn't the final lookup, silently
  // dropping the "Log this" row and the scoreboard entry for a pick the
  // model stated in plain English. Deduped by the same identity
  // LogThisRow keys on, so a fixture re-searched twice this turn (a
  // clarifying re-check) only offers one button, keeping the later
  // (fresher-priced) copy.
  let allGrounding = []
  const callTool = async (name, input) => {
    if (name === 'list_upcoming_events') return toolListUpcoming(siteUrl, input)
    if (name === 'find_fixture') {
      const groundingOut = {}
      const result = await toolFindFixture(siteUrl, input, groundingOut)
      if (groundingOut.value) allGrounding = [...allGrounding, ...groundingOut.value]
      return result
    }
    if (name === 'get_player_profile') return toolGetPlayerProfile(input.name)
    if (name === 'get_recent_news') return toolGetNews(siteUrl, input)
    if (name === 'get_recent_results') return toolGetResults(siteUrl, input)
    return { error: `Unknown tool: ${name}` }
  }

  const { text, recommendation, error } = await runCoachGptTurn({ apiKey, history: body?.history, message, callTool })
  const dedupedGrounding = allGrounding.length
    ? Array.from(new Map(allGrounding.map((leg) => [`${leg.selection}-${leg.eventId ?? leg.horseId ?? leg.event}`, leg])).values())
    : null
  // A follow-up like "who do you like there?" often answers straight from
  // `history` without calling find_fixture again this turn, leaving
  // dedupedGrounding null even though the reply clearly leans on a fixture
  // looked up earlier - fall back to the grounding the client carried over
  // from that earlier message so lock_in_recommendation still has
  // something real to match against. The "Log this" row on THIS message
  // stays tied to this turn's own lookups only (dedupedGrounding, unseeded) -
  // no fallback there, so it never shows stale legs under a reply that
  // didn't itself look anything up.
  const matchGrounding = dedupedGrounding ?? body?.priorGrounding ?? null
  return json({
    configured: true,
    reply: text,
    // A short failure code when the Anthropic call itself failed (bad/expired
    // key, model access, rate limit) rather than the model genuinely having
    // nothing to say - lets the client show "the coach is down" instead of the
    // misleading "couldn't get a straight answer, try rephrasing".
    error: error ?? null,
    grounding: text ? dedupedGrounding : null,
    recommendation: matchRecommendation(recommendation, matchGrounding)
  })
}
