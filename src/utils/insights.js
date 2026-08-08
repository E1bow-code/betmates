import { SPORT_LABEL } from '../lib/sportsConfig.js'
import { moneyLeftOnTable } from './lineValue.js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// How "swingy" results are, not just what they average to. Coefficient of
// variation (stdev of per-bet profit, divided by average stake) rather than
// a raw £ stdev, so bettors staking different amounts are still comparable -
// a £50 swing means something different to someone staking £5 a time than
// someone staking £50. Needs at least 4 decided bets so a couple of results
// don't get graded as a "style" yet. Exported (not just used by
// computeInsights below) so the Home highlights strip can show the same
// figure without re-deriving the maths - see src/utils/homeHighlights.js.
export function computeBettingStyle(entries) {
  const decided = entries.filter((e) => e.stake && e.settledAt && (e.status === 'won' || e.status === 'lost'))
  if (decided.length < 4) return null

  const profitOf = (e) => (e.status === 'won' ? Number(e.potentialReturn) - Number(e.stake) : -Number(e.stake))
  const profits = decided.map(profitOf)
  const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length
  const variance = profits.reduce((sum, p) => sum + (p - avgProfit) ** 2, 0) / profits.length
  const stdev = Math.sqrt(variance)
  const avgStake = decided.reduce((sum, e) => sum + Number(e.stake), 0) / decided.length
  const cv = avgStake ? stdev / avgStake : 0
  const style = cv < 0.8 ? 'Steady' : cv < 1.5 ? 'Balanced' : 'Boom or bust'
  return { style, stdev }
}

