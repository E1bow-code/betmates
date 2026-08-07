// Ranks the app's public tipsters by their verified record. "Verified" is the
// whole point: a public pick is logged at posting time with its odds locked
// in (see the bet-slip flow), so a record here can't be backdated or fudged -
// unlike a screenshot. Built from the public feed only, so it's a genuinely
// public reputation, not your private tracker.
//
// Ranked by ROI, not raw profit: a tipster board is about who's sharp, not
// who stakes the most. Gated on a minimum sample so a lucky 1-2 bet run can't
// top the table - the same reasoning tipsterBadge uses.
import { computeStats, computeLongestWinStreak } from './trackerStats.js'
import { tipsterBadge } from './tipsterBadge.js'
import { isWithinWindow } from './dateWindows.js'

export const MIN_SETTLED_TO_RANK = 3

export function computeTipsterRankings(publicFeed, window = 'all') {
  if (!publicFeed) return null

  const names = new Map()
  const codes = new Map()
  const byUser = new Map()
  for (const post of publicFeed) {
    if (post.stakeHidden) continue // no visible stake -> no real P&L to rank on
    if (post.settledAt && !isWithinWindow(post.settledAt, window)) continue
    if (!names.has(post.userId)) {
      names.set(post.userId, post.authorName ?? 'Someone')
      codes.set(post.userId, post.authorCode ?? null)
    }
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  return [...byUser.entries()]
    .map(([userId, posts]) => {
      const stats = computeStats(posts)
      return {
        userId,
        name: names.get(userId),
        code: codes.get(userId),
        ...stats,
        streak: computeLongestWinStreak(posts),
        badge: tipsterBadge(stats)
      }
    })
    // Need a real, ranked sample: enough settled picks and a computable ROI.
    .filter((row) => row.settledCount >= MIN_SETTLED_TO_RANK && row.roi !== null)
    // Sharpest first; ties broken by who's done it over more picks.
    .sort((a, b) => b.roi - a.roi || b.settledCount - a.settledCount)
}
