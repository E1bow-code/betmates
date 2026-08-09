import Sparkline from './Sparkline.jsx'

// A retrospective "what if you'd cashed out early" tag for a settled
// single-leg bet - same inline-tag slot as ClvTag/LineValueTag on
// TrackerPage.jsx, built from src/utils/cashOutReplay.js's fair-value
// replay against pre-kickoff price history. Needs at least two recorded
// prices to be worth showing at all - one point has nothing to replay.
export default function CashOutReplay({ replay, actualReturn }) {
  if (!replay || replay.points.length < 2) return null
  const betterThanActual = actualReturn != null && replay.best.value > actualReturn
  return (
    <div className="line-value" title="Simplified estimate from recorded pre-kickoff prices - not a real cash-out offer">
      💷 Best cash-out point was £{replay.best.value.toFixed(2)}
      {betterThanActual && ` (£${(replay.best.value - actualReturn).toFixed(2)} more than you got)`}
      <Sparkline points={replay.points.map((p) => ({ p: p.value }))} />
    </div>
  )
}
