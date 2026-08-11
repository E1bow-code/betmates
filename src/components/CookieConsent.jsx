import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { initAnalytics } from '../lib/analytics.js'

const CONSENT_KEY = 'bm-cookie-consent'

// The only thing standing between src/lib/analytics.js and a live tracking
// cookie in the UK/EU - initAnalytics() is a no-op until this fires it, and
// it only fires on an explicit "Accept", never on load, scroll, or a close-X.
// Per-device (localStorage), not per-account, since it has to hold for
// signed-out visitors on AuthPage too, before there's a user row to attach it to.
export default function CookieConsent() {
  const [choice, setChoice] = useState(() => localStorage.getItem(CONSENT_KEY))

  useEffect(() => {
    if (choice === 'accepted') initAnalytics()
  }, [choice])

  if (choice) return null

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setChoice('accepted')
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, 'declined')
    setChoice('declined')
  }

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p>
        We'd like to use optional analytics cookies to see how BetMates is used - only if you say yes. See our{' '}
        <Link to="/legal">Privacy Policy</Link>.
      </p>
      <div className="cookie-consent-actions">
        <button className="btn btn-ghost" onClick={decline}>
          Decline
        </button>
        <button className="btn btn-primary" onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  )
}
