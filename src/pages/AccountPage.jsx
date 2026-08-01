import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { BOOKMAKERS } from '../lib/bookmakers.js'

export default function AccountPage() {
  const { user, signOut, updateBookmakerPrefs, updateNotificationPrefs } = useAuth()

  function toggleBookmaker(name) {
    const current = user.bookmakerPrefs ?? []
    const next = current.includes(name) ? current.filter((b) => b !== name) : [...current, name]
    updateBookmakerPrefs(next)
  }

  function toggleNotification(key) {
    const current = user.notificationPrefs ?? {}
    updateNotificationPrefs({ ...current, [key]: !current[key] })
  }

  return (
    <div>
      <div className="topbar">
        <h1>Account</h1>
      </div>

      <div className="account-section">
        <div className="account-name">{user.displayName}</div>
        <div className="race-card-meta">{user.email}</div>
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
        <p className="hint">Push delivery isn't wired up yet (Section 7 - post-MVP) - these are stored for when it is.</p>
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
