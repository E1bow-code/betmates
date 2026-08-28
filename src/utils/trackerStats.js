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
  return {
    staked,
    profit,
    winRate,
    roi,
    settledCount: settled.length,
    openCount: entries.length - settled.length,
    decidedCount: decided.length
  }
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

// The Sunday-00:00 that starts the settledAt's week, as an ISO string, drawn
// in UTC. Deterministic regardless of the runner's timezone - the same rule
// monthlyPnl.js and dateWindows.js follow, so a bet settled near a Saturday/
// Sunday midnight boundary lands in one fixed week for everyone, rather than
// shifting week-buckets (and which week is credited as "best") between viewers
// in different timezones. Date.UTC handles the day going below 1 by rolling
// back into the previous month.
function utcWeekStartIso(dateStr) {
  const d = new Date(dateStr)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay())).toISOString()
}

// Highest-profit Sunday-start week among settled bets, for a "best week"
// badge - a simple grouping over the same profit math computeStats uses,
// not a separate calculation.
export function computeBestWeek(entries) {
  const settled = entries.filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
  if (!settled.length) return null
  const byWeek = new Map()
  for (const e of settled) {
    const key = utcWeekStartIso(e.settledAt)
    const profit = e.status === 'won' ? Number(e.potentialReturn) - Number(e.stake) : e.status === 'lost' ? -Number(e.stake) : 0
    byWeek.set(key, (byWeek.get(key) ?? 0) + profit)
  }
  let best = null
  for (const [weekStart, profit] of byWeek) {
    if (!best || profit > best.profit) best = { weekStart, profit }
  }
  return best
}

// Most recent Sunday-start week where every decided bet (won or lost) came
// back a winner - distinct from "best week" above, which is highest profit
// regardless of any losses mixed in. Needs at least 2 decided bets so a
// single lucky punt doesn't count as a "week".
export function computePerfectWeek(entries) {
  const decided = entries.filter((e) => e.stake && e.settledAt && ['won', 'lost'].includes(e.status))
  if (!decided.length) return null
  const byWeek = new Map()
  for (const e of decided) {
    const key = utcWeekStartIso(e.settledAt)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(e.status)
  }
  let best = null
  for (const [weekStart, statuses] of byWeek) {
    if (statuses.length < 2 || statuses.some((s) => s !== 'won')) continue
    if (!best || weekStart > best.weekStart) best = { weekStart, count: statuses.length }
  }
  return best
}

// Longest run of consecutive wins anywhere in the history, not just the
// current one still running (see computeStreak) - for the season recap.
export function computeLongestWinStreak(entries) {
  const decided = entries
    .filter((e) => ['won', 'lost'].includes(e.status) && e.settledAt)
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt))
  let longest = 0
  let current = 0
  for (const e of decided) {
    if (e.status === 'won') {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

// Single biggest-profit settled win, for the season recap's "best win" line.
export function computeBestWin(entries) {
  const wins = entries.filter((e) => e.stake && e.status === 'won')
  if (!wins.length) return null
  return wins.reduce((best, e) => {
    const profit = Number(e.potentialReturn) - Number(e.stake)
    return !best || profit > best.profit ? { profit, event: e.selections?.[0]?.event ?? 'Bet' } : best
  }, null)
}

// One-off milestones rather than a running total/count - first win (only
// while it's still their only one), and whichever bets-logged/profit tier
// they've most recently crossed. Shows the highest tier only, not every
// tier passed along the way, so this doesn't turn into a wall of badges for
// someone who's been using the app a while.
export function computeMilestoneBadges(entries) {
  const settled = entries.filter((e) => e.stake && ['won', 'lost', 'void'].includes(e.status))
  const wins = settled.filter((e) => e.status === 'won').length
  const { profit } = computeStats(entries)
  const badges = []

  if (wins === 1) badges.push({ icon: 'target', label: 'First win logged' })

  const loggedTier = [100, 50, 10].find((t) => entries.length >= t)
  if (loggedTier) badges.push({ icon: 'book', label: `${loggedTier} bets logged` })

  const profitTier = [500, 250, 100, 50].find((t) => profit >= t)
  if (profitTier) badges.push({ icon: 'money', label: `+£${profitTier} lifetime profit` })

  return badges
}
