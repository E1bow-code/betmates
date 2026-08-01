// Proxy between the frontend and The Odds API (theoddsapi.com), keeping
// ODDS_API_KEY server-side. Reshapes their response into the
// { id, competition, homeTeam, awayTeam, kickoff, markets: [...] } shape
// used by src/data/mockFootballOdds.js, so UI code doesn't change when
// switching src/api/oddsClient.js off mock mode.
//
// Free tier: 500 requests/month. Each league below costs one credit PER
// PAGE LOAD (not per fixture) - 4 leagues = 4 credits every time someone
// opens the Odds tab, so ~125 loads/month before the free tier runs dry.
// Trim this list (or add server-side caching) if that's not enough.
const SPORTS = [
  'soccer_epl', // Premier League
  'soccer_efl_champ', // Championship
  'soccer_scotland_premiership', // Celtic, Hearts, Rangers, etc.
  'soccer_uefa_champs_league'
]
const REGION = 'uk'
const MARKETS = 'h2h,totals'

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!apiKey) {
    const { getMockFixtures, getMockFixture } = await import('../../src/data/mockFootballOdds.js')
    const body = id ? getMockFixture(id) : getMockFixtures()
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
    })
  }

  try {
    const results = await Promise.allSettled(
      SPORTS.map(async (sport) => {
        const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error(`${sport}: ${res.status}`)
        return res.json()
      })
    )

    const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
    if (!events.length && results.every((r) => r.status === 'rejected')) {
      return new Response(JSON.stringify({ error: 'Odds provider error: ' + results[0].reason.message }), {
        status: 502,
        headers: { 'content-type': 'application/json' }
      })
    }

    const fixtures = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    const body = id ? fixtures.find((f) => f.id === id) ?? null : fixtures
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}

function reshapeEvent(event) {
  const marketDefs = [
    { key: 'h2h', label: '1X2' },
    { key: 'totals', label: 'Over/Under 2.5 Goals' }
  ]

  const markets = marketDefs
    .map(({ key, label }) => {
      const outcomesByName = new Map()
      for (const bookmaker of event.bookmakers ?? []) {
        const market = bookmaker.markets?.find((m) => m.key === key)
        if (!market) continue
        for (const outcome of market.outcomes) {
          const name = normaliseOutcomeName(outcome.name, event.home_team, event.away_team, key)
          if (!outcomesByName.has(name)) outcomesByName.set(name, [])
          outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price })
        }
      }
      const outcomes = [...outcomesByName.entries()].map(([name, allOdds]) => ({
        name,
        team: name === 'Home' ? event.home_team : name === 'Away' ? event.away_team : null,
        allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
        bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
      }))
      return outcomes.length ? { key, label, outcomes } : null
    })
    .filter(Boolean)

  return {
    id: event.id,
    competition: event.sport_title,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets
  }
}

function normaliseOutcomeName(rawName, homeTeam, awayTeam, marketKey) {
  if (marketKey === 'h2h') {
    if (rawName === homeTeam) return 'Home'
    if (rawName === awayTeam) return 'Away'
    return 'Draw'
  }
  return rawName // "Over"/"Under" totals labels are already provider-clean
}
