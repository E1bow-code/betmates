import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { BOOKMAKERS } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push.js'
import { getStoredTheme, setTheme } from '../lib/theme.js'
import { isIOS, isStandalone } from '../lib/platform.js'
import Avatar from '../components/Avatar.jsx'
import InstallGuide from '../components/InstallGuide.jsx'

export default function AccountPage() {
  const { user, signOut, updateDisplayName, updateBookmakerPrefs, updateNotificationPrefs } = useAuth()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(user.displayName)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [theme, setThemeState] = useState(getStoredTheme() === 'light' ? 'light' : 'dark')

  function handleThemeChange(next) {
    setTheme(next)
    setThemeState(next)
  }

  useEffect(() => {
    if (!isPushSupported()) return
    getPushSubscription().then((sub) => setPushEnabled(!!sub))
  }, [])

  function toggleBookmaker(name) {
    const current = user.bookmakerPrefs ?? []
    const next = current.includes(name) ? current.filter((b) => b !== name) : [...current, name]
    updateBookmakerPrefs(next)
  }

  function toggleNotification(key) {
    const current = user.notificationPrefs ?? {}
    updateNotificationPrefs({ ...current, [key]: !current[key] })
  }

  async function handleSaveName(e) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === user.displayName) {
      setEditingName(false)
      return
    }
    setNameSaving(true)
    setNameError(null)
    try {
      await updateDisplayName(trimmed)
      setEditingName(false)
    } catch (err) {
      setNameError(err.message)
    } finally {
      setNameSaving(false)
    }
  }

  async function handleTogglePush() {
    setPushBusy(true)
    setPushError(null)
    try {
      if (pushEnabled) {
        const sub = await getPushSubscription()
        if (sub) {
          await dataStore.deletePushSubscription(sub.endpoint)
          await unsubscribeFromPush()
        }
        setPushEnabled(false)
      } else {
        const sub = await subscribeToPush()
        await dataStore.savePushSubscription(user.id, sub)
        setPushEnabled(true)
      }
    } catch (err) {
      setPushError(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <h1>Account</h1>
      </div>

      <div className="account-section">
        <div className="account-identity">
          <Avatar name={user.displayName} size={48} />
          <div>
            {editingName ? (
              <form className="inline-form" onSubmit={handleSaveName}>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={40}
                  autoFocus
                  disabled={nameSaving}
                />
                <button className="btn btn-primary btn-small" type="submit" disabled={nameSaving}>
                  {nameSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={nameSaving}
                  onClick={() => {
                    setNameInput(user.displayName)
                    setEditingName(false)
                    setNameError(null)
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="account-name-row">
                <span className="account-name">{user.displayName}</span>
                <button className="btn btn-ghost btn-small" onClick={() => setEditingName(true)}>
                  Edit
                </button>
              </div>
            )}
            <div className="race-card-meta">{user.email}</div>
          </div>
        </div>
        {nameError && <div className="auth-error">{nameError}</div>}
        <p className="hint">Your avatar's initials and colour come from your display name, so it updates automatically too.</p>
      </div>

      <div className="account-section">
        <h2 className="market-title">Appearance</h2>
        <div className="mode-switcher">
          <button className={theme === 'dark' ? 'mode-tab active' : 'mode-tab'} onClick={() => handleThemeChange('dark')}>
            Dark
          </button>
          <button className={theme === 'light' ? 'mode-tab active' : 'mode-tab'} onClick={() => handleThemeChange('light')}>
            Light
          </button>
        </div>
      </div>

      <div className="account-section">
        <h2 className="market-title">My bookmakers</h2>
        <p className="hint">Used to filter odds and prioritise Copy Bet suggestions to accounts you actually hold.</p>
        <div className="bookmaker-grid">
          {BOOKMAKERS.map((b) => (
            <label key={b} className="field-check bookmaker-check">
              <input type="checkbox" checked={(user.bookmakerPrefs ?? []).includes(b)} onChange={() => toggleBookmaker(b)} />
              <span>{b}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="account-section">
        <h2 className="market-title">Notifications</h2>

        {isPushSupported() ? (
          <label className="field-check">
            <input type="checkbox" checked={pushEnabled} disabled={pushBusy} onChange={handleTogglePush} />
            <span>Push notifications on this device</span>
          </label>
        ) : (
          <p className="hint">This browser doesn't support push notifications.</p>
        )}
        {pushError && <div className="auth-error">{pushError}</div>}

        <label className="field-check">
          <input type="checkbox" checked={user.notificationPrefs?.betPosted ?? false} onChange={() => toggleNotification('betPosted')} />
          <span>Bet posted in a group</span>
        </label>
        <label className="field-check">
          <input type="checkbox" checked={user.notificationPrefs?.betSettled ?? false} onChange={() => toggleNotification('betSettled')} />
          <span>Bet settled</span>
        </label>
        <label className="field-check">
          <input type="checkbox" checked={user.notificationPrefs?.oddsMoved ?? false} onChange={() => toggleNotification('oddsMoved')} />
          <span>Odds moved on a pending bet</span>
        </label>
        <label className="field-check">
          <input
            type="checkbox"
            checked={user.notificationPrefs?.kickoffReminders ?? false}
            onChange={() => toggleNotification('kickoffReminders')}
          />
          <span>Reminder shortly before kickoff</span>
        </label>
        <p className="hint">
          {isPushSupported()
            ? 'Turn on push above to actually receive these on this device, not just store the preference.'
            : "These are stored for when you're on a browser that supports push."}
        </p>
      </div>

      <div className="account-section">
        <h2 className="market-title">Install app</h2>
        {isStandalone() ? (
          <p className="hint">You're using the installed app already - nothing else to do.</p>
        ) : isIOS() ? (
          <InstallGuide />
        ) : (
          <p className="hint">
            Look for an install icon in your browser's address bar (Chrome, Edge, and most Android browsers offer this
            automatically) to add BetMates as an app.
          </p>
        )}
      </div>

      <div className="account-section">
        <Link to="/legal" className="back">
          Terms &amp; Responsible Gambling
        </Link>
      </div>

      <button className="btn btn-secondary" onClick={signOut}>
        Sign out
      </button>
    </div>
  )
}
