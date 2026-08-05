import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { BOOKMAKERS } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push.js'
import { getStoredTheme, setTheme } from '../lib/theme.js'
import { isIOS, isStandalone } from '../lib/platform.js'
import { shareOrCopy, publicProfileUrl, referralUrl } from '../lib/share.js'
import Avatar from '../components/Avatar.jsx'
import InstallGuide from '../components/InstallGuide.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

export default function AccountPage() {
  const { user, signOut, deleteAccount, updateDisplayName, updateBookmakerPrefs, updateNotificationPrefs, updateAvatar } = useAuth()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(user.displayName)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [theme, setThemeState] = useState(getStoredTheme() === 'light' ? 'light' : 'dark')
  const [profileShareStatus, setProfileShareStatus] = useState(null)
  const [blockedUsers, setBlockedUsers] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  const [referralCount, setReferralCount] = useState(null)
  const [referralShareStatus, setReferralShareStatus] = useState(null)

  function handleThemeChange(next) {
    setTheme(next)
    setThemeState(next)
  }

  useEffect(() => {
    if (!isPushSupported()) return
    getPushSubscription().then((sub) => setPushEnabled(!!sub))
  }, [])

  useEffect(() => {
    dataStore.listBlockedUsers(user.id).then(setBlockedUsers)
  }, [])

  useEffect(() => {
    dataStore.countReferrals(user.id).then(setReferralCount)
  }, [])

  async function handleUnblock(blockedId) {
    await dataStore.unblockUser(user.id, blockedId)
    setBlockedUsers((list) => list.filter((b) => b.id !== blockedId))
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets picking the same file again re-fire onChange
    if (!file) return
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      await updateAvatar(file)
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleShareReferral() {
    const result = await shareOrCopy({
      title: 'Join me on BetMates',
      text: `Come compare odds and settle scores with me on BetMates`,
      url: referralUrl(user.friendCode)
    })
    setReferralShareStatus(result === 'copied' ? 'Link copied' : null)
    if (result === 'copied') setTimeout(() => setReferralShareStatus(null), 2000)
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

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

  async function handleShareProfile() {
    const result = await shareOrCopy({
      title: `${user.displayName} on BetMates`,
      text: `Check out my betting stats on BetMates`,
      url: publicProfileUrl(user.friendCode)
    })
    setProfileShareStatus(result === 'copied' ? 'Link copied' : null)
    if (result === 'copied') setTimeout(() => setProfileShareStatus(null), 2000)
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
      <SportHeroBanner sport="account" />
      <div className="topbar">
        <h1>Account</h1>
      </div>

      <div className="account-section">
        <div className="account-identity">
          <label className="avatar-upload">
            <Avatar name={user.displayName} photoUrl={user.avatarUrl} size={48} />
            <span className="avatar-upload-badge">{avatarUploading ? '…' : '✎'}</span>
            <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={avatarUploading} hidden />
          </label>
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
        {avatarError && <div className="auth-error">{avatarError}</div>}
        <p className="hint">Tap your avatar to upload a photo, or leave it - initials and colour come from your name automatically.</p>
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
        <label className="field-check">
          <input
            type="checkbox"
            checked={user.notificationPrefs?.weeklyRecap ?? false}
            onChange={() => toggleNotification('weeklyRecap')}
          />
          <span>Weekly recap (Sunday evening)</span>
        </label>
        <p className="hint">
          {isPushSupported()
            ? 'Turn on push above to actually receive these on this device, not just store the preference.'
            : "These are stored for when you're on a browser that supports push."}
        </p>
      </div>

      <div className="account-section">
        <h2 className="market-title">Public profile</h2>
        <p className="hint">Share a link to your stats - anyone can view it, no BetMates account needed.</p>
        <button className="btn btn-secondary btn-small" onClick={handleShareProfile}>
          Share my profile
        </button>
        {profileShareStatus && <div className="hint">{profileShareStatus}</div>}
      </div>

      <div className="account-section">
        <h2 className="market-title">Invite your mates</h2>
        <p className="hint">
          {referralCount === null
            ? 'Loading…'
            : referralCount === 0
              ? "You haven't brought anyone in yet - share your link below."
              : `You've brought ${referralCount} ${referralCount === 1 ? 'person' : 'people'} to BetMates.`}
        </p>
        <button className="btn btn-secondary btn-small" onClick={handleShareReferral}>
          Share invite link
        </button>
        {referralShareStatus && <div className="hint">{referralShareStatus}</div>}
      </div>

      {blockedUsers && blockedUsers.length > 0 && (
        <div className="account-section">
          <h2 className="market-title">Blocked accounts</h2>
          <p className="hint">You won't see their posts on the public Feed, and they won't see yours.</p>
          <div className="manage-list">
            {blockedUsers.map((b) => (
              <div key={b.id} className="manage-list-row">
                <span>{b.displayName}</span>
                <button className="btn btn-ghost btn-small" onClick={() => handleUnblock(b.id)}>
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {user.isAdmin && (
        <div className="account-section">
          <h2 className="market-title">Admin</h2>
          <Link className="btn btn-secondary btn-small" to="/admin/reports">
            Reported posts
          </Link>
        </div>
      )}

      <div className="account-section">
        <Link to="/legal" className="back">
          Terms &amp; Responsible Gambling
        </Link>
      </div>

      <div className="account-section danger-zone">
        <h2 className="market-title">Danger zone</h2>
        {confirmingDelete ? (
          <>
            <p className="hint">
              This permanently deletes your account and everything tied to it - bets, comments, groups you created (ownership
              passes to another member, or the group's deleted if you were the only one in it). Type <strong>DELETE</strong> to
              confirm.
            </p>
            <div className="inline-form">
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={deleting}
                autoFocus
              />
              <button
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
            {deleteError && <div className="auth-error">{deleteError}</div>}
            <button
              className="btn btn-ghost btn-small"
              disabled={deleting}
              onClick={() => {
                setConfirmingDelete(false)
                setDeleteConfirmText('')
                setDeleteError(null)
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn-danger-outline" onClick={() => setConfirmingDelete(true)}>
            Delete account
          </button>
        )}
      </div>

      <button className="btn btn-secondary" onClick={signOut}>
        Sign out
      </button>
    </div>
  )
}
