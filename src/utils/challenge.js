import { computeStats } from './trackerStats.js'

// A challenge's own fixed [startsAt, endsAt) window, not "now" - unlike
// dateWindows.js's rolling week/month, a challenge already has both
// boundaries stored on the row (see supabase/schema.sql), so this is a
// closed comparison rather than a live rolling one.
function inWindow(post, startsAt, endsAt) {
  if (!post.settledAt) return false
  const t = new Date(post.settledAt).getTime()
  return t >= new Date(startsAt).getTime() && t <= new Date(endsAt).getTime()
}

// One side of a head-to-head challenge (ChallengeSection.jsx) - posts must
// already be filtered to what both parties can actually see (the same
// shared-groups-plus-public-feed rule HeadToHeadSheet.jsx has always used),
// this only narrows further to the challenge's own window. Pick'em gets its
// own shape (win/loss record on no-stake picks, same idea as
// pickem.js) rather than routing through computeStats, since a free pick
// has no profit/ROI to compare.
export function computeChallengeStats(posts, startsAt, endsAt, metric) {
  const windowed = posts.filter((p) => inWindow(p, startsAt, endsAt))
  if (metric === 'pickem') {
    const picks = windowed.filter((p) => !p.stake && ['won', 'lost'].includes(p.status))
    const wins = picks.filter((p) => p.status === 'won').length
    return { wins, losses: picks.length - wins, decidedCount: picks.length }
  }
  return computeStats(windowed)
}

// 'a' | 'b' | 'tie' | null (null = neither side has anything decided yet -
// ChallengeSection.jsx shows "no result yet" rather than crowning someone
// off a 0-0 scoreline). Direction-agnostic on purpose: which side is the
// DB row's challenger vs opponent only matters for who gets notified at
// creation, not for who's "ahead" - the caller passes whichever two stats
// it wants compared.
export function pickChallengeWinner(statsA, statsB, metric) {
  if (metric === 'pickem') {
    if (statsA.decidedCount === 0 && statsB.decidedCount === 0) return null
    if (statsA.wins !== statsB.wins) return statsA.wins > statsB.wins ? 'a' : 'b'
    if (statsA.losses !== statsB.losses) return statsA.losses < statsB.losses ? 'a' : 'b'
    return 'tie'
  }
  if (statsA.settledCount === 0 && statsB.settledCount === 0) return null
  const key = metric === 'roi' ? 'roi' : 'profit'
  const a = statsA[key] ?? 0
  const b = statsB[key] ?? 0
  if (a === b) return 'tie'
  return a > b ? 'a' : 'b'
}

// Shared display formatting between ChallengeSection.jsx and the
// shareable outcome card (src/lib/shareImage.js's renderChallengeImage),
// so the two can never show slightly different numbers for the same stats.
export function formatChallengeValue(stats, metric) {
  if (metric === 'pickem') return `${stats.wins}-${stats.losses}`
  if (metric === 'roi') return stats.roi === null ? '—' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}%`
  return `${stats.profit >= 0 ? '+' : ''}£${stats.profit.toFixed(2)}`
}
