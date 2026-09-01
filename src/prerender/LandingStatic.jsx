import LandingPitch from '../components/LandingPitch.jsx'

// Static, SSR-safe snapshot of what a logged-out visitor sees at "/" - the
// marketing pitch plus the sign-up card's headline copy. This exists purely
// so scripts/prerender.mjs can bake real, crawlable text into dist/index.html
// at build time (see that file and the issue #131 discussion): an SPA
// otherwise ships an empty <div id="app"> to crawlers and social unfurlers.
//
// Deliberately NOT the real AuthPage: that pulls in useAuth() (an AuthProvider
// context), react-router <Link>s (a Router context) and a photo-fetch effect,
// none of which belong in a build-time, browser-free render. The real
// interactive form is added by the client on mount. main.jsx uses createRoot
// (not hydrateRoot), so React cleanly discards this markup and re-renders the
// live app - there is no hydration-match requirement, and the only visible
// difference is a faster, content-ful first paint. Keep the wrapper classes in
// sync with .auth-page / .auth-layout / .auth-card in style.css so that first
// paint is styled rather than unstyled text.
//
// LandingPitch is the shared source of truth for the pitch copy, imported here
// rather than duplicated, so the prerendered text can never drift from what the
// live page shows.
export default function LandingStatic() {
  return (
    <div className="auth-page">
      <div className="auth-page-scrim" />
      <div className="auth-layout">
        <LandingPitch onGetStarted={() => {}} />
        <div className="auth-card" id="auth-form">
          <h1 className="auth-title">
            <img src="/favicon.svg" alt="" className="auth-logo-mark" />
            BetMates
          </h1>
          <p className="auth-subtitle">Compare odds. Settle scores with your mates.</p>
          <p className="auth-footnote">
            BetMates does not place bets or hold funds. 18+. Gamble responsibly.{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">
              BeGambleAware.org
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
