import { computeSpendPace } from '../utils/spendPace.js'

// A neutral spend-awareness line under the Tracker scoreboard (computeSpendPace)
// - this week's stake next to the user's own typical recent week. On-brand for
// a tracker rather than a bookmaker: factual, no judgment, and it renders
// nothing until there's a baseline to compare against.
export default function SpendPaceNote({ entries }) {
  const pace = computeSpendPace(entries ?? [])
  if (!pace) return null

  return (
    <p className="spend-pace">
      Spend check · <b>£{pace.thisWeek.toFixed(2)}</b> staked this week · your typical week is <b>£{pace.typical.toFixed(2)}</b>
      {pace.thisWeek === 0 && <span className="spend-pace-easy"> — taking it easy 👍</span>}
    </p>
  )
}
