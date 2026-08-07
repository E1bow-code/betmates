// The positive twin of loss-chasing detection (src/utils/lossChasing.js):
// how many settled bets in a row, most recent first, were placed WITHOUT
// tripping that same chase check against whatever the most recent settled
// loss was at the time. Mirrors computeStreak's win-streak framing in
// trackerStats.js, but for self-control rather than results - resets to 0
// the moment a chase is found, same "keep it going" shape as a win streak.
import { detectLossChasing } from './lossChasing.js'

export function computeDisciplineStreak(entries) {
  const settled = (entries ?? [])
    .filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt))
  if (!settled.length) return 0

  let streak = 0
  for (let i = settled.length - 1; i >= 0; i--) {
    const history = settled.slice(0, i)
    if (detectLossChasing(history, Number(settled[i].stake))) break
    streak++
  }
  return streak
}
