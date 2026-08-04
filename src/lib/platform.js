// iOS Safari has no `beforeinstallprompt` (the API Chrome/Edge/Android use
// to offer their own native install button) - "Add to Home Screen" only
// exists behind the manual Share-sheet flow there, so it's the one platform
// that actually needs an in-app guide pointing people at it.
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}
