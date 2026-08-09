// "Sharp money" - the classic signal that professional/informed money is
// backing a selection: a price moving fast and consistently in one
// direction, not just "different from last time I looked" (that's
// src/lib/oddsMemory.js's single before/after flag, powering
// OddsMoveIndicator.jsx) and not a cross-bookmaker comparison at one
// instant (that's src/utils/bestValue.js/valueFinder.js's "value on the
// board"). This is the one place in the app that looks at a price's own
// history over time. Pure, no I/O - the caller (src/components/
// SharpMoneyBadge.jsx) passes in the series from
// dataStore.getOddsSnapshotSeries, itself fed by
// netlify/functions/odds-snapshot.js's follow-based snapshotting.

const MIN_SNAPSHOTS = 3
// Below this, ordinary market noise (a bookmaker nudging a price by a few
// pence) would false-positive as "sharp" constantly - this is meant to
// flag a real move, not every wobble.
const MIN_MOVE_PCT = 8

// snapshots: [{odds, fetchedAt}] for ONE outcome, any order - sorted here
// so callers don't have to get that right themselves.
export function detectSharpMoney(snapshots) {
  const sorted = [...(snapshots ?? [])]
    .filter((s) => Number.isFinite(s?.odds) && s.odds > 0 && s?.fetchedAt)
    .sort((a, b) => new Date(a.fetchedAt) - new Date(b.fetchedAt))
  if (sorted.length < MIN_SNAPSHOTS) return null

  const first = sorted[0].odds
  const last = sorted[sorted.length - 1].odds
  const pct = ((last - first) / first) * 100
  if (Math.abs(pct) < MIN_MOVE_PCT) return null

  // Consistent direction only - a price that whipsawed back and forth to
  // land at roughly the same net move isn't a real trend, just noise that
  // happened to cancel out unevenly.
  const direction = pct > 0 ? 1 : -1
  const consistent = sorted.every((s, i) => i === 0 || (s.odds - sorted[i - 1].odds) * direction >= 0)
  if (!consistent) return null

  // Shortening (price dropping) is the "money's backing this" signal;
  // drifting (price lengthening) means money's coming OFF it - both are
  // real sharp-money signals, just opposite directions.
  return {
    direction: pct < 0 ? 'shortening' : 'drifting',
    pct: Math.round(Math.abs(pct) * 10) / 10,
    from: first,
    to: last
  }
}
