// Turns a bankroll + staking rule into a concrete suggested stake - shared
// by AccountPage.jsx's plan preview and BetBuilderSheet.jsx's soft warning
// nudge, so the two can never disagree on what the plan actually suggests.
// Returns null when there's nothing to suggest: no rule set, or a percent
// rule with no bankroll figure to take a percentage of.
export function suggestedStake({ bankrollAmount, stakingRule }) {
  if (!stakingRule) return null
  if (stakingRule.type === 'flat') return stakingRule.value
  if (stakingRule.type === 'percent') {
    if (!bankrollAmount) return null
    return Math.round(bankrollAmount * (stakingRule.value / 100) * 100) / 100
  }
  return null
}

// Same "50%+ bigger is worth flagging" bar src/utils/lossChasing.js already
// uses - purely advisory, never blocking (BetMates has no way to prevent a
// stake either way). Returns null below the threshold, or when there's no
// suggestion to compare against at all.
const OVER_THRESHOLD = 1.5

export function stakingPlanWarning(user, stakeNum) {
  const suggestion = suggestedStake(user)
  if (!suggestion || !stakeNum || stakeNum <= suggestion * OVER_THRESHOLD) return null
  return { suggestion, stakeNum, overPct: Math.round(((stakeNum - suggestion) / suggestion) * 100) }
}
