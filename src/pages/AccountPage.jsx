import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { BOOKMAKERS } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push.js'
import { getStoredTheme, setTheme } from '../lib/theme.js'
import { isIOS, isStandalone } from '../lib/platform.js'
import { shareOrCopy, publicProfileUrl, referralUrl } from '../lib/share.js'
import { periodStart, sumStakesSince } from '../utils/spendLimit.js'
import Avatar from '../components/Avatar.jsx'
import InstallGuide from '../components/InstallGuide.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

export default function AccountPage() {
  const {
    user,
    signOut,
    deleteAccount,
    updateDisplayName,
    updateBookmakerPrefs,
    updateNotificationPrefs,
    updateAvatar,
    updateStakeLimit
  } = useAuth()
  const { format: oddsFormat, setFormat: setOddsFormat } = useOddsFormat()
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
  const [limitAmountInput, setLimitAmountInput] = useState(user.stakeLimitAmount ?? '')
  const [limitPeriodInput, setLimitPeriodInput] = useState(user.stakeLimitPeriod ?? 'weekly')
  const [limitSaving, setLimitSaving] = useState(false)
  const [limitSaved, setLimitSaved] = useState(false)
  const [periodSpend, setPeriodSpend] = useState(null)

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

  useEffect(() => {
    if (!user.stakeLimitAmount) return
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setPeriodSpend(sumStakesSince([...posted, ...manual], periodStart(user.stakeLimitPeriod)))
    })
  }, [user.id, user.stakeLimitAmount, user.stakeLimitPeriod])

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

  async function handleSaveLimit(e) {
    e.preventDefault()
    setLimitSaving(true)
    try {
      const amount = limitAmountInput === '' ? null : Number(limitAmountInput)
      await updateStakeLimit(amount, amount ? limitPeriodInput : null)
      setLimitSaved(true)
      setTimeout(() => setLimitSaved(false), 2000)
    } finally {
      setLimitSaving(false)
    }
  }

  async function handleClearLimit() {
    setLimitAmountInput('')
    setLimitSaving(true)
    try {
      await updateStakeLimit(null, null)
    } finally {
      setLimitSaving(false)
    }
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

      <div className="account-hero">
        <label className="avatar-upload">
          <Avatar name={user.displayName} photoUrl={user.avatarUrl} size={64} />
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
          {nameError && <div className="auth-error">{nameError}</div>}
          {avatarError && <div className="auth-error">{avatarError}</div>}
        </div>
      </div>
      <p className="hint account-hero-hint">
        Tap your avatar to upload a photo, or leave it - initials and colour come from your name automatically.
      </p>

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
        <h2 className="market-title">Odds format</h2>
        <p className="hint">Applies everywhere prices are shown - Odds, bet slips, Tracker, and Hall of Fame.</p>
        <div className="mode-switcher">
          <button className={oddsFormat === 'decimal' ? 'mode-tab active' : 'mode-tab'} onClick={() => setOddsFormat('decimal')}>
            Decimal (<span className="account-mono">2.05</span>)
          </button>
          <button className={oddsFormat === 'fractional' ? 'mode-tab active' : 'mode-tab'} onClick={() => setOddsFormat('fractional')}>
            Fractional (<span className="account-mono">21/20</span>)
          </button>
        </div>
      </div>

      <div className="account-section">
        <h2 className="market-title">My bookmakers</h2>
        <p className="hint">Used to filter odds and prioritise Copy Bet suggestions to accounts you actually hold.</p>
        <div className="bookmaker-grid">
          {BOOKMAKERS.map((b) => (
            <label key={b} className="bookmaker-chip">
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
        <h2 className="market-title">Spending limit</h2>
        <p className="hint">
          A self-set cap on how much you log as staked in a week or month - a gentle check-in, not a hard block. BetMates never
          places bets or holds funds, so this can't stop you betting elsewhere; it's here for your own awareness.
        </p>
        <form className="inline-form" onSubmit={handleSaveLimit}>
          <input
            type="number"
            min="0"
            step="5"
            placeholder="No limit"
            value={limitAmountInput}
            onChange={(e) => setLimitAmountInput(e.target.value)}
          />
          <select value={limitPeriodInput} onChange={(e) => setLimitPeriodInput(e.target.value)}>
            <option value="weekly">per week</option>
            <option value="monthly">per month</option>
          </select>
          <button className="btn btn-primary btn-small" type="submit" disabled={limitSaving}>
            {limitSaving ? 'Saving…' : limitSaved ? 'Saved ✓' : 'Save'}
          </button>
        </form>
        {user.stakeLimitAmount ? (
          <>
            <div className="limit-progress-track">
              <div
                className={`limit-progress-fill ${
                  periodSpend >= user.stakeLimitAmount ? 'tone-bad' : periodSpend >= user.stakeLimitAmount * 0.8 ? 'tone-warn' : ''
                }`}
                style={{ width: `${periodSpend === null ? 0 : Math.min(100, (periodSpend / user.stakeLimitAmount) * 100)}%` }}
              />
            </div>
            <p className="hint">
              {periodSpend === null
                ? 'Loading…'
                : `£${periodSpend.toFixed(2)} of £${Number(user.stakeLimitAmount).toFixed(2)} logged this ${user.stakeLimitPeriod === 'monthly' ? 'month' : 'week'}${periodSpend >= user.stakeLimitAmount ? ' - limit reached' : ''}.`}
            </p>
            <button className="btn btn-ghost btn-small" onClick={handleClearLimit} disabled={limitSaving}>
              Turn off limit
            </button>
          </>
        ) : (
          <p className="hint">No limit set.</p>
        )}
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
        <Link to="/help" className="back">
          Help &amp; FAQ
        </Link>
      </div>

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
