// CoachGPT chat proxy - unlike coach.js this needs no Supabase access and
// no auth check at all: the client sends its own recent conversation
// turns (same trust level as the stats summary coach.js already accepts
// as-is) and the new message, this function talks to Claude (with tool
// use) and returns the reply text. Persistence of the conversation is the
// client's job via the ordinary data layer (dataStore.js's
// listCoachMessages/addCoachMessage), not this function's.
//
// Missing ANTHROPIC_API_KEY degrades like every other proxy here:
// { configured: false } at HTTP 200, never a crash.
import { runCoachGptTurn } from '../../src/lib/coachgpt.js'
import { matchFixtureQuery, matchRaceQuery } from '../../src/utils/matchFixtureQuery.js'
import { computeBestValue } from '../../src/utils/bestValue.js'
import { getPlayerProfile } from '../../src/lib/playerProfile.js'
import { GENERIC_SPORTS } from '../../src/lib/sportsConfig.js'

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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ configured: false })

  let body
  try {
    body = await req.json()
  } catch {
    return json({ configured: true, error: 'Bad request body' }, 400)
  }

  const message = body?.message?.trim()
  if (!message) return json({ configured: true, error: 'Missing message' }, 400)

  const siteUrl = process.env.URL || new URL(req.url).origin

  // Last find_fixture call's grounding wins - if the model calls it again
  // later in the same turn (a clarifying re-search, say) that's a better
  // signal of what the final reply is actually about than an earlier call.
  let lastGrounding = null
  const callTool = async (name, input) => {
    if (name === 'find_fixture') {
      const groundingOut = {}
      const result = await toolFindFixture(siteUrl, input, groundingOut)
      lastGrounding = groundingOut.value ?? null
      return result
    }
    if (name === 'get_player_profile') return toolGetPlayerProfile(input.name)
    return { error: `Unknown tool: ${name}` }
  }

  const { text, recommendation } = await runCoachGptTurn({ apiKey, history: body?.history, message, callTool })
  // A follow-up like "who do you like there?" often answers straight from
  // `history` without calling find_fixture again this turn, leaving
  // lastGrounding null even though the reply clearly leans on a fixture
  // looked up earlier - fall back to the grounding the client carried over
  // from that earlier message so lock_in_recommendation still has
  // something real to match against. The "Log this" row on THIS message
  // stays tied to this turn's own lookup only (lastGrounding, unseeded) -
  // no fallback there, so it never shows stale legs under a reply that
  // didn't itself look anything up.
  const matchGrounding = lastGrounding ?? body?.priorGrounding ?? null
  return json({
    configured: true,
    reply: text,
    grounding: text ? lastGrounding : null,
    recommendation: matchRecommendation(recommendation, matchGrounding)
  })
}
