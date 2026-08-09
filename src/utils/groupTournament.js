import { computeStats } from './trackerStats.js'

// A tournament's own fixed [startsAt, endsAt] window, not a rolling
// week/month/all window - same reasoning as challenge.js's inWindow, just
// ranking every group member instead of two people head-to-head.
function inWindow(post, startsAt, endsAt) {
  if (!post.settledAt) return false
  const t = new Date(post.settledAt).getTime()
  return t >= new Date(startsAt).getTime() && t <= new Date(endsAt).getTime()
}

// Standings for a group tournament - same by-user grouping/settled-only/
// stakeHidden-exclusion rules as computeGroupLeaderboard (groupLeaderboard.js),
// just scored against the tournament's own fixed window instead of a
// rolling one, and ranked by ROI as an alternative to profit (roi === null
// members sort last rather than crashing the comparison).
export function computeTournamentStandings(posts, memberNames, startsAt, endsAt, metric = 'profit') {
  const byUser = new Map()
  for (const post of posts) {
    if (post.stakeHidden) continue
    if (!inWindow(post, startsAt, endsAt)) continue
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  return [...byUser.entries()]
    .map(([userId, userPosts]) => ({ userId, name: memberNames[userId] ?? 'Someone', ...computeStats(userPosts) }))
    .filter((row) => row.settledCount > 0)
    .sort((a, b) => (metric === 'roi' ? (b.roi ?? -Infinity) - (a.roi ?? -Infinity) : b.profit - a.profit))
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
