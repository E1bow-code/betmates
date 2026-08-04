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
