// The "who's up" ranking shared by GroupFeedPage's per-group Leaderboard and
// HomePage's rank teaser - both rank a group's members by total settled
// profit, not ROI (see tipsters.js for the ROI-based public-tipster board -
// a deliberately different ranking for a deliberately different, public-
// reputation context). Extracted so the two callers can't drift apart -
// this used to be inline in Leaderboard.jsx alone.
import { computeStats } from './trackerStats.js'
import { isWithinWindow } from './dateWindows.js'
import { clvSummary } from './clv.js'

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

// "Who's actually beating the market" instead of "who's up" - profit
// rewards variance as much as skill (a couple of lucky longshots can top
// the table); CLV can't be fluked the same way, since it's the price you
// struck vs. the market's own closing line, not whether the bet won.
// Same by-user grouping/window filtering as computeGroupLeaderboard above,
// scored via clvSummary (src/utils/clv.js) instead of computeStats -
// members below clvSummary's own minSample gate don't appear at all,
// same "omit rather than show a noisy 1-bet figure" rule the rest of this
// app's stats already follow. Deliberately does NOT drop stakeHidden posts
// the way the profit board does - CLV is about the price struck, not the
// money behind it, so a hidden stake still has a real, comparable price.
export function computeGroupClvLeaderboard(posts, memberNames, closes, window = 'all') {
  const byUser = new Map()
  for (const post of posts) {
    if (post.settledAt && !isWithinWindow(post.settledAt, window)) continue
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  return [...byUser.entries()]
    .map(([userId, userPosts]) => ({ userId, name: memberNames[userId] ?? 'Someone', clv: clvSummary(userPosts, closes) }))
    .filter((row) => row.clv)
    .sort((a, b) => b.clv.avgPct - a.clv.avgPct)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
