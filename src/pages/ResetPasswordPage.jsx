import { useState } from 'react'
import { updatePassword } from '../lib/dataStore.js'

// Landed on from the email link src/pages/AuthPage.jsx's "Forgot password?"
// flow sends (see requestPasswordReset in dataStore.js). Supabase's client
// reads the recovery token straight off the URL fragment on load and
// establishes a session from it before this component even mounts (default
// detectSessionInUrl behaviour) - this page doesn't need to parse anything
// itself, just call updateUser() against whatever session is already there.
//
// App.jsx's Shell routes here off AuthContext's `passwordRecovery` flag
// (set via Supabase's PASSWORD_RECOVERY auth event - see
// dataStore.js's onAuthStateChange), not a normal react-router path match -
// Supabase's own redirect lands the recovery token in a hash fragment,
// which would otherwise collide with HashRouter trying to parse it as a
// route, and by the time any code could read that fragment directly
// Supabase has often already cleared it as part of its own init.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => {
        window.location.hash = '#/odds'
        window.location.reload()
      }, 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-scrim" />
      <div className="auth-card">
        <h1 className="auth-title">BetMates</h1>
        <p className="auth-subtitle">Set a new password</p>

        {done ? (
          <p className="hint">Password updated - taking you in…</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
