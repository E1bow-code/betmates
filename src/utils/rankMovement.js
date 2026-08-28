// How each member's leaderboard rank has moved since a previous snapshot.
// A rank is "better" when its number is lower (#1 beats #5), so the delta is
// prevRank - currentRank: positive = climbed, negative = slid, 0 = held, and
// null = new to the board (or no prior snapshot to compare against). Pure, so
// the Leaderboard row can render an arrow from it and it can be unit-tested.
export function rankDeltas(rows, prevRanks) {
  const prev = prevRanks && typeof prevRanks === 'object' ? prevRanks : {}
  const out = {}
  for (const row of rows ?? []) {
    const before = prev[row.userId]
    out[row.userId] = Number.isFinite(before) ? before - row.rank : null
  }
  return out
}
