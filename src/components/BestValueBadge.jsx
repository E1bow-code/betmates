import { computeBestValue } from '../utils/bestValue.js'

// "Shopping around is worth £X" badge next to the best price on an outcome.
// Renders nothing unless the edge over the market average clears the
// thresholds in bestValue.js, so it only appears where it's actually saying
// something. Framed per £10 staked - concrete money, matching how a punter
// thinks - with the full comparison in the tooltip.
export default function BestValueBadge({ allOdds }) {
  const value = computeBestValue(allOdds)
  if (!value) return null

  return (
    <span
      className="best-value"
      title={`Best price ${value.best.toFixed(2)} vs ${value.avg.toFixed(2)} average across ${value.count} bookmakers — £${value.extraPer10.toFixed(2)} more per £10 staked`}
    >
      £{value.extraPer10.toFixed(2)}/£10 vs avg
    </span>
  )
}