// Six "Wrapped"-style cards built entirely from data the Tracker already
// has (bet_posts + manual_entries) - no new tables, same source as
// trackerStats.js. Each insight is omitted rather than shown empty/zeroed
// when there isn't enough history to say anything meaningful, mirroring
// Hall of Fame's `data[r.key]` filtering.
export function computeInsights(entries) {
  const insights = []

  const settled = entries.filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
  const decided = settled.filter((e) => e.status === 'won' || e.status === 'lost')
  const profitOf = (e) => (e.status === 'won' ? Number(e.potentialReturn) - Number(e.stake) : e.status === 'lost' ? -Number(e.stake) : 0)

  // Best day to bet - grouped by the day the bet was PLACED (createdAt),
  // not settled, since this is about a betting habit, not a settlement
  // quirk. Needs at least 2 settled bets placed on that weekday so a
  // single lucky Tuesday doesn't count.
  const byDay = new Map()
  for (const e of settled) {
    const day = new Date(e.createdAt).getDay()
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(e)
  }
  let bestDay = null
  for (const [day, dayEntries] of byDay) {
    if (dayEntries.length < 2) continue
    const profit = dayEntries.reduce((sum, e) => sum + profitOf(e), 0)
    if (!bestDay || profit > bestDay.profit) bestDay = { day, profit }
  }
  if (bestDay && bestDay.profit > 0) {
    insights.push({
      key: 'bestDay',
      icon: '📅',
      title: 'Best day to bet',
      value: `${DAY_NAMES[bestDay.day]} · +£${bestDay.profit.toFixed(2)}`
    })
  }

  // Most profitable sport - same grouping TrackerPage's per-sport
  // breakdown uses, but surfaced as a single headline rather than a list.
  const bySport = new Map()
  for (const e of settled) {
    const key = e.sport ?? 'football'
    if (!bySport.has(key)) bySport.set(key, [])
    bySport.get(key).push(e)
  }
  let topSport = null
  for (const [sport, sportEntries] of bySport) {
    const profit = sportEntries.reduce((sum, e) => sum + profitOf(e), 0)
    if (!topSport || profit > topSport.profit) topSport = { sport, profit }
  }
  if (topSport && topSport.profit > 0) {
    insights.push({
      key: 'topSport',
      icon: '🏅',
      title: 'Most profitable sport',
      value: `${SPORT_LABEL[topSport.sport] ?? topSport.sport} · +£${topSport.profit.toFixed(2)}`
    })
  }

  // Most used bookmaker - counted across every leg of every bet (not just
  // the first leg), so a multi-leg builder contributes each bookmaker it
  // actually used.
  const bookmakerCounts = new Map()
  for (const e of entries) {
    for (const leg of e.selections ?? []) {
      if (!leg.bookmaker) continue
      bookmakerCounts.set(leg.bookmaker, (bookmakerCounts.get(leg.bookmaker) ?? 0) + 1)
    }
  }
  let topBookmaker = null
  for (const [bookmaker, count] of bookmakerCounts) {
    if (!topBookmaker || count > topBookmaker.count) topBookmaker = { bookmaker, count }
  }
  if (topBookmaker) {
    insights.push({
      key: 'topBookmaker',
      icon: '🏦',
      title: 'Most used bookmaker',
      value: `${topBookmaker.bookmaker} · ${topBookmaker.count} pick${topBookmaker.count === 1 ? '' : 's'}`
    })
  }

  // Best market - highest win rate among market types with at least 2
  // decided (won/lost) bets, so a single 1-0 market type doesn't "win".
  const byMarket = new Map()
  for (const e of decided) {
    const key = e.marketType ?? 'Bet'
    if (!byMarket.has(key)) byMarket.set(key, [])
    byMarket.get(key).push(e)
  }
  let bestMarket = null
  for (const [market, marketEntries] of byMarket) {
    if (marketEntries.length < 2) continue
    const wins = marketEntries.filter((e) => e.status === 'won').length
    const winRate = Math.round((wins / marketEntries.length) * 100)
    if (!bestMarket || winRate > bestMarket.winRate) bestMarket = { market, winRate }
  }
  if (bestMarket && bestMarket.winRate > 0) {
    insights.push({
      key: 'bestMarket',
      icon: '🎯',
      title: 'Best market',
      value: `${bestMarket.market} · ${bestMarket.winRate}% win rate`
    })
  }

  // Average stake - across every entry with a stake logged, win/lose/void/
  // still open, since this is about habit, not results.
  const staked = entries.filter((e) => e.stake)
  if (staked.length >= 2) {
    const avg = staked.reduce((sum, e) => sum + Number(e.stake), 0) / staked.length
    insights.push({ key: 'avgStake', icon: '💷', title: 'Average stake', value: `£${avg.toFixed(2)}` })
  }

  // Best value pick - single highest-odds LEG among won bets, i.e. the
  // longest shot that actually came in. Uses the individual leg's own
  // odds (not a combined accumulator price) so it's always a single price.
  let valuePick = null
  for (const e of entries) {
    if (e.status !== 'won') continue
    for (const leg of e.selections ?? []) {
      if (!valuePick || leg.odds > valuePick.odds) valuePick = { odds: leg.odds, event: leg.event }
    }
  }
  if (valuePick) {
    insights.push({ key: 'valuePick', icon: '💎', title: 'Best value pick', value: `${valuePick.odds.toFixed(2)} on ${valuePick.event}` })
  }

  // Betting style - how "swingy" results are, not just what they average
  // to. See computeBettingStyle below for the maths (shared with the Home
  // highlights strip).
  const bettingStyle = computeBettingStyle(entries)
  if (bettingStyle) {
    insights.push({
      key: 'volatility',
      icon: '🎢',
      title: 'Betting style',
      value: `${bettingStyle.style} · £${bettingStyle.stdev.toFixed(2)} swing per bet`
    })
  }

  // Money left on the table - the £ version of the Tracker's "beat the
  // line" badge (src/utils/lineValue.js), built from the same device-local
  // price history. Best-effort and device-only by the same admission that
  // file already makes, but it's the only figure the app has for "what did
  // a worse price actually cost you".
  const leftOnTable = moneyLeftOnTable(entries)
  if (leftOnTable && leftOnTable.total > 0) {
    insights.push({
      key: 'moneyLeftOnTable',
      icon: '🪙',
      title: 'Money left on the table',
      value: `£${leftOnTable.total.toFixed(2)} (${leftOnTable.sample} bet${leftOnTable.sample === 1 ? '' : 's'})`
    })
  }

  return insights
}
