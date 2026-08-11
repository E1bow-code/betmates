// Optional Google Analytics 4. Off unless VITE_GA_ID is set at build time, so
// the app ships with NO third-party tracking by default and stays fully usable
// without it (same "missing config degrades" contract as every API key here).
//
// COMPLIANCE NOTE: BetMates is a UK gambling-adjacent app. In the UK/EU, GA
// sets cookies and must not load until the user has given consent. Do NOT just
// set VITE_GA_ID and ship - gate the call to initAnalytics() behind a real
// cookie-consent choice first. This file deliberately does nothing on its own
// until both (a) the env id is set and (b) you call it post-consent.
export function initAnalytics() {
  const id = import.meta.env.VITE_GA_ID
  if (!id || typeof document === 'undefined' || typeof window === 'undefined') return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag = gtag
  gtag('js', new Date())
  gtag('config', id)
}
