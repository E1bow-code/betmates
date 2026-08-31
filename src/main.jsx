import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App.jsx'
import { applyTheme, getStoredTheme } from './lib/theme.js'
// Side-effect import: attaches the beforeinstallprompt listener at startup so
// the native install offer isn't missed (it fires once, early - see the file).
import './lib/installPrompt.js'

// Applied before the first render, not inside a React effect, so a saved
// light-mode preference doesn't flash dark for a frame on load.
applyTheme(getStoredTheme())

// Legacy hash-link compatibility. The app moved from HashRouter to
// BrowserRouter, but invite/profile/referral/challenge links already shared in
// the wild are hash-based (e.g. /#/u/CODE). Under BrowserRouter the hash is
// ignored, so those would silently land on "/" instead of their target.
// Rewrite a legacy "#/path" to the real path before the router mounts, so every
// old link keeps working. Runs once, synchronously, ahead of the first render.
if (window.location.hash.startsWith('#/')) {
  const target = window.location.hash.slice(1) // "#/u/CODE" -> "/u/CODE"
  window.history.replaceState(null, '', target + window.location.search)
}

// initAnalytics() is NOT called here - it only fires post-consent, from
// CookieConsent.jsx (mounted in App.jsx). See src/lib/analytics.js.

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
