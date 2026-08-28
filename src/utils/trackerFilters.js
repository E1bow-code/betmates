// Status filtering for the Tracker's bet-history list. Once someone's logged a
// stack of bets the flat list is hard to scan - "just show me my open ones" or
// "just the wins" is the common ask. Pure so the pill counts and the filtered
// list are both unit-testable without a backend.

// The filters offered, in display order. 'all' first (the default); 'void' last
// because it's the rare one. Each settled key matches a bet `status` verbatim.
export const TRACKER_FILTERS = ['all', 'open', 'won', 'lost', 'void']

const LABELS = { all: 'All', open: 'Open', won: 'Won', lost: 'Lost', void: 'Void' }
export const trackerFilterLabel = (key) => LABELS[key] ?? key

// How many entries fall under each filter, for the pill badges. 'all' is the
// full count; the rest are per-status. A status with zero entries still gets a
// 0 here - the caller decides whether to hide an empty pill.
export function countByStatus(entries) {
  const list = entries ?? []
  const counts = { all: list.length, open: 0, won: 0, lost: 0, void: 0 }
  for (const e of list) {
    if (e && e.status in counts) counts[e.status] += 1
  }
  return counts
}

// The entries under one filter. 'all' (and any unknown key) passes everything
// through unchanged, so a stale/garbage filter value can never blank the list.
export function filterByStatus(entries, key) {
  const list = entries ?? []
  if (key === 'all' || !TRACKER_FILTERS.includes(key)) return list
  return list.filter((e) => e && e.status === key)
}
