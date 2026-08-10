// The "who's up" ranking shared by GroupFeedPage's per-group Leaderboard and
// HomePage's rank teaser - both rank a group's members by total settled
// profit, not ROI (see tipsters.js for the ROI-based public-tipster board -
// a deliberately different ranking for a deliberately different, public-
// reputation context). Extracted so the two callers can't drift apart -
// this used to be inline in Leaderboard.jsx alone.
import { computeStats } from './trackerStats.js'
import { isWithinWindow, isWithinPeriod } from './dateWindows.js'
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

// netlify/functions/season-rollover.js's core decision: who was #1 by
// profit in a group (or, for the global season, across every public post -
// callers just pass the whole app's public posts as if it were one big
// group) for a calendar month that's already finished. Filters to the
// period first, then hands off to computeGroupLeaderboard itself with
// window='all' - the period boundary is drawn exactly once, here, rather
// than composing two different kinds of date filtering in the same call
// and risking them fighting each other. Returns null (not an empty row)
// when nobody settled anything that month, so a dead group doesn't get an
// empty trophy - same "omit rather than show nothing meaningful" rule
// computeGroupClvLeaderboard already follows for a thin sample.
export function computeSeasonWinner(posts, memberNames, period) {
  const periodPosts = posts.filter((post) => isWithinPeriod(post.settledAt, period))
  const rows = computeGroupLeaderboard(periodPosts, memberNames, 'all')
  return rows[0] ?? null
}

// The CLV twin of computeSeasonWinner: the month's "sharpest tipster" - #1 by
// average closing line value - for season-rollover.js to archive alongside the
// profit champion. Same period-filter-then-rank shape, but via
// computeGroupClvLeaderboard (which needs the closing-line map). Returns null
// when nobody clears clvSummary's sample gate that month, so a month with thin
// CLV data simply has no sharpest-tipster award rather than a noisy one - the
// same reason season-rollover writes a null clv_winner there.
export function computeSeasonClvWinner(posts, memberNames, closes, period) {
  const periodPosts = posts.filter((post) => isWithinPeriod(post.settledAt, period))
  const rows = computeGroupClvLeaderboard(periodPosts, memberNames, closes, 'all')
  return rows[0] ?? null
}
