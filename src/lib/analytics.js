import { analytics, initPostHog } from './analyticsClient.js'

// Optional Google Analytics 4. Off unless VITE_GA_ID is set at build time, so
// the app ships with NO third-party tracking by default and stays fully usable
// without it (same "missing config degrades" contract as every API key here).
//
// COMPLIANCE NOTE: BetMates is a UK gambling-adjacent app. In the UK/EU, GA
// sets cookies and must not load until the user has given consent. Do NOT just
// set VITE_GA_ID and ship - gate the call to initAnalytics() behind a real
// cookie-consent choice first. This file deliberately does nothing on its own
// until both (a) the env id is set and (b) you call it post-consent.
//
// PostHog follows the same contract: it is initialised here, inside the
// consent gate, never before. posthog-js itself is loaded lazily (a dynamic
// import inside initPostHog, see analyticsClient.js) so its ~88 kB gzip stays
// off first paint - it is fetched only when this runs, post-consent. Any
// capture/identify calls made before init are buffered by the lazy client and
// replayed once init completes, matching posthog-js's own pre-init queueing.
export function initAnalytics() {
  // ── Google Analytics 4 (optional) ──────────────────────────────────────
  const gaId = import.meta.env.VITE_GA_ID
  if (gaId && typeof document !== 'undefined' && typeof window !== 'undefined') {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    function gtag() {
      window.dataLayer.push(arguments)
    }
    window.gtag = gtag
    gtag('js', new Date())
    gtag('config', gaId)
  }

  // ── PostHog (always initialised when consent is given) ──────────────────
  const phToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
  const phHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST
  if (!phToken) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
        'this causes events to be silently missed. ' +
        'This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
      )
    }
    return
  }

  // Lazily import + initialise posthog-js (off the first-paint path), then
  // capture the page the user was on when they gave consent. initPostHog
  // resolves once the library is live; the buffered $pageview below is flushed
  // as part of that, but we also fire it after await so a warm (already-loaded)
  // client captures it immediately.
  initPostHog(phToken, {
    api_host: phHost,
    defaults: '2026-01-30',
    // Client-side navigation is tracked manually via $pageview captures in
    // RouteTitle.jsx, so automatic history-change capture is disabled to
    // avoid double-counting.
    capture_pageview: false,
  }).then(() => {
    // Capture the page the user was on when they gave consent.
    analytics.capture('$pageview')
  })
}
