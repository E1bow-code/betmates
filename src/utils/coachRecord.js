import { computeStats } from './trackerStats.js'

// CoachGPT's recommendations aren't real staked bets - there's no stake to
// read back. A notional flat 1-unit stake per pick lets computeStats'
// existing win-rate/ROI formula (same one Tracker/tipsterBadge.js already
// use) produce a meaningful figure: profit becomes "units" rather than a
// currency amount, which coachScoreboard callers should label accordingly.
function toStatsEntry(message) {
  const odds = Number(message.recommendation?.odds)
  return {
    stake: 1,
    status: message.result,
    potentialReturn: message.result === 'won' ? odds : 0
  }
}

// Only messages CoachGPT actually locked in a recommendation for AND that
// have since settled count - an open (result: null) recommendation isn't a
// result yet, so it's excluded rather than counted as pending noise.
export function computeCoachRecord(messages) {
  const settled = (messages ?? []).filter((m) => m.recommendation && ['won', 'lost', 'void'].includes(m.result))
  if (!settled.length) return null
  return computeStats(settled.map(toStatsEntry))
}
