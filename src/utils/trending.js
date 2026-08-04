// Tallies how many public posts back each exact selection (same event,
// market, and pick) within a recent window, for the "what's hot" panel on
// the public Feed - a global version of the per-fixture "most backed"
// indicator, not scoped to one game.
const WINDOW_DAYS = 7

export function computeTrendingPicks(posts, limit = 8) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)

  const counts = new Map()
  for (const post of posts) {
    if (post.stakeHidden || new Date(post.createdAt) < cutoff) continue
    for (const leg of post.selections ?? []) {
      const key = `${leg.event}|${leg.market}|${leg.selection}`
      if (!counts.has(key)) {
        counts.set(key, { key, event: leg.event, market: leg.market, selection: leg.selection, sport: leg.sport, count: 0 })
      }
      counts.get(key).count++
    }
  }

  return [...counts.values()]
    .filter((row) => row.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
