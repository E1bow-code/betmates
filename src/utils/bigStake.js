// Flags a stake that's a clear outlier against the user's OWN history - not
// "bigger than your last loss" (lossChasing.js) or "over your bankroll plan"
// (stakingPlan.js), just plain bigger than what they usually stake. Same
// average-stake definition src/utils/coachSummary.js's buildCoachSummary
// already uses for Coach's take (every entry with a stake set, regardless
// of settled status) - kept as its own small function rather than importing
// that file, since it also pulls in Insights-only fields (sport labels
// etc.) this doesn't need. Requires a real sample first, same "omit rather
// than flag off one data point" rule the rest of this app's stats follow.
const MIN_SAMPLE = 3
const BIG_STAKE_MULTIPLE = 3

export function detectBigStake(entries, candidateStake) {
  if (!candidateStake || candidateStake <= 0) return null

  const staked = (entries ?? []).filter((e) => e.stake)
  if (staked.length < MIN_SAMPLE) return null

  const avgStake = staked.reduce((sum, e) => sum + Number(e.stake), 0) / staked.length
  if (candidateStake <= avgStake * BIG_STAKE_MULTIPLE) return null

  return { avgStake, candidateStake, multiple: Math.round((candidateStake / avgStake) * 10) / 10 }
}
