// Flags legs in a multi that share the same event - two markets on the
// same match/fight/race are NOT independent (e.g. a team to win + BTTS on
// that same game), so the accumulator's combined odds (a straight product
// of each leg's price - see BetBuilderSheet.jsx) overstate how spread out
// the real risk actually is. Pure, no I/O - purely advisory, never blocks
// building or posting the bet.
//
// Grouped by eventId where every leg has one (the identity key stamped by
// every detail page), falling back to the display `event` string for
// older/racing legs that predate it - either way, two legs naming the same
// fixture are correlated regardless of which key resolved the match.
export function detectSameGameCorrelation(legs) {
  if (!legs || legs.length < 2) return null
  const groups = new Map()
  for (const leg of legs) {
    const key = leg.eventId ?? leg.event
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(leg)
  }
  const correlated = [...groups.values()].filter((g) => g.length > 1)
  if (!correlated.length) return null
  return {
    events: correlated.map((g) => ({ event: g[0].event, legCount: g.length })),
    legCount: correlated.reduce((sum, g) => sum + g.length, 0)
  }
}
