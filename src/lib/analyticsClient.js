// Lazy PostHog client. posthog-js is ~266 kB (~88 kB gzip) and must not sit on
// the first-paint critical path - and, being a tracker, must not load at all
// before the user accepts cookies. This wrapper exposes the small surface the
// app actually uses (capture / identify / reset / captureException) but keeps
// posthog-js itself out of the initial bundle: it is dynamically imported only
// when initPostHog() runs, which happens exclusively post-consent, from
// initAnalytics() in analytics.js.
//
// Semantics deliberately match posthog-js's own "queue calls made before init,
// replay them after" behaviour (the thing analytics.js used to rely on): until
// init, every call is a no-op that is buffered in memory; on init we import the
// library, initialise it, and replay the buffer. This preserves the previous
// behaviour for a returning consented visitor (whose session-restore identify /
// pageview fire a tick before the async import resolves) while moving the 88 kB
// load off first paint.
//
// Pre-consent safety: initPostHog() is only ever called after an explicit
// "Accept" (see CookieConsent.jsx), so nothing buffered here is ever sent unless
// and until that happens. A visitor who never consents never loads the library
// and never transmits anything - the buffer is just discarded with the tab.

let ph = null // the real posthog-js default export, once loaded + initialised
let loading = null // in-flight import promise, so init runs its import once
const buffer = [] // [method, args] calls made before init; replayed on init
// Bound the buffer so a session that never consents (init never runs) can't grow
// it without limit. 50 is far more analytics calls than any pre-consent session
// realistically makes; older calls are simply dropped past the cap.
const BUFFER_CAP = 50

function enqueue(method, args) {
  if (ph) {
    ph[method](...args)
    return
  }
  if (buffer.length < BUFFER_CAP) buffer.push([method, args])
}

// The surface the app imports in place of the posthog-js default export. Every
// method is safe to call at any time - it forwards once posthog is live and
// no-ops (buffered) until then.
export const analytics = {
  capture: (...args) => enqueue('capture', args),
  identify: (...args) => enqueue('identify', args),
  reset: (...args) => enqueue('reset', args),
  captureException: (...args) => enqueue('captureException', args),
}

// Called post-consent from initAnalytics(). Dynamically imports posthog-js,
// initialises it with the given token/options, replays anything buffered before
// the library finished loading, then points the wrapper straight at it.
// Idempotent: CookieConsent re-mounts and calls initAnalytics() on every load
// once consent is stored, so repeated calls reuse the first import/init.
export function initPostHog(token, options) {
  if (ph) return Promise.resolve(ph)
  if (loading) return loading
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, options)
      ph = posthog
      // Replay every call made while the library was still loading, in order.
      for (const [method, args] of buffer.splice(0)) posthog[method](...args)
      return posthog
    })
    .catch((err) => {
      // A failed analytics import must never take the app down. Clear the
      // in-flight marker so a later consent re-trigger can retry, and drop the
      // buffer rather than hold it forever.
      loading = null
      buffer.length = 0
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('posthog-js failed to load; analytics disabled this session', err)
      }
      return null
    })
  return loading
}
