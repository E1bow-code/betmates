// Builds the compact, already-aggregated record the Coach reasons over
// (netlify/functions/coach.js). Everything here is derived from the same
// bet_posts + manual_entries the rest of the Tracker uses - we send Claude
// these rolled-up numbers, never the individual bet rows, so nothing
// identifying leaves the browser and the request stays tiny.
import { SPORT_LABEL } from '../lib/sportsConfig.js'
import { computeStats, computeStreak } from './trackerStats.js'

const profitOf = (e) =>
  e.status === 'won'
    ? Number(e.potentialReturn) - Number(e.stake)
    : e.status === 'lost'
      ? -Number(e.stake)
      : 0

function topBy(map, pick = 'max') {
  let best = null
  for (const [key, val] of map) {
    if (!best || (pick === 'max' ? val > best.val : val < best.val)) best = { key, val }
  }
  return best
}

export function buildCoachSummary(entries) {
  const stats = computeStats(entries)
  const streak = computeStreak(entries)
  const settled = entries.filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
  const decided = settled.filter((e) => e.status === 'won' || e.status === 'lost')

  const summary = {
    settled: stats.settledCount,
    winRate: stats.winRate ?? undefined,
    profit: stats.profit,
    roi: stats.roi ?? undefined
  }

  const staked = entries.filter((e) => e.stake)
  if (staked.length) {
    summary.avgStake = staked.reduce((s, e) => s + Number(e.stake), 0) / staked.length
    summary.biggestStake = Math.max(...staked.map((e) => Number(e.stake)))
  }

  // Best / worst sport by net P&L, so the Coach can speak to where the record
  // is actually strong vs where it's leaking.
  const bySport = new Map()
  for (const e of settled) {
    const key = e.sport ?? 'football'
    bySport.set(key, (bySport.get(key) ?? 0) + profitOf(e))
  }
  if (bySport.size) {
    const top = topBy(bySport, 'max')
    const worst = topBy(bySport, 'min')
    if (top && top.val > 0) summary.topSport = `${SPORT_LABEL[top.key] ?? top.key} (+£${top.val.toFixed(2)})`
    if (worst && worst.val < 0 && bySport.size > 1) summary.worstSport = `${SPORT_LABEL[worst.key] ?? worst.key} (£${worst.val.toFixed(2)})`
  }

  // Best market by win rate, min 2 decided so a single bet can't top it.
  const byMarket = new Map()
  for (const e of decided) {
    const key = e.marketType ?? 'Bet'
    if (!byMarket.has(key)) byMarket.set(key, { won: 0, total: 0 })
    const m = byMarket.get(key)
    m.total++
    if (e.status === 'won') m.won++
  }
  let bestMarket = null
  for (const [market, m] of byMarket) {
    if (m.total < 2) continue
    const rate = Math.round((m.won / m.total) * 100)
    if (!bestMarket || rate > bestMarket.rate) bestMarket = { market, rate }
  }
  if (bestMarket) summary.topMarket = `${bestMarket.market} (${bestMarket.rate}%)`

  const bookmakerCounts = new Map()
  let oddsSum = 0
  let oddsN = 0
  let accas = 0
  for (const e of entries) {
    const legs = e.selections ?? []
    if (legs.length > 1) accas++
    for (const leg of legs) {
      if (leg.bookmaker) bookmakerCounts.set(leg.bookmaker, (bookmakerCounts.get(leg.bookmaker) ?? 0) + 1)
    }
    if (Number.isFinite(Number(e.odds))) {
      oddsSum += Number(e.odds)
      oddsN++
    }
  }
  const favBookmaker = topBy(bookmakerCounts, 'max')
  if (favBookmaker) summary.favBookmaker = `${favBookmaker.key} (${favBookmaker.val} picks)`
  if (oddsN) summary.avgOdds = oddsSum / oddsN
  if (entries.length) summary.accaShare = Math.round((accas / entries.length) * 100)

  if (streak.type) summary.currentStreak = streak.type === 'won' ? streak.count : -streak.count

  return summary
}
