// Plain client-side CSV generation + download - no library needed for
// something this simple, and it keeps a user's own bet history exportable
// without any server round-trip. Deliberately always decimal regardless of
// the Account odds-format preference (see OddsFormatContext.jsx) - a
// fraction like "21/20" isn't a number a spreadsheet can sort or do math
// on, and decimal is what every other odds export format uses anyway.
function csvEscape(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function trackerEntriesToCsv(entries) {
  const header = ['Date', 'Sport', 'Market', 'Selections', 'Combined Odds', 'Stake', 'Potential Return', 'Status', 'Settled At']
  const rows = entries.map((entry) => {
    const selections = entry.selections.map((s) => `${s.event} - ${s.market}: ${s.selection} @ ${s.odds.toFixed(2)} (${s.bookmaker})`).join(' | ')
    const combinedOdds = entry.selections.reduce((acc, s) => acc * s.odds, 1)
    return [
      new Date(entry.createdAt).toLocaleString(),
      entry.sport,
      entry.marketType,
      selections,
      combinedOdds.toFixed(2),
      entry.stake ?? '',
      entry.potentialReturn ?? '',
      entry.status,
      entry.settledAt ? new Date(entry.settledAt).toLocaleString() : ''
    ]
  })
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
