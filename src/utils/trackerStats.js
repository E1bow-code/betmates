export function computeStats(entries) {
  const settled = entries.filter((e) => e.stake && ['won', 'lost', 'void'].includes(e.status))
  const staked = settled.reduce((sum, e) => sum + Number(e.stake), 0)
  const profit = settled.reduce((sum, e) => {
    if (e.status === 'won') return sum + (Number(e.potentialReturn) - Number(e.stake))
    if (e.status === 'lost') return sum - Number(e.stake)
    return sum
  }, 0)
  const decided = settled.filter((e) => e.status === 'won' || e.status === 'lost')
  const won = decided.filter((e) => e.status === 'won').length
  const winRate = decided.length ? Math.round((won / decided.length) * 100) : null
  const roi = staked ? Math.round((profit / staked) * 1000) / 10 : null
  return { staked, profit, winRate, roi, settledCount: settled.length, openCount: entries.length - settled.length }
}

// Current run of consecutive wins or consecutive losses, most recent bet
// first - void bets don't break a streak (they're a non-result, not a
// loss), they're just skipped over.
export function computeStreak(entries) {
  const decided = entries
    .filter((e) => ['won', 'lost'].includes(e.status) && e.settledAt)
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
  if (!decided.length) return { type: null, count: 0 }
  const type = decided[0].status
  let count = 0
  for (const e of decided) {
    if (e.status !== type) break
    count++
  }
  return { type, count }
}

// Highest-profit Sunday-start week among settled bets, for a "best week"
// badge - a simple grouping over the same profit math computeStats uses,
// not a separate calculation.
export function computeBestWeek(entries) {
  const settled = entries.filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
  if (!settled.length) return null
  const byWeek = new Map()
  for (const e of settled) {
    const settledDate = new Date(e.settledAt)
    const weekStart = new Date(settledDate)
    weekStart.setDate(settledDate.getDate() - settledDate.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const key = weekStart.toISOString()
    const profit = e.status === 'won' ? Number(e.potentialReturn) - Number(e.stake) : e.status === 'lost' ? -Number(e.stake) : 0
    byWeek.set(key, (byWeek.get(key) ?? 0) + profit)
  }
  let best = null
  for (const [weekStart, profit] of byWeek) {
    if (!best || profit > best.profit) best = { weekStart, profit }
  }
  return best
}
