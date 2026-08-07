// Flags a stake that's meaningfully bigger than the stake on the user's
// most recent SETTLED loss - the classic "chase it back" pattern, not just
// "any bet placed after any loss" (an equal or smaller stake isn't chasing,
// it's just the next pick). A bookmaker has no incentive to ever build this
// against itself, so there's no existing pattern to match - this is a soft,
// one-time nudge shown at bet-entry time (see BetBuilderSheet.jsx and
// ManualEntrySheet.jsx), never a block and never a running tally, in
// keeping with the spend limit elsewhere on this page being "a gentle
// check-in, not a hard block."
const CHASE_THRESHOLD = 1.5 // 50%+ bigger than the losing stake counts as chasing

export function detectLossChasing(entries, candidateStake) {
  if (!candidateStake || candidateStake <= 0) return null

  const settled = (entries ?? [])
    .filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
  const lastSettled = settled[0]
  if (!lastSettled || lastSettled.status !== 'lost') return null

  const lastStake = Number(lastSettled.stake)
  if (candidateStake <= lastStake * CHASE_THRESHOLD) return null

  return { lastStake, candidateStake, increasePct: Math.round((candidateStake / lastStake - 1) * 100) }
}
