import { detectSharpMoney } from '../utils/sharpMoney.js'

// The "professional money's on this" signal - real, sustained price
// movement over time (src/utils/sharpMoney.js), distinct from
// OddsMoveIndicator's plain "different from last time I looked" arrow.
// `series` only ever has data for a fixture someone followed while
// netlify/functions/odds-snapshot.js was recording it (see
// dataStore.getOddsSnapshotSeries) - on an unfollowed fixture this is
// just undefined/empty and the badge renders nothing, no separate
// follow-check needed here. Reuses TrackerPage's .line-value styling.
export default function SharpMoneyBadge({ series }) {
  const result = detectSharpMoney(series)
  if (!result) return null
  return (
    <div className={`line-value ${result.direction === 'shortening' ? 'line-value-good' : 'line-value-bad'}`}>
      {result.direction === 'shortening' ? '🔥 Shortening fast' : '📤 Drifting fast'} - {result.pct}%
    </div>
  )
}
