import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { requestPasswordReset } from '../lib/dataStore.js'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { fetchSportPhoto } from '../api/photoClient.js'
import { PENDING_REFERRAL_KEY } from '../lib/referral.js'

function todayMinusYears(years) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

export default function AuthPage() {
  const { signUp, signIn } = useAuth()
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [dob, setDob] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [bannerUrl, setBannerUrl] = useState(null)

  useEffect(() => {
    fetchSportPhoto('auth').then(setBannerUrl)
  }, [])

  async function handleResetRequest(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setResetSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        if (!acceptedTerms) throw new Error('You must confirm your age and accept the Terms to continue.')
        const referredByCode = localStorage.getItem(PENDING_REFERRAL_KEY)
        localStorage.removeItem(PENDING_REFERRAL_KEY)
        await signUp({ email, password, displayName, dob, referredByCode })
      } else {
        await signIn({ email, password })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'reset') {
    return (
      <div className="auth-page" style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}>
        <div className="auth-page-scrim" />
        <div className="auth-card">
          <h1 className="auth-title">BetMates</h1>
          <p className="auth-subtitle">Reset your password</p>

          {resetSent ? (
            <>
              <p className="hint">
                If an account exists for <strong>{email}</strong>, a reset link is on its way - check your inbox.
              </p>
              <button className="btn btn-secondary" onClick={() => setMode('signin')} type="button">
                Back to sign in
              </button>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleResetRequest}>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </label>

              {error && <div className="auth-error">{error}</div>}
              {!isSupabaseConfigured && <div className="auth-error">Password reset needs a connected Supabase project.</div>}

              <button className="btn btn-primary" type="submit" disabled={submitting || !isSupabaseConfigured}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
              <button className="btn btn-ghost" onClick={() => setMode('signin')} type="button">
                Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page" style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}>
      <div className="auth-page-scrim" />
      <div className="auth-card">
        <h1 className="auth-title">BetMates</h1>
        <p className="auth-subtitle">Compare odds. Settle scores with your mates.</p>

        <div className="auth-tabs">
          <button className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'} onClick={() => setMode('signup')} type="button">
            Sign up
          </button>
          <button className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'} onClick={() => setMode('signin')} type="button">
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={30} />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          {mode === 'signup' && (
            <>
              <label className="field">
                <span>Date of birth</span>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={todayMinusYears(18)} required />
              </label>

              <label className="field-check">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
                <span>
                  I confirm I am 18 or older and accept the <Link to="/legal">Terms &amp; Responsible Gambling notice</Link>.
                </span>
              </label>
            </>
          )}

          {mode === 'signin' && (
            <button className="auth-forgot-link" type="button" onClick={() => setMode('reset')}>
              Forgot password?
            </button>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footnote">
          BetMates does not place bets or hold funds. 18+. Gamble responsibly.{' '}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">
            BeGambleAware.org
          </a>
        </p>
      </div>
    </div>
  )
}
