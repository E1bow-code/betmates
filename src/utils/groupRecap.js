// The group's last-seven-days at a glance - the in-app twin of the personal
// push in netlify/functions/weekly-recap.js, but for a whole group and read
// straight off the posts the feed already loaded (no new backend call). Pure
// and side-effect-free; returns null when there's nothing settled this week
// so the card can just not render.
import { computeStats } from './trackerStats.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Net profit on a single settled bet, same rules computeStats uses: a win
// pays the return minus the stake, a loss costs the stake, a void is neutral.
function betProfit(post) {
  if (post.status === 'won') return Number(post.potentialReturn) - Number(post.stake)
  if (post.status === 'lost') return -Number(post.stake)
  return 0
}

export function computeGroupRecap(posts, memberNames = {}, now = Date.now()) {
  const since = now - WEEK_MS
  const settled = (posts ?? []).filter(
    (p) => p.stake && ['won', 'lost', 'void'].includes(p.status) && p.settledAt && new Date(p.settledAt).getTime() >= since
  )
  if (!settled.length) return null

  const byUser = new Map()
  for (const post of settled) {
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  // Best performer of the week by profit; ties go to whoever settled more.
  let topTipster = null
  for (const [userId, entries] of byUser) {
    const stats = computeStats(entries)
    const candidate = {
      userId,
      name: memberNames[userId] ?? 'Someone',
      profit: stats.profit,
      settledCount: stats.settledCount,
      winRate: stats.winRate
    }
    if (
      !topTipster ||
      candidate.profit > topTipster.profit ||
      (candidate.profit === topTipster.profit && candidate.settledCount > topTipster.settledCount)
    ) {
      topTipster = candidate
    }
  }

  // Biggest single winning bet of the week (null if nobody won one).
  let biggestWin = null
  for (const post of settled) {
    if (post.status !== 'won') continue
    const profit = betProfit(post)
    if (!biggestWin || profit > biggestWin.profit) {
      biggestWin = {
        name: memberNames[post.userId] ?? 'Someone',
        profit,
        event: post.selections?.[0]?.event ?? null,
        legs: post.selections?.length ?? 1
      }
    }
  }

  return {
    settledCount: settled.length,
    activeCount: byUser.size,
    groupProfit: settled.reduce((sum, p) => sum + betProfit(p), 0),
    topTipster,
    biggestWin
  }
}
