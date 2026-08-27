import posthog from 'posthog-js'

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
// consent gate, never before. Any capture/identify calls made before init
// are quietly queued by posthog-js and replayed once init completes.
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

  posthog.init(phToken, {
    api_host: phHost,
    defaults: '2026-01-30',
    // HashRouter navigation is tracked manually via $pageview captures in
    // RouteTitle.jsx, so automatic history-change capture is disabled to
    // avoid double-counting.
    capture_pageview: false,
  })

  // Capture the page the user was on when they gave consent.
  posthog.capture('$pageview')
}
