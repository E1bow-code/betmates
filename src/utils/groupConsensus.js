// "What the group's on" - selections that 2+ DIFFERENT members of THIS group
// are backing on still-open bets. Group-scoped and counted by distinct backer,
// which is what makes it different from computeTrendingPicks (src/utils/
// trending.js) - that one is the global public-feed "what's hot", counting leg
// occurrences across everyone. This reads as "3 mates are on Arsenal", the
// social proof that nudges a member to tail a pick their group already likes.
//
// Only open bets count (a settled pick can't be tailed), within a recent
// window, and a member counts once per distinct pick no matter how many legs
// or bets it appears in.
const WINDOW_DAYS = 10

export function computeGroupConsensus(posts, { minBackers = 2, limit = 3, now = Date.now() } = {}) {
  const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const byPick = new Map()

  for (const post of posts ?? []) {
    if (!post.userId || post.status !== 'open') continue
    const created = new Date(post.createdAt).getTime()
    if (!(created >= cutoff)) continue

    const seenThisPost = new Set() // don't let one multi count the same pick twice
    for (const leg of post.selections ?? []) {
      const key = `${leg.event}|${leg.market}|${leg.selection}`
      if (seenThisPost.has(key)) continue
      seenThisPost.add(key)
      if (!byPick.has(key)) {
        byPick.set(key, { event: leg.event, market: leg.market, selection: leg.selection, sport: leg.sport, backers: new Set() })
      }
      byPick.get(key).backers.add(post.userId)
    }
  }

  return [...byPick.values()]
    .map((p) => ({ event: p.event, market: p.market, selection: p.selection, sport: p.sport, backerIds: [...p.backers], count: p.backers.size }))
    .filter((p) => p.count >= minBackers)
    .sort((a, b) => b.count - a.count || String(a.selection).localeCompare(String(b.selection)))
    .slice(0, limit)
}
