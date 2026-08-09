import { Link } from 'react-router-dom'

// Shared upsell card for the "for people who take this seriously" analytics
// layer (P2-M) - CLV leaderboard, sharp-money indicator, crowd wisdom
// calibration, bad beats, money-left-on-the-table, discipline streak, cash-
// out replay, Kelly staking calculator. Renders `children` untouched for a
// Plus user, a compact locked card otherwise - never hides that the feature
// exists, just what it's showing right now.
export default function PremiumGate({ isPremium, label, children }) {
  if (isPremium) return children
  return (
    <div className="premium-gate">
      <span className="premium-gate-lock">🔒</span>
      <span className="premium-gate-label">{label} is a BetMates Plus feature</span>
      <Link className="btn btn-ghost btn-small" to="/account#plus">
        Upgrade
      </Link>
    </div>
  )
}
