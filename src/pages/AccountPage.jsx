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
import { getRealityCheckMins, setRealityCheckMins, REALITY_CHECK_OPTIONS } from '../lib/realityCheck.js'
import { referralRewardState } from '../utils/referralRewards.js'
import Avatar from '../components/Avatar.jsx'
import InstallGuide from '../components/InstallGuide.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import { useAsyncAction } from '../lib/useAsyncAction.js'

const EXPANDED_KEY = 'betmates:accountExpanded'

function loadExpandedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

// The bookmaker grid, notification checkboxes, and gambling-safety content
// are the three genuinely long stretches on this page - grouped behind a
// collapsed-by-default toggle (same idea as MoreMenu.jsx's groups) so the
// page opens short and each is still one tap away. Short sections (share
// profile, invite, danger zone) stay plain - collapsing a two-line block
// just adds a click for no real space saved.
function AccountGroup({ id, title, expanded, onToggle, children }) {
  const open = expanded.has(id)
  return (
    <div className="account-group">
      <button className="account-group-toggle" type="button" onClick={() => onToggle(id)} aria-expanded={open}>
        <span>{title}</span>
        <span className="market-header-meta">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="account-group-body">{children}</div>}
    </div>
  )
}

export default function AccountPage() {
  const {
    user,
    signOut,
    deleteAccount,
    updateDisplayName,
    updateBookmakerPrefs,
    updateNotificationPrefs,
    updateAvatar,
    updateStakeLimit,
    updateLimitBuddy
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
  const [realityCheckMins, setRealityCheckMinsState] = useState(getRealityCheckMins)
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
  const [friends, setFriends] = useState(null)
  const [buddySaving, setBuddySaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(loadExpandedGroups)
  const runAsync = useAsyncAction()

  function toggleGroup(id) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }

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
    dataStore
      .listFriends(user.id)
      .then(setFriends)
      .catch(() => setFriends([]))
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
    let result
    const ok = await runAsync(async () => {
      result = await shareOrCopy({
        title: 'Join me on BetMates',
        text: `Come compare odds and settle scores with me on BetMates`,
        url: referralUrl(user.friendCode)
      })
    }, "Couldn't share that - try again")
    if (!ok) return
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

  async function toggleBookmaker(name) {
    const current = user.bookmakerPrefs ?? []
    const next = current.includes(name) ? current.filter((b) => b !== name) : [...current, name]
    await runAsync(() => updateBookmakerPrefs(next), "Couldn't save that - try again")
  }

  async function handleSaveLimit(e) {
    e.preventDefault()
    setLimitSaving(true)
    const amount = limitAmountInput === '' ? null : Number(limitAmountInput)
    const ok = await runAsync(
      () => updateStakeLimit(amount, amount ? limitPeriodInput : null),
      "Couldn't save your limit - try again"
    )
    setLimitSaving(false)
    if (ok) {
      setLimitSaved(true)
      setTimeout(() => setLimitSaved(false), 2000)
    }
  }

  async function handleClearLimit() {
    setLimitAmountInput('')
    setLimitSaving(true)
    await runAsync(() => updateStakeLimit(null, null), "Couldn't turn off your limit - try again")
    setLimitSaving(false)
  }

  async function handleBuddyChange(e) {
    const buddyId = e.target.value || null
    setBuddySaving(true)
    await runAsync(() => updateLimitBuddy(buddyId), "Couldn't save that - try again")
    setBuddySaving(false)
  }

  async function toggleNotification(key) {
    const current = user.notificationPrefs ?? {}
    await runAsync(() => updateNotificationPrefs({ ...current, [key]: !current[key] }), "Couldn't save that - try again")
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
    let result
    const ok = await runAsync(async () => {
      result = await shareOrCopy({
        title: `${user.displayName} on BetMates`,
        text: `Check out my betting stats on BetMates`,
        url: publicProfileUrl(user.friendCode)
      })
    }, "Couldn't share that - try again")
    if (!ok) return
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
          <span className="avatar-upload-badge" aria-hidden="true">{avatarUploading ? '…' : '✎'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            disabled={avatarUploading}
            aria-label="Upload profile photo"
            hidden
          />
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

      <AccountGroup id="preferences" title="Preferences" expanded={expandedGroups} onToggle={toggleGroup}>
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
      </AccountGroup>

      <AccountGroup id="notifications" title="Notifications" expanded={expandedGroups} onToggle={toggleGroup}>
        <div className="account-section">
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
          <label className="field-check">
            <input
              type="checkbox"
              checked={user.notificationPrefs?.streakReminders ?? false}
              onChange={() => toggleNotification('streakReminders')}
            />
            <span>Win-streak milestones (3, 5, 10 in a row)</span>
          </label>
          <label className="field-check">
            <input type="checkbox" checked={user.notificationPrefs?.teamNews ?? false} onChange={() => toggleNotification('teamNews')} />
            <span>News about a team or player you follow</span>
          </label>
          <label className="field-check">
            <input
              type="checkbox"
              checked={user.notificationPrefs?.valueEdgeAlerts ?? false}
              onChange={() => toggleNotification('valueEdgeAlerts')}
            />
            <span>🧠 CoachGPT spots real value on a team or fighter you follow</span>
          </label>
          <p className="hint">
            {isPushSupported()
              ? 'Turn on push above to actually receive these on this device, not just store the preference.'
              : "These are stored for when you're on a browser that supports push."}
          </p>
        </div>
      </AccountGroup>

      <AccountGroup id="gambling" title="Responsible gambling" expanded={expandedGroups} onToggle={toggleGroup}>
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
              <div
                className="limit-progress-track"
                role="progressbar"
                aria-label="Spending toward limit"
                aria-valuenow={periodSpend === null ? 0 : Math.min(periodSpend, user.stakeLimitAmount)}
                aria-valuemin={0}
                aria-valuemax={user.stakeLimitAmount}
              >
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

              <label className="field">
                <span>Notify a mate when you hit it</span>
                <select value={user.limitBuddyId ?? ''} onChange={handleBuddyChange} disabled={buddySaving || !friends?.length}>
                  <option value="">No one</option>
                  {(friends ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {friends && !friends.length && (
                <p className="hint">Add a friend first (via your friend code) to pick someone here.</p>
              )}
              {user.limitBuddyId && (
                <p className="hint">
                  They'll get a push once you hit this limit for the {user.stakeLimitPeriod === 'monthly' ? 'month' : 'week'} - a
                  nudge for them to check in, not a block on you.
                </p>
              )}
            </>
          ) : (
            <p className="hint">No limit set.</p>
          )}
        </div>

        <div className="account-section">
          <h2 className="market-title">Safer gambling</h2>
          <p className="hint">
            A reality check pops up every so often to show how long you’ve been in the app - a nudge to take a break. Off by default.
          </p>
          <div className="mode-switcher">
            {REALITY_CHECK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={realityCheckMins === opt.value ? 'mode-tab active' : 'mode-tab'}
                onClick={() => {
                  setRealityCheckMins(opt.value)
                  setRealityCheckMinsState(opt.value)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="hint">
            If gambling has stopped being fun, help is free and confidential. Call the National Gambling Helpline on{' '}
            <a href="tel:08088020133">0808 8020 133</a>, or visit{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">
              BeGambleAware
            </a>{' '}
            and{' '}
            <a href="https://www.gamcare.org.uk" target="_blank" rel="noreferrer">
              GamCare
            </a>
            . To block yourself from UK gambling sites, register with{' '}
            <a href="https://www.gamstop.co.uk" target="_blank" rel="noreferrer">
              GAMSTOP
            </a>
            .
          </p>
        </div>
      </AccountGroup>

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
              ? "You haven't brought anyone in yet - share your link below to start earning rewards."
              : `You've brought ${referralCount} ${referralCount === 1 ? 'person' : 'people'} to BetMates.`}
        </p>
        {referralCount !== null &&
          (() => {
            const rewards = referralRewardState(referralCount)
            return (
              <>
                {rewards.earned.length > 0 && (
                  <div className="badge-row">
                    {rewards.earned.map((tier) => (
                      <span key={tier.threshold} className="badge">
                        {tier.icon} {tier.label}
                      </span>
                    ))}
                  </div>
                )}
                {rewards.next && (
                  <p className="hint">
                    {rewards.toNext} more {rewards.toNext === 1 ? 'mate' : 'mates'} to unlock {rewards.next.icon}{' '}
                    {rewards.next.label}.
                  </p>
                )}
              </>
            )
          })()}
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
