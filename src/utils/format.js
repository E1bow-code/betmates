// Render a GBP amount for display: always 2dp, matching how money is stored
// (rounded to 2dp at store time). Returns '' for a null/undefined/non-numeric
// value, so a caller that already guards truthiness stays safe and nothing ever
// renders "£NaN". Deliberately NO thousands separators: this mirrors the plain
// `£${Number(x).toFixed(2)}` it replaces across the UI, so adopting it is a pure
// consolidation with no change to what users see.
export function formatGBP(value) {
  if (value == null || value === '') return '' // no value (null/undefined/empty) -> render nothing, NOT £0.00
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `£${n.toFixed(2)}`
}

// Same, but for a signed figure (profit/P&L), preserving the app's existing
// convention exactly: a non-negative value gets a leading '+' (so +£5.00 and
// +£0.00), a negative value keeps the minus that toFixed already renders after
// the £ (£-5.00) - i.e. identical output to `${n >= 0 ? '+' : ''}£${n.toFixed(2)}`.
export function formatSignedGBP(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `${n >= 0 ? '+' : ''}£${n.toFixed(2)}`
}

export function formatKickoff(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatCountdown(iso) {
  const diffMs = new Date(iso) - new Date()
  if (diffMs <= 0) return 'KO'
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

// "5m ago" / "3h ago" / "2d ago" - falls back to a plain date once it's far
// enough back that a relative label stops being useful (matches the app's
// other date fields switching to absolute at that point too).
export function formatRelativeTime(iso) {
  const diffMs = new Date() - new Date(iso)
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
