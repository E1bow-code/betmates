// Shared week/month/all-time filter for leaderboards - scoped to when a bet
// was actually settled (not posted), since a leaderboard is ranking results,
// not activity.
export const LEADERBOARD_WINDOWS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All-time' }
]

export function isWithinWindow(dateStr, window) {
  if (window === 'all') return true
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  if (window === 'week') {
    const cutoff = new Date(now)
    cutoff.setDate(now.getDate() - 7)
    return date >= cutoff
  }
  if (window === 'month') {
    const cutoff = new Date(now)
    cutoff.setMonth(now.getMonth() - 1)
    return date >= cutoff
  }
  return true
}
