import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        if (!acceptedTerms) throw new Error('You must confirm your age and accept the Terms to continue.')
        await signUp({ email, password, displayName, dob })
      } else {
        await signIn({ email, password })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">BetMates</h1>
        <p className="auth-subtitle">Compare odds. Share bets with your mates.</p>

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
