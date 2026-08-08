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
import { matchFixtureQuery } from '../../src/utils/matchFixtureQuery.js'
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
    homeTeam: fixture.homeTeam ?? fixture.participantA,
    awayTeam: fixture.awayTeam ?? fixture.participantB,
    kickoff: fixture.kickoff,
    h2hPrices: (h2h?.outcomes ?? []).map((o) => ({ selection: o.name, bestPrice: o.bestOdds?.decimal, bookmaker: o.bestOdds?.bookmaker })),
    valueEdges
  }
}

async function fetchFixtureList(siteUrl, sport) {
  const path = sport && sport !== 'football' && GENERIC_SPORTS[sport] ? `/api/sport?sport=${sport}` : '/api/odds'
  try {
    const res = await fetch(`${siteUrl}${path}`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

async function toolFindFixture(siteUrl, { query, sport }) {
  let fixtures = await fetchFixtureList(siteUrl, sport)
  let matches = matchFixtureQuery(fixtures, query)
  // No sport specified and nothing found in football (the default search)
  // - try each generic sport in turn rather than guessing wrong silently.
  if (!matches.length && !sport) {
    for (const key of Object.keys(GENERIC_SPORTS)) {
      fixtures = await fetchFixtureList(siteUrl, key)
      matches = matchFixtureQuery(fixtures, query)
      if (matches.length) break
    }
  }
  if (!matches.length) return { found: false }

  const topScore = matches[0].score
  const leaders = matches.filter((m) => m.score === topScore)
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
