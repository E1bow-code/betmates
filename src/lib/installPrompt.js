// Captures the browser's `beforeinstallprompt` event (Chrome / Edge / Android)
// so the app can offer a real one-tap "Install" later, instead of ignoring it
// and leaving those users no way in but the browser's buried menu. The event
// fires early on load and only once, so this module attaches its listener at
// import time (imported for its side effect in main.jsx) and stashes the event
// for a component to use whenever it mounts.
//
// iOS Safari never fires this - there "Add to Home Screen" is a manual
// Share-sheet flow, which keeps the InstallGuide steps (see platform.js).
let deferredPrompt = null
const listeners = new Set()

function notify(available) {
  for (const fn of listeners) fn(available)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's default mini-infobar; we surface our own prompt instead.
    e.preventDefault()
    deferredPrompt = e
    notify(true)
  })
  // If they install through the browser's own UI, drop the stashed event so we
  // stop offering it.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify(false)
  })
}

export function canPromptInstall() {
  return deferredPrompt != null
}

// Subscribe to availability changes; returns an unsubscribe fn.
export function onInstallAvailabilityChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Fires the native install prompt. Returns 'accepted' | 'dismissed' |
// 'unavailable'. A stashed prompt can only be used once, so it's cleared after.
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify(false)
  return outcome
}
