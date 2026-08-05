// Calendar-based period boundaries (Sunday-start week / 1st-of-month) so a
// spending limit "resets" at a predictable moment, same mental model as a
// real bookmaker's deposit limit - not a rolling 7/30-day window.
export function periodStart(period) {
  const now = new Date()
  if (period === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function sumStakesSince(entries, since) {
  return entries
    .filter((e) => e.stake && new Date(e.createdAt) >= since)
    .reduce((sum, e) => sum + Number(e.stake), 0)
}
