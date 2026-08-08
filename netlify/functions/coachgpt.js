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
    valueEdge: computeBestValue(runner.allOdds)
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

async function toolFindFixture(siteUrl, { query, sport }) {
  const normalisedSport = sport && SPORT_ORDER.includes(sport) ? sport : null
  let result = normalisedSport ? await searchSport(siteUrl, normalisedSport, query) : null

  // No sport specified (or nothing found in the one given) - try every
  // sport this tool covers in turn, stopping at the first with a hit,
  // rather than assuming football and coming back empty for anything else.
  if (!result) {
    for (const key of SPORT_ORDER) {
      if (key === normalisedSport) continue
      result = await searchSport(siteUrl, key, query)
      if (result) break
    }
  }
  if (!result) return { found: false }

  if (result.kind === 'racing') {
    const topScore = result.matches[0].score
    const leaders = result.matches.filter((m) => m.score === topScore)
    return {
      found: true,
      sport: 'racing',
      // A single race naturally returns every runner tied on a course/
      // race-name match (see matchRaceQuery) - that's not ambiguity the
      // way two different fixtures matching equally is, it's "here's the
      // field", so only flag ambiguous when the leaders are from
      // different races entirely.
      ambiguous: new Set(leaders.map((m) => m.race.id)).size > 1,
      matches: leaders.map((m) => summariseRunner(m.race, m.runner))
    }
  }

  const topScore = result.matches[0].score
  const leaders = result.matches.filter((m) => m.score === topScore)
  return {
    found: true,
    ambiguous: leaders.length > 1,
    matches: leaders.map((m) => summariseFixture(m.fixture))
  }
}

async function toolGetPlayerProfile(name) {
  const profile = await getPlayerProfile(name)
  return profile ?? { found: false }
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

  const callTool = async (name, input) => {
    if (name === 'find_fixture') return toolFindFixture(siteUrl, input)
    if (name === 'get_player_profile') return toolGetPlayerProfile(input.name)
    return { error: `Unknown tool: ${name}` }
  }

  const reply = await runCoachGptTurn({ apiKey, history: body?.history, message, callTool })
  return json({ configured: true, reply })
}
