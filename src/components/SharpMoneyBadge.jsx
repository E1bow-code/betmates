import { useAuth } from '../context/AuthContext.jsx'
import { detectSharpMoney } from '../utils/sharpMoney.js'

// The "professional money's on this" signal - real, sustained price
// movement over time (src/utils/sharpMoney.js), distinct from
// OddsMoveIndicator's plain "different from last time I looked" arrow.
// `series` only ever has data for a fixture someone followed while
// netlify/functions/odds-snapshot.js was recording it (see
// dataStore.getOddsSnapshotSeries) - on an unfollowed fixture this is
// just undefined/empty and the badge renders nothing, no separate
// follow-check needed here. Reuses TrackerPage's .line-value styling.
//
// Plus-gated (P2-M) - suppressed for a free user rather than shown behind
// an inline lock, matching this component's own existing "just renders
// nothing when there's nothing to show" convention (checked via useAuth
// directly rather than a prop, since every one of its four callers would
// otherwise need to thread isPremium through unchanged).
export default function SharpMoneyBadge({ series }) {
  const { user } = useAuth()
  const result = detectSharpMoney(series)
  if (!result || !user.isPremium) return null
  return (
    <div className={`line-value ${result.direction === 'shortening' ? 'line-value-good' : 'line-value-bad'}`}>
      {result.direction === 'shortening' ? '🔥 Shortening fast' : '📤 Drifting fast'} - {result.pct}%
    </div>
  )
}
