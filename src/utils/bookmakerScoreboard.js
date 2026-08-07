// Ranks bookmakers by the value they've actually delivered across every bet
// this viewer can see - their own tracker entries, their groups' posts, and
// the public feed - rather than a synthetic score. No bookmaker publishes
// this about itself, and it's not something a pure EV/CLV tracker surfaces
// as a leaderboard either; BetMates already records a bookmaker + odds on
// every leg, so this is just a regroup of data the app collects anyway.
//
// Multi-leg bets are excluded entirely: a bet builder can combine legs from
// different bookmakers, so there's no single bookmaker to credit or blame
// for the combined result - the same reasoning betLineValue uses to only
// score single-leg bets. Ranked by ROI like the tipster board, not raw
// profit, and gated on a minimum settled sample so one bookmaker's single
// lucky or unlucky result can't swing the table.
import { computeStats } from './trackerStats.js'
import { betLineValue } from './lineValue.js'

export const MIN_SETTLED_TO_RANK = 3

export function computeBookmakerScoreboard(entries) {
  const singleLeg = (entries ?? []).filter(
    (e) => !e.stakeHidden && e.selections?.length === 1 && e.selections[0].bookmaker
  )

  const byBookmaker = new Map()
  for (const entry of singleLeg) {
    const bookmaker = entry.selections[0].bookmaker
    if (!byBookmaker.has(bookmaker)) byBookmaker.set(bookmaker, [])
    byBookmaker.get(bookmaker).push(entry)
  }

  return [...byBookmaker.entries()]
    .map(([bookmaker, bookmakerEntries]) => {
      const stats = computeStats(bookmakerEntries)
      // Beat-the-line rate is a secondary, best-effort signal - only ever as
      // reliable as this device's recorded price history (see lineValue.js),
      // so it's reported alongside ROI rather than used to rank.
      const lineValues = bookmakerEntries.map(betLineValue).filter(Boolean)
      const beatCount = lineValues.filter((lv) => lv.beat).length
      return {
        bookmaker,
        ...stats,
        beatLineRate: lineValues.length ? Math.round((beatCount / lineValues.length) * 100) : null,
        beatLineSample: lineValues.length
      }
    })
    .filter((row) => row.settledCount >= MIN_SETTLED_TO_RANK && row.roi !== null)
    .sort((a, b) => b.roi - a.roi || b.settledCount - a.settledCount)
}
