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

// Units P&L for a single settled pick at level 1-unit stakes: a winner returns
// its price (odds - 1 profit), a loser costs the stake, a void is a wash. Same
// math toStatsEntry feeds computeStats, exposed here for the per-sport split.
function unitProfit(message) {
  const odds = Number(message.recommendation?.odds)
  if (message.result === 'won') return Number.isFinite(odds) ? odds - 1 : 0
  if (message.result === 'lost') return -1
  return 0
}

// A compact, model-friendly summary of CoachGPT's OWN tipster record for the
// get_coach_record tool: overall units P&L / hit rate / ROI (via the same
// computeStats the scoreboard uses, so the two can never disagree) plus a
// per-sport breakdown. Pure - the netlify function does the Supabase read and
// hands the rows in. Returns { available: false, reason } when there's nothing
// settled to report, mirroring get_my_record's degrade-don't-throw contract.
export function summariseCoachRecord(messages, scope = 'all sports') {
  const settled = (messages ?? []).filter((m) => m.recommendation && ['won', 'lost', 'void'].includes(m.result))
  if (!settled.length) {
    return { available: false, reason: scope && scope !== 'all sports' ? `no settled ${scope} picks yet` : 'no settled picks yet' }
  }
  const stats = computeStats(settled.map(toStatsEntry))
  const groups = new Map()
  for (const m of settled) {
    const name = m.recommendation?.sport || 'other'
    if (!groups.has(name)) groups.set(name, { name, picks: 0, won: 0, units: 0 })
    const g = groups.get(name)
    g.picks += 1
    if (m.result === 'won') g.won += 1
    g.units = Math.round((g.units + unitProfit(m)) * 100) / 100
  }
  const bySport = [...groups.values()].sort((a, b) => b.picks - a.picks).slice(0, 6)
  return {
    available: true,
    scope,
    settledPicks: settled.length,
    won: settled.filter((m) => m.result === 'won').length,
    lost: settled.filter((m) => m.result === 'lost').length,
    void: settled.filter((m) => m.result === 'void').length,
    hitRate: stats.winRate != null ? `${stats.winRate}%` : null,
    unitsProfit: Math.round(stats.profit * 100) / 100,
    roi: stats.roi != null ? `${stats.roi}%` : null,
    bySport,
    note: settled.length < 10 ? 'Small sample - an early read, not a verdict.' : undefined
  }
}
