// A "pick'em" leaderboard needs no new table: a bet posted to a group with
// no stake is already, in spirit, a free prediction rather than a real-
// money bet (BetBuilderSheet's stake field is explicitly optional) - this
// just scores those the same way a real pick'em contest would, over the
// existing settlement pipeline that already marks every post won/lost
// regardless of whether it carried a stake.
function weekStart(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function computePickemLeaderboard(posts, memberNames) {
  const start = weekStart(new Date())
  const picks = posts.filter(
    (p) => !p.stake && p.settledAt && new Date(p.settledAt) >= start && ['won', 'lost'].includes(p.status)
  )

  const byUser = new Map()
  for (const p of picks) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, { wins: 0, losses: 0 })
    const row = byUser.get(p.userId)
    if (p.status === 'won') row.wins++
    else row.losses++
  }

  return [...byUser.entries()]
    .map(([userId, { wins, losses }]) => ({ userId, name: memberNames[userId] ?? 'Someone', wins, losses }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
}
