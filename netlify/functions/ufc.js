// Proxy for UFC/MMA odds via The Odds API's `mma_mixed_martial_arts` sport
// (there's no UFC-specific key - this covers all MMA promotions, but in
// practice the UK-bookmaker-covered events are predominantly UFC cards).
// Same shape/caching approach as netlify/functions/odds.js (see
// src/lib/apiCache.js) - mock fallback when ODDS_API_KEY isn't set.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const SPORT = 'mma_mixed_martial_arts'
const REGION = 'uk'
const MARKETS = 'h2h'
const LIST_TTL = 20 * 60 * 1000

async function serveMock(id) {
  const { getMockFights, getMockFight } = await import('../../src/data/mockUfcOdds.js')
  const body = id ? getMockFight(id) : getMockFights()
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
  })
}

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!apiKey) return serveMock(id)

  try {
    let fights = cacheGet('ufc-fights')
    if (!fights) {
      const apiUrl = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`
      const res = await fetch(apiUrl)
      if (!res.ok) {
        console.error(`Odds provider error (${res.status}), falling back to mock`)
        return serveMock(id)
      }
      const events = await res.json()
      fights = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
      cacheSet('ufc-fights', fights, LIST_TTL)
    }
    const body = id ? fights.find((f) => f.id === id) ?? null : fights
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Odds provider error, falling back to mock:', err.message)
    return serveMock(id)
  }
}

function reshapeEvent(event) {
  const outcomesByName = new Map()
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === 'h2h')
    if (!market) continue
    for (const outcome of market.outcomes) {
      if (!outcomesByName.has(outcome.name)) outcomesByName.set(outcome.name, [])
      outcomesByName.get(outcome.name).push({ bookmaker: bookmaker.title, decimal: outcome.price })
    }
  }
  const outcomes = [...outcomesByName.entries()].map(([name, allOdds]) => ({
    name,
    team: null,
    allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
    bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  }))

  return {
    id: event.id,
    competition: event.sport_title,
    fighterA: event.home_team,
    fighterB: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets: outcomes.length ? [{ key: 'h2h', label: 'Moneyline', outcomes }] : []
  }
}
