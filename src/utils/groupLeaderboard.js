// The "who's up" ranking shared by GroupFeedPage's per-group Leaderboard and
// HomePage's rank teaser - both rank a group's members by total settled
// profit, not ROI (see tipsters.js for the ROI-based public-tipster board -
// a deliberately different ranking for a deliberately different, public-
// reputation context). Extracted so the two callers can't drift apart -
// this used to be inline in Leaderboard.jsx alone.
import { computeStats } from './trackerStats.js'
import { isWithinWindow } from './dateWindows.js'

export function computeGroupLeaderboard(posts, memberNames, window = 'all') {
  const byUser = new Map()
  for (const post of posts) {
    if (post.stakeHidden) continue // no visible stake -> no real P&L to rank on
    if (post.settledAt && !isWithinWindow(post.settledAt, window)) continue
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  return [...byUser.entries()]
    .map(([userId, userPosts]) => ({ userId, name: memberNames[userId] ?? 'Someone', ...computeStats(userPosts) }))
    .filter((row) => row.settledCount > 0)
    .sort((a, b) => b.profit - a.profit)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
