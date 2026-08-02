// Generic proxy for every sport in src/lib/sportsConfig.js - one function
// instead of one-per-sport. `sport` query param selects the config entry;
// everything else mirrors netlify/functions/odds.js's approach. h2h and
// totals are both "featured" markets on The Odds API (same credit cost as
// h2h alone), so adding totals here doesn't change the credit math -
// spreads/handicap markets are left out since the line varies per team
// per event and isn't worth the added complexity yet.

import { GENERIC_SPORTS } from '../../src/lib/sportsConfig.js'

const REGION = 'uk'
const MARKETS = 'h2h,totals'

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const sportParam = url.searchParams.get('sport')
  const id = url.searchParams.get('id')
  const config = GENERIC_SPORTS[sportParam]

  if (!config) {
    return new Response(JSON.stringify({ error: `Unknown sport: ${sportParam}` }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  }

  if (!apiKey) {
    return new Response(JSON.stringify(id ? null : []), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
    })
  }

  try {
    const results = await Promise.allSettled(
      config.apiSportKeys.map(async (apiSport) => {
        const apiUrl = `https://api.the-odds-api.com/v4/sports/${apiSport}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error(`${apiSport}: ${res.status}`)
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

    const items = events.map((e) => reshapeEvent(e, config)).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    const body = id ? items.find((i) => i.id === id) ?? null : items
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

function reshapeEvent(event, config) {
  const h2hOutcomes = groupOutcomes(event, 'h2h', (outcome) =>
    normaliseOutcomeName(outcome.name, event.home_team, event.away_team, config.hasDraw)
  )
  // Totals lines vary per event (an NBA total isn't the same number as an
  // NHL total, and even differs game to game), so the line has to travel
  // with the outcome name rather than a static market label like
  // football's "Over/Under 2.5 Goals" - "Over 224.5" is the whole pick.
  const totalsOutcomes = groupOutcomes(event, 'totals', (outcome) => `${outcome.name} ${outcome.point ?? ''}`.trim())

  const markets = []
  if (h2hOutcomes.length) markets.push({ key: 'h2h', label: 'Moneyline', outcomes: h2hOutcomes })
  if (totalsOutcomes.length) markets.push({ key: 'totals', label: 'Total Points', outcomes: totalsOutcomes })

  return {
    id: event.id,
    competition: event.sport_title,
    participantA: event.home_team,
    participantB: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets
  }
}

function groupOutcomes(event, marketKey, nameFor) {
  const outcomesByName = new Map()
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === marketKey)
    if (!market) continue
    for (const outcome of market.outcomes) {
      const name = nameFor(outcome)
      if (!outcomesByName.has(name)) outcomesByName.set(name, [])
      outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price })
    }
  }
  return [...outcomesByName.entries()].map(([name, allOdds]) => ({
    name,
    team: name === 'Home' ? event.home_team : name === 'Away' ? event.away_team : null,
    allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
    bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  }))
}

function normaliseOutcomeName(rawName, homeTeam, awayTeam, hasDraw) {
  if (rawName === homeTeam) return 'Home'
  if (rawName === awayTeam) return 'Away'
  return hasDraw ? 'Draw' : rawName
}
