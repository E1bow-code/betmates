// Referral reward tiers. BetMates never places bets or holds funds (see the
// sign-up disclaimer), so the reward for bringing mates in is status, not
// money or free bets - unlockable titles in the same spirit as the app's
// other badges/achievements. Thresholds are the number of people who signed
// up from your link (profiles.referred_by = you; see dataStore.countReferrals).
export const REFERRAL_TIERS = [
  { threshold: 1, icon: '🤝', label: 'First mate' },
  { threshold: 3, icon: '📣', label: 'Connector' },
  { threshold: 5, icon: '🎯', label: 'Ringleader' },
  { threshold: 10, icon: '👑', label: 'Kingpin' }
]

// Given a referral count, which tiers are earned, the next one to chase, and
// how many more sign-ups it needs. `count` may be null while still loading.
export function referralRewardState(count) {
  const c = Number.isFinite(count) ? count : 0
  const earned = REFERRAL_TIERS.filter((tier) => c >= tier.threshold)
  const next = REFERRAL_TIERS.find((tier) => c < tier.threshold) ?? null
  return { count: c, earned, next, toNext: next ? next.threshold - c : 0 }
}

// The single highest tier a count has earned, or null - for the compact
// icon-only badge shown next to a name elsewhere in the app (Leaderboard
// rows, the group Members list, a public profile), as opposed to
// referralRewardState's full earned/next breakdown used on the referrer's
// own Account page.
export function topReferralTier(count) {
  const earned = referralRewardState(count).earned
  return earned.length ? earned[earned.length - 1] : null
}
