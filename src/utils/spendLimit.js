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

// Whether logging a new `stake` would push this period's logged stakes past the
// limit. Used both for the advisory warning and - when the user has opted into
// a hard limit (notificationPrefs.stakeLimitHard) - to actually block the save.
// Only meaningful with a limit set and a real positive stake; anything missing
// is treated as "no, carry on" so it never blocks by accident.
export function wouldExceedLimit({ periodSpend, stake, amount }) {
  const s = Number(stake)
  const a = Number(amount)
  if (!a || !Number.isFinite(s) || s <= 0 || periodSpend == null) return false
  return periodSpend + s > a
}
