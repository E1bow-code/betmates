// Nova's eye on the market: pick the single biggest "sharp money" move across a
// batch of odds_snapshots rows, so odds-snapshot.js can post one Discord line
// about the day's most notable steam. Pure and I/O-free (the caller passes the
// rows it already queried) so `npm test` covers it. The move detection itself
// is src/utils/sharpMoney.js - the one place in the app that reads a price's
// own history - reused here rather than re-derived, so Nova and the in-app
// SharpMoneyBadge can never disagree on what counts as a real move.
//
// Like the SharpMoneyBadge, this is a market-movement observation, not a tip:
// "money's coming for this price" / "money's coming off it", never "back it".
import { detectSharpMoney } from '../utils/sharpMoney.js'

/**
 * @param {Array<{fixture_id:string, market:string, selection:string, bookmaker:string, odds:number, fetched_at:string}>} rows
 *   raw odds_snapshots rows for the fixtures of interest (any order).
 * @returns {{ fixtureId:string, market:string, selection:string, bookmaker:string,
 *   direction:'shortening'|'drifting', pct:number, from:number, to:number } | null}
 *   the biggest qualifying move, or null if nothing clears the sharp-money bar.
 */
export function biggestSharpMove(rows) {
  // Group each outcome's price history: one series per fixture/market/selection
  // /bookmaker, so detectSharpMoney compares like with like.
  const series = new Map()
  for (const r of rows ?? []) {
    if (!r?.fixture_id || !r?.selection || !Number.isFinite(Number(r?.odds))) continue
    const key = `${r.fixture_id}|${r.market}|${r.selection}|${r.bookmaker}`
    if (!series.has(key)) series.set(key, { meta: r, points: [] })
    series.get(key).points.push({ odds: Number(r.odds), fetchedAt: r.fetched_at })
  }

  let best = null
  for (const { meta, points } of series.values()) {
    const move = detectSharpMoney(points)
    if (!move) continue
    if (!best || move.pct > best.pct) {
      best = {
        fixtureId: meta.fixture_id,
        market: meta.market,
        selection: meta.selection,
        bookmaker: meta.bookmaker,
        ...move
      }
    }
  }
  return best
}
