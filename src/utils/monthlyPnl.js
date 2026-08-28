import { computeStats } from './trackerStats.js'

// This calendar month's settled P&L. The Tracker headlines all-time profit,
// but people think in months ("how am I doing this month?"), so this filters
// settled bets to the current month by settled_at and runs the same
// computeStats over them. Month boundaries are drawn on the settledAt's
// YYYY-MM (UTC) so the result is deterministic rather than depending on the
// runner's timezone. Returns null when nothing settled this month, so a quiet
// month shows no line rather than a hollow £0.00.
const SETTLED = ['won', 'lost', 'void']

export function computeMonthlyPnl(entries, now = new Date()) {
  const period = now.toISOString().slice(0, 7) // YYYY-MM
  const thisMonth = (entries ?? []).filter(
    (e) => e && SETTLED.includes(e.status) && typeof e.settledAt === 'string' && e.settledAt.slice(0, 7) === period
  )
  if (!thisMonth.length) return null

  const label = new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return { label, ...computeStats(thisMonth) }
}
