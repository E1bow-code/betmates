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

// A fixed calendar month ('YYYY-MM'), not a rolling window like the windows
// above - season-rollover.js snapshots a month that's already finished,
// where "the last 30 days from now" would be the wrong boundary entirely.
// ISO timestamps sort/slice lexically in UTC, so a plain string compare
// avoids any Date-object timezone footguns.
export function isWithinPeriod(dateStr, period) {
  if (!dateStr) return false
  return dateStr.slice(0, 7) === period
}

// 'YYYY-MM' -> 'July 2026', for Leaderboard.jsx's Past champions strip.
// Constructed as UTC noon (not midnight) so no local timezone can ever roll
// the displayed month backward a day for a viewer west of UTC.
export function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
