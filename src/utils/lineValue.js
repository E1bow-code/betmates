// Line value: did the price you took beat where the market moved to? It's the
// consumer-grade cousin of Closing Line Value (CLV) - the metric serious
// bettors judge themselves by - built from the price history this device has
// recorded for an outcome (src/lib/oddsMemory.js), not a true server-side
// close. So it's honest about being "vs the latest price you saw", not "vs the
// official close"; a scheduled odds-snapshot job writing odds_snapshots would
// upgrade the same UI to real CLV by supplying a better line price.
//
// Positive = you locked a bigger price than the market later showed (you found
// value before it corrected). That's the good side to be on.
import { getOddsHistory, historyKey } from '../lib/oddsMemory.js'

// The "line" price for a leg: the most recent recorded best price for that
// exact outcome. Null unless the leg carries its identity keys (added at bet
// time - older legs predate this) and this device has a recorded price.
function linePriceFor(leg) {
  if (!leg?.eventId || !leg?.marketKey || !leg?.outcomeName) return null
  const series = getOddsHistory(historyKey(leg.eventId, leg.marketKey, leg.outcomeName))
  const last = series?.[series.length - 1]
  return Number.isFinite(last?.p) ? last.p : null
}

// Line value for a single leg, or null when there's no comparable line price.
export function legLineValue(leg) {
  const line = linePriceFor(leg)
  const bet = Number(leg?.odds)
  if (line == null || !Number.isFinite(bet) || line <= 0) return null
  return { bet, line, deltaPct: (bet / line - 1) * 100, beat: bet > line }
}

// Line value for a whole entry. Only single-leg bets get one - an accumulator's
// price is the product of legs struck at different times, so a single "beat the
// line" verdict would be misleading.
export function betLineValue(entry) {
  if (!entry?.selections || entry.selections.length !== 1) return null
  return legLineValue(entry.selections[0])
}

// Across a set of entries, how often the bet price beat the line (only counting
// entries that have a comparable line price). Returns null below a minimum
// sample so a single data point doesn't read as a track record.
export function beatTheLineRate(entries, minSample = 3) {
  const values = (entries ?? []).map(betLineValue).filter(Boolean)
  if (values.length < minSample) return null
  const beat = values.filter((v) => v.beat).length
  return { rate: Math.round((beat / values.length) * 100), sample: values.length }
}

// Turns the same line-value comparison into a running £ total instead of a
// rate: across settled WINS where the bet price was worse than the line
// (didn't beat it), how much extra return the best price this device saw
// would have paid out. A loss's price doesn't change what it returned
// (£0 either way), so only wins count - this is about money actually left
// on the table, not price quality in the abstract.
export function moneyLeftOnTable(entries, minSample = 3) {
  const rows = (entries ?? [])
    .filter((e) => e.status === 'won' && e.stake)
    .map((e) => ({ stake: Number(e.stake), lv: betLineValue(e) }))
    .filter((r) => r.lv && !r.lv.beat)
  if (rows.length < minSample) return null
  const total = rows.reduce((sum, { stake, lv }) => sum + stake * (lv.line - lv.bet), 0)
  return { total: Math.round(total * 100) / 100, sample: rows.length }
}
