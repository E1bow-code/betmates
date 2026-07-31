export function formatOffTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatCountdown(iso) {
  const diffMs = new Date(iso) - new Date()
  if (diffMs <= 0) return 'Off'
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
