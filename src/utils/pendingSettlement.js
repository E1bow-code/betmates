// Open bets whose event has almost certainly finished, so the user can settle
// them and keep their P&L honest. auto-settle.js already closes anything with
// score coverage on Tracker load, so what's left here is the bets that need a
// human call - and this just surfaces them.
//
// Deliberately conservative: every leg must carry a kickoff and the latest one
// must be more than SETTLE_BUFFER_HOURS ago. A bet with any leg missing a
// kickoff (a manual entry, say) is skipped rather than guessed at, so this
// never nags about a bet that might not have kicked off yet.
const SETTLE_BUFFER_HOURS = 4

export function pendingSettlement(entries, now = Date.now()) {
  const cutoff = now - SETTLE_BUFFER_HOURS * 60 * 60 * 1000
  return (entries ?? []).filter((e) => {
    if (e.status !== 'open') return false
    const legs = e.selections ?? []
    if (!legs.length) return false
    const kickoffs = legs.map((l) => (l.kickoff ? new Date(l.kickoff).getTime() : NaN))
    if (kickoffs.some((t) => !Number.isFinite(t))) return false // unknown -> don't nag
    return Math.max(...kickoffs) < cutoff // latest event started well before now -> finished
  })
}
