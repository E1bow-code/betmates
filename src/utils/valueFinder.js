// Scans the fixtures currently on the board for the biggest "best price beats
// the market average" edges - the same computeBestValue maths that powers the
// per-outcome badge on a detail page (src/utils/bestValue.js), promoted into a
// board-wide "here's where the value is right now" list. Pure and
// side-effect-free.
//
// Only the headline win market (h2h / moneyline) is scanned: it's the market
// every fixture has and the one an edge is most meaningful on, and it keeps
// the list free of the longshot-exotic noise scanning every market would add.
import { computeBestValue } from './bestValue.js'

function matchup(item, sportKey) {
  if (sportKey === 'football') return `${item.homeTeam} v ${item.awayTeam}`
  if (sportKey === 'ufc') return `${item.fighterA} v ${item.fighterB}`
  return `${item.participantA} v ${item.participantB}`
}

function selectionLabel(item, sportKey, outcomeName) {
  if (sportKey === 'ufc') return outcomeName // already the fighter's name
  if (outcomeName === 'Home') return sportKey === 'football' ? item.homeTeam : item.participantA
  if (outcomeName === 'Away') return sportKey === 'football' ? item.awayTeam : item.participantB
  return outcomeName // Draw, or any other named outcome
}

// items: the loaded fixtures/fights/events for one sport (racing has no h2h and
// is skipped by the caller). Returns the top `limit` value edges, richest first.
export function findBoardValue(items, sportKey, { limit = 5 } = {}) {
  const found = []
  for (const item of items ?? []) {
    const h2h = item.markets?.find((m) => m.key === 'h2h')
    if (!h2h) continue
    for (const outcome of h2h.outcomes) {
      const value = computeBestValue(outcome.allOdds)
      if (!value) continue
      // The best price is the max decimal; find who's offering it.
      const bookmaker = outcome.allOdds.find((o) => o.decimal === value.best)?.bookmaker ?? null
      found.push({
        id: item.id,
        sportKey,
        matchup: matchup(item, sportKey),
        selection: selectionLabel(item, sportKey, outcome.name),
        best: value.best,
        bookmaker,
        pct: value.pct,
        extraPer10: value.extraPer10
      })
    }
  }
  // Rank by relative edge (how far above the market average), richest first.
  return found.sort((a, b) => b.pct - a.pct).slice(0, limit)
}
