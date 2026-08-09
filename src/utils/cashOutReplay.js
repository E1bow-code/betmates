// A retrospective "what if you'd cashed out early" replay for a single-leg
// settled bet, built from the SAME pre-kickoff price history that already
// feeds CLV and the sharp-money badge (src/lib/dataStore.js's
// getOddsSnapshotSeries, fed by netlify/functions/odds-snapshot.js).
// Deliberately not a full in-play cash-out simulator - this app has no
// post-kickoff price data at all (that function only ever snapshots
// pre-match prices), so every point here is "if you'd cashed out before
// kickoff at this recorded price", not "during the match". Purely
// educational: BetMates never places bets, so nothing here is a real
// cash-out offer.
//
// Uses the standard simplified fair-value formula, which ignores
// bookmaker margin - a genuine cash-out offer would come in lower than
// this: cashOutValue = stake * placedOdds / priceAtThatPoint.

// snapshots: [{odds, fetchedAt}] for the bet's own outcome, any order -
// sorted here so callers don't have to get that right themselves.
export function computeCashOutReplay({ stake, odds }, snapshots) {
  if (!stake || !odds) return null
  const sorted = [...(snapshots ?? [])]
    .filter((s) => Number.isFinite(s?.odds) && s.odds > 0 && s?.fetchedAt)
    .sort((a, b) => new Date(a.fetchedAt) - new Date(b.fetchedAt))
  if (!sorted.length) return null

  const points = sorted.map((s) => ({
    fetchedAt: s.fetchedAt,
    value: Math.round(((stake * odds) / s.odds) * 100) / 100
  }))
  const best = points.reduce((a, b) => (b.value > a.value ? b : a))
  return { points, best }
}
