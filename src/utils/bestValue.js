// How much the best price for an outcome beats the average across every
// bookmaker offering it - the whole point of an odds-comparison app, made
// concrete. Pure and side-effect-free so it's trivially testable.
//
// Returns null (i.e. show nothing) unless there's a genuine, non-trivial
// edge worth surfacing:
//   - at least MIN_BOOKIES prices, so the "average" actually means something
//   - the best beats that average by at least MIN_EXTRA_PER_10 per £10 staked,
//     so tight markets where everyone's within a hair don't get a noisy badge.
const MIN_BOOKIES = 3
const MIN_EXTRA_PER_10 = 0.05 // 5p per £10

export function computeBestValue(allOdds) {
  const decimals = (allOdds ?? []).map((o) => o.decimal).filter((d) => Number.isFinite(d) && d > 0)
  if (decimals.length < MIN_BOOKIES) return null

  const best = Math.max(...decimals)
  const avg = decimals.reduce((sum, d) => sum + d, 0) / decimals.length
  // Return on a £10 stake is 10 × decimal odds, so the extra you'd win at the
  // best price versus the average is just 10 × the odds difference.
  const extraPer10 = (best - avg) * 10
  if (extraPer10 < MIN_EXTRA_PER_10) return null

  return {
    best,
    avg,
    count: decimals.length,
    extraPer10,
    pct: (best / avg - 1) * 100
  }
}
