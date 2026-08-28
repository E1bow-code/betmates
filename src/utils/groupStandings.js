// Compact "where do I sit in this group" summary for CoachGPT, built from the
// same computeGroupLeaderboard rows the app's own Leaderboard ranks on - so the
// coach's social read can never drift from what the user sees on screen. Pure
// so it's unit-testable without a backend; the Netlify function does the DB
// reads and the ranking, then hands the rows here.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// One group. `rows` is computeGroupLeaderboard's output (sorted by profit desc,
// each with a 1-based rank), already filtered to members with a settled result.
// Returns null when the user isn't ranked here yet (no settled, staked, visible
// bet in this group) - the caller drops those rather than reporting an empty
// standing.
export function summariseGroupStanding(rows, userId, { name, memberCount } = {}) {
  const mine = (rows ?? []).find((r) => r.userId === userId)
  if (!mine) return null
  const leader = rows[0]
  const above = mine.rank > 1 ? rows[mine.rank - 2] : null
  return {
    group: name ?? 'your group',
    memberCount: memberCount ?? rows.length,
    ranked: rows.length,
    rank: mine.rank,
    isLeading: mine.rank === 1,
    profit: round2(mine.profit),
    // Omit the leader block when the user IS the leader - "you're top" says it.
    gapToLeader: mine.rank === 1 ? 0 : round2(leader.profit - mine.profit),
    leader: mine.rank === 1 ? null : { name: leader.name, profit: round2(leader.profit) },
    // The single person directly ahead - the one to catch next, which is a more
    // motivating handle than the overall leader when the user is mid-table.
    nextUp: above ? { name: above.name, behindBy: round2(above.profit - mine.profit) } : null
  }
}

// All the user's groups (the caller caps how many it fetches). Drops groups the
// user isn't ranked in, and reports unavailable when none are left - the same
// degrade-to-unavailable contract get_my_record uses, so CoachGPT says "no
// group standings yet" plainly rather than inventing one.
export function summariseGroupStandings(groups = []) {
  const standings = groups
    .map((g) => summariseGroupStanding(g.rows, g.userId, { name: g.name, memberCount: g.memberCount }))
    .filter(Boolean)
  if (!standings.length) return { available: false, reason: 'no settled group bets yet' }
  return { available: true, groups: standings }
}
