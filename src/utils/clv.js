// Closing Line Value (CLV): did the price you struck beat the market's closing
// line? It's the metric serious bettors judge themselves by. This is the true
// version of the consumer-grade approximation in src/utils/lineValue.js - that
// one compares against the latest price *this device* happened to record
// (src/lib/oddsMemory.js); CLV compares against a real server-side close
// captured by netlify/functions/odds-snapshot.js into the odds_snapshots table.
// Same maths, better line: honest "vs the official close", consistent across
// devices, and computed only from data the backend actually recorded.
//
// This module stays pure and free of I/O: the caller passes in the closing
// prices (dataStore.getClosingLines feeds the real ones; a test passes a plain
// map), keyed by the same leg identity odds_snapshots stores.
//
// Positive delta = you locked a bigger price than the close, i.e. you beat the
// market before it corrected. That's the good side to be on.

// Mirrors the (fixture, market, selection) identity a leg carries and
// odds_snapshots records, so a leg can look up its own closing price.
export function closingKey(eventId, marketKey, outcomeName) {
  return `${eventId}|${marketKey}|${outcomeName}`
}

// CLV for a single leg given its closing price, or null when either price is
// missing or unusable (<= 0). Shape matches lineValue.js's legLineValue so UI
// that renders one can render the other.
export function legClv(leg, closingPrice) {
  const bet = Number(leg?.odds)
  const close = Number(closingPrice)
  if (!Number.isFinite(bet) || !Number.isFinite(close) || bet <= 0 || close <= 0) return null
  return { bet, close, deltaPct: (bet / close - 1) * 100, beat: bet > close }
}

// Same, but resolves the closing price from a { key: decimal } map (as returned
// by dataStore.getClosingLines). Null unless the leg carries its identity keys
// (added at bet time - older legs predate this) and the map has a close for it.
export function legClvFromMap(leg, closes) {
  if (!leg?.eventId || !leg?.marketKey || !leg?.outcomeName) return null
  const close = closes?.[closingKey(leg.eventId, leg.marketKey, leg.outcomeName)]
  return legClv(leg, close)
}

// CLV for a whole entry. Only single-leg bets get one - an accumulator's price
// is the product of legs struck at different times, so a single "beat the close"
// verdict would be misleading. Matches lineValue.js's betLineValue restriction.
export function betClv(entry, closes) {
  if (!entry?.selections || entry.selections.length !== 1) return null
  return legClvFromMap(entry.selections[0], closes)
}

// Aggregate CLV across a set of entries: the average CLV %, how often the struck
// price beat the close, and the sample size it's based on. Only entries with a
// comparable closing price count. Returns null below a minimum sample so a
// single bet doesn't read as a track record - same guard as beatTheLineRate.
export function clvSummary(entries, closes, minSample = 3) {
  const values = (entries ?? []).map((entry) => betClv(entry, closes)).filter(Boolean)
  if (values.length < minSample) return null
  const beat = values.filter((v) => v.beat).length
  const avgPct = values.reduce((sum, v) => sum + v.deltaPct, 0) / values.length
  return {
    avgPct: Math.round(avgPct * 100) / 100,
    beatRate: Math.round((beat / values.length) * 100),
    sample: values.length
  }
}
