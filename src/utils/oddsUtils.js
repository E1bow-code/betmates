// Recomputes "best odds" against a restricted set of bookmakers, for the
// Odds tab's "my bookies only" filter (Section 2A).

export function bestWithinFilter(allOdds, bookmakerFilter) {
  const pool = bookmakerFilter?.length ? allOdds.filter((o) => bookmakerFilter.includes(o.bookmaker)) : allOdds
  if (!pool.length) return null
  return pool.reduce((a, b) => (b.decimal > a.decimal ? b : a))
}
