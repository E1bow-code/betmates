// "Reality check" reminder interval - a recognised UK safer-gambling tool: a
// periodic nudge telling you how long you've been in the app so a session
// can't quietly run away from you. Off by default; stored per-device in
// localStorage like the theme preference (it's a UI habit, not account data,
// and shouldn't need a round-trip or a schema column). Setting it fires a
// window event so a mounted RealityCheck picks up the change without a reload.
const KEY = 'betmates:realityCheckMins'
export const REALITY_CHECK_EVENT = 'betmates:realitycheck-changed'

export const REALITY_CHECK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 15, label: 'Every 15 min' },
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every hour' }
]

export function getRealityCheckMins() {
  const value = Number(localStorage.getItem(KEY))
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function setRealityCheckMins(mins) {
  if (mins > 0) localStorage.setItem(KEY, String(mins))
  else localStorage.removeItem(KEY)
  window.dispatchEvent(new Event(REALITY_CHECK_EVENT))
}
