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
import { suggestedStake } from '../utils/stakingPlan.js'
import { getRealityCheckMins, setRealityCheckMins, REALITY_CHECK_OPTIONS } from '../lib/realityCheck.js'
import { referralRewardState } from '../utils/referralRewards.js'
import { computeStats } from '../utils/trackerStats.js'
import { computeXp, levelForXp, xpForLevel, xpForNextLevel, flairTierForLevel } from '../utils/xp.js'
import { freezesGranted } from '../utils/dailyStreak.js'
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
    updateLimitBuddy,
    updateStakingPlan,
    updateSelfExclusion
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
  const [bankrollInput, setBankrollInput] = useState(user.bankrollAmount ?? '')
  const [stakingTypeInput, setStakingTypeInput] = useState(user.stakingRule?.type ?? 'flat')
  const [stakingValueInput, setStakingValueInput] = useState(user.stakingRule?.value ?? '')
  const [stakingSaving, setStakingSaving] = useState(false)
  const [stakingSaved, setStakingSaved] = useState(false)
  const [friends, setFriends] = useState(null)
  const [buddySaving, setBuddySaving] = useState(false)
  const [exclusionSaving, setExclusionSaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(loadExpandedGroups)
  const [trackerStats, setTrackerStats] = useState(null)
  const [xpCounts, setXpCounts] = useState(null)
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

  // Tracker no longer has its own bottom-nav slot (see BottomNav.jsx) -
  // this teaser is now the only way to reach it, so unlike RankTeaser/
  // HomeHighlights it always renders, with an empty-state message rather
  // than silently disappearing when there's nothing settled yet.
  // Same fetch also feeds computeXp's counts below - posted vs manual are
  // kept separate only because "posted" (shared with a group or publicly)
  // earns its own XP, distinct from just logging a bet privately.
  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)])
      .then(([posted, manual]) => {
        const all = [...posted, ...manual]
        setTrackerStats(computeStats(all))
        setXpCounts({
          loggedCount: all.length,
          settledCount: all.filter((e) => e.stake && ['won', 'lost', 'void'].includes(e.status)).length,
          wonCount: all.filter((e) => e.stake && e.status === 'won').length,
          postedCount: posted.length
        })
      })
      .catch(() => {
        setTrackerStats(computeStats([]))
        setXpCounts({ loggedCount: 0, settledCount: 0, wonCount: 0, postedCount: 0 })
      })
  }, [user.id])

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

  async function handleSaveStakingPlan(e) {
    e.preventDefault()
    setStakingSaving(true)
    const bankrollAmount = bankrollInput === '' ? null : Number(bankrollInput)
    const stakingRule = stakingValueInput === '' ? null : { type: stakingTypeInput, value: Number(stakingValueInput) }
    const ok = await runAsync(() => updateStakingPlan(bankrollAmount, stakingRule), "Couldn't save your staking plan - try again")
    setStakingSaving(false)
    if (ok) {
      setStakingSaved(true)
      setTimeout(() => setStakingSaved(false), 2000)
    }
  }

  async function handleClearStakingPlan() {
    setBankrollInput('')
    setStakingValueInput('')
    setStakingSaving(true)
    await runAsync(() => updateStakingPlan(null, null), "Couldn't turn off your staking plan - try again")
    setStakingSaving(false)
  }

  async function handleBuddyChange(e) {
    const buddyId = e.target.value || null
    setBuddySaving(true)
    await runAsync(() => updateLimitBuddy(buddyId), "Couldn't save that - try again")
    setBuddySaving(false)
  }

  // Once set this can only be extended, never cleared or shortened early
  // (enforced server-side by guard_self_exclusion in schema.sql) - so the
  // confirm dialog is the only chance to back out before it's binding.
  async function handleSelfExclude(days, label) {
    if (!window.confirm(`Lock yourself out of BetMates for ${label}? This can't be undone or shortened early.`)) return
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    setExclusionSaving(true)
    await runAsync(() => updateSelfExclusion(until), "Couldn't set that - try again")
    setExclusionSaving(false)
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

  // Fully derived, same as achievements - see src/utils/xp.js's header
  // comment. referralCount is fetched separately above; xp stays null
  // until both that and the bet-history counts have loaded.
  const xp = xpCounts && referralCount !== null ? computeXp({ ...xpCounts, referralCount }) : null
  const level = xp !== null ? levelForXp(xp) : null
  const tier = level !== null ? flairTierForLevel(level) : null
  const xpIntoLevel = xp !== null ? xp - xpForLevel(level) : null
  const xpSpanForLevel = xp !== null ? xpForNextLevel(level) - xpForLevel(level) : null
  const freezesAvailable = freezesGranted(user.createdAt) - user.streakFreezesUsed

  return (
    <div>
      <SportHeroBanner sport="account" />
      <div className="topbar">
        <h1>Account</h1>
      </div>

      <div className="account-hero">
        <label className="avatar-upload">
          <Avatar name={user.displayName} photoUrl={user.avatarUrl} size={64} tier={tier} />
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

      {xp !== null && (
        <div className="account-section">
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="stat-tile-value">Level {level}</div>
              <div className="stat-tile-label">{xp} XP total</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">🔥 {user.streakCurrentCount}</div>
              <div className="stat-tile-label">day streak</div>
            </div>
          </div>
          <div
            className="limit-progress-track"
            role="progressbar"
            aria-label="Progress to next level"
            aria-valuenow={xpIntoLevel}
            aria-valuemin={0}
            aria-valuemax={xpSpanForLevel}
          >
            <div className="limit-progress-fill" style={{ width: `${Math.min(100, (xpIntoLevel / xpSpanForLevel) * 100)}%` }} />
          </div>
          <p className="hint">
            {xpSpanForLevel - xpIntoLevel} XP to level {level + 1}
            {freezesAvailable > 0 ? ` · ${freezesAvailable} streak freeze${freezesAvailable === 1 ? '' : 's'} banked` : ''}
          </p>
        </div>
      )}

      {trackerStats && (
        <Link to="/tracker" className="rank-teaser">
          {trackerStats.settledCount > 0 ? (
            <>
              <span className={`rank-teaser-rank ${trackerStats.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                {trackerStats.profit >= 0 ? '+' : '-'}£{Math.abs(trackerStats.profit).toFixed(0)}
              </span>
              <span className="rank-teaser-body">
                <span className="rank-teaser-group">Tracker</span>
                <span className="rank-teaser-context">
                  {trackerStats.settledCount} settled{trackerStats.winRate !== null ? ` · ${trackerStats.winRate}% win rate` : ''}
                </span>
              </span>
            </>
          ) : (
            <span className="rank-teaser-body">
              <span className="rank-teaser-group">Tracker</span>
              <span className="rank-teaser-context">No settled bets yet - tap to see your history</span>
            </span>
          )}
          <span className="rank-teaser-chevron">›</span>
        </Link>
      )}

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
            <span>Streak reminders (win streaks, and your daily activity streak)</span>
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

      <AccountGroup id="staking" title="Bankroll & staking plan" expanded={expandedGroups} onToggle={toggleGroup}>
        <div className="account-section">
          <p className="hint">
            Set a bankroll figure and a staking rule, and BetMates will flag it (gently - nothing's blocked) when a bet slip's
            stake runs well over what your own plan suggests. Also feeds the bankroll chart on your Tracker.
          </p>
          <label className="field-check">
            <input
              type="checkbox"
              checked={user.notificationPrefs?.preBetSanityCheck ?? false}
              onChange={() => toggleNotification('preBetSanityCheck')}
            />
            <span>🧠 Show a heads-up when logging a bet (unusually big stake, chasing a loss, over your staking plan or spend limit)</span>
          </label>
          <p className="hint">Off by default - opt in if you'd find the nudge useful. Never blocks you from posting.</p>
          <form className="inline-form" onSubmit={handleSaveStakingPlan}>
            <label className="field">
              <span>Bankroll</span>
              <input
                type="number"
                min="0"
                step="10"
                placeholder="No bankroll set"
                value={bankrollInput}
                onChange={(e) => setBankrollInput(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Staking rule</span>
              <div className="inline-form">
                <select value={stakingTypeInput} onChange={(e) => setStakingTypeInput(e.target.value)}>
                  <option value="flat">Flat £</option>
                  <option value="percent">% of bankroll</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step={stakingTypeInput === 'percent' ? 0.5 : 1}
                  placeholder="No rule set"
                  value={stakingValueInput}
                  onChange={(e) => setStakingValueInput(e.target.value)}
                />
              </div>
            </label>
            <button className="btn btn-primary btn-small" type="submit" disabled={stakingSaving}>
              {stakingSaving ? 'Saving…' : stakingSaved ? 'Saved ✓' : 'Save'}
            </button>
          </form>
          {user.stakingRule ? (
            <>
              <p className="hint">
                {(() => {
                  const suggestion = suggestedStake(user)
                  if (suggestion == null) return 'Add a bankroll figure above to see a suggested stake for a % rule.'
                  return `Your plan suggests £${suggestion.toFixed(2)} per bet${
                    user.stakingRule.type === 'percent' ? ` (${user.stakingRule.value}% of £${Number(user.bankrollAmount).toFixed(2)})` : ''
                  }.`
                })()}
              </p>
              <button className="btn btn-ghost btn-small" onClick={handleClearStakingPlan} disabled={stakingSaving}>
                Turn off staking plan
              </button>
            </>
          ) : (
            <p className="hint">No staking rule set.</p>
          )}
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

        <div className="account-section">
          <h2 className="market-title">Take a break</h2>
          {user.selfExclusionUntil && new Date(user.selfExclusionUntil) > new Date() ? (
            <p className="hint">
              You're locked out until <strong>{new Date(user.selfExclusionUntil).toLocaleString()}</strong>. This can't be undone
              or shortened early - it'll lift automatically once that time passes.
            </p>
          ) : (
            <>
              <p className="hint">
                A harder tool than the spending limit above - this locks you out of the whole app, not just what you log. Once set
                it can't be cancelled or shortened, so pick the length that actually helps.
              </p>
              <div className="self-exclude-options">
                <button className="btn btn-ghost btn-small" disabled={exclusionSaving} onClick={() => handleSelfExclude(1, '24 hours')}>
                  24 hours
                </button>
                <button className="btn btn-ghost btn-small" disabled={exclusionSaving} onClick={() => handleSelfExclude(7, '7 days')}>
                  7 days
                </button>
                <button className="btn btn-ghost btn-small" disabled={exclusionSaving} onClick={() => handleSelfExclude(30, '30 days')}>
                  30 days
                </button>
                <button className="btn btn-ghost btn-small" disabled={exclusionSaving} onClick={() => handleSelfExclude(182, '6 months')}>
                  6 months
                </button>
              </div>
            </>
          )}
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
