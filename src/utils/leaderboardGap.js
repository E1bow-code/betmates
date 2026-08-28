// The motivating "you're £X behind the next mate up" line for the current
// user's leaderboard row - a forward-looking rivalry hook, distinct from the
// backward-looking "you passed X" toast and the movement arrows. Pure, over
// the same profit rows the leaderboard already ranks (each { userId, name,
// profit, rank }). Returns null when the user isn't on the board.
function round2(n) {
  return Math.round(n * 100) / 100
}

export function leaderboardGap(rows, currentUserId) {
  const list = rows ?? []
  const i = list.findIndex((r) => r.userId === currentUserId)
  if (i === -1) return null

  const me = list[i]
  if (i > 0) {
    const ahead = list[i - 1]
    return { type: 'behind', name: ahead.name, gap: round2(ahead.profit - me.profit) }
  }
  // Top of the board: show the lead over the nearest chaser, if there is one.
  if (list.length > 1) {
    const chaser = list[i + 1]
    return { type: 'leading', name: chaser.name, gap: round2(me.profit - chaser.profit) }
  }
  return { type: 'alone' }
}
