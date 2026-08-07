// The "if only" list: multis that lost with exactly one leg going wrong,
// not the whole thing falling apart. Needs the per-leg `outcomes` array
// settlement.js/auto-settle.js write for multi-leg entries (see
// betEvaluation.js) - a manually marked "Lost" has no per-leg breakdown to
// blame one selection over another, so those are silently excluded rather
// than guessed at.
//
// Sorted cruellest first: more legs right (only one wrong out of many) beats
// fewer, and within the same leg count, the bigger the missed payout the
// crueller the beat.
export function findBadBeats(entries, limit = 10) {
  const beats = (entries ?? [])
    .filter(
      (e) =>
        e.status === 'lost' &&
        e.selections?.length > 1 &&
        Array.isArray(e.outcomes) &&
        e.outcomes.length === e.selections.length
    )
    .map((e) => {
      const lostIndexes = e.outcomes.reduce((acc, o, i) => (o === 'lost' ? [...acc, i] : acc), [])
      if (lostIndexes.length !== 1) return null
      return {
        id: e.id,
        legCount: e.selections.length,
        missedLeg: e.selections[lostIndexes[0]],
        stake: e.stake != null ? Number(e.stake) : null,
        wouldHaveReturned: e.potentialReturn != null ? Number(e.potentialReturn) : null,
        settledAt: e.settledAt
      }
    })
    .filter(Boolean)

  return beats
    .sort((a, b) => b.legCount - a.legCount || (b.wouldHaveReturned ?? 0) - (a.wouldHaveReturned ?? 0))
    .slice(0, limit)
}
