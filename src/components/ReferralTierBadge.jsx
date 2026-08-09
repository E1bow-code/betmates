import { topReferralTier } from '../utils/referralRewards.js'

// Compact icon-only version of the referral tier badge (see
// AccountPage.jsx/AchievementsPage.jsx for the full earned/next breakdown)
// - shown next to a name wherever OTHER people see it (Leaderboard rows,
// the group Members list, a public profile), not just the referrer's own
// settings page. Reuses .tipster-badge, the same "small chip next to a
// name" class PublicProfilePage.jsx already uses for the tipster badge, so
// this reads as the same family of inline status marker rather than a new
// visual language. Renders nothing below the first tier.
export default function ReferralTierBadge({ count }) {
  const tier = topReferralTier(count)
  if (!tier) return null
  return (
    <span className="tipster-badge" title={`${tier.label} - brought ${tier.threshold}+ mates to BetMates`}>
      {tier.icon} {tier.label}
    </span>
  )
}
