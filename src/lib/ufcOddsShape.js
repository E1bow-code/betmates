// Pure reshaping of The Odds API's MMA payload into the
// { id, competition, fighterA, fighterB, kickoff, markets: [...] } shape used
// by src/data/mockUfcOdds.js. Extracted out of netlify/functions/ufc.js so the
// on-demand proxy and the scheduled netlify/functions/ufc-ingest.js share one
// definition of the fight shape - same rationale as src/lib/footballOddsShape.js
// (and, upstream of both, src/lib/betEvaluation.js being the one home for
// settlement rules). No I/O here (only pickLink, itself pure).
import { pickLink } from './oddsLinks.js'

export function reshapeEvent(event) {
  const outcomesByName = new Map()
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === 'h2h')
    if (!market) continue
    for (const outcome of market.outcomes) {
      if (!outcomesByName.has(outcome.name)) outcomesByName.set(outcome.name, [])
      outcomesByName.get(outcome.name).push({ bookmaker: bookmaker.title, decimal: outcome.price, ...pickLink(bookmaker, market, outcome) })
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
