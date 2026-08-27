import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { BOOKMAKERS } from '../lib/bookmakers.js'
import { shareOrCopy, groupInviteUrl } from '../lib/share.js'
import ManualEntrySheet from './ManualEntrySheet.jsx'
import { CelebrateIcon, StarIcon } from './icons/Icons.jsx'

// A handful of well-known Premier League clubs to offer as a starting point
// - not the full fixture list (that's what the Odds tab is for), just
// enough to make "My teams only" mean something from minute one. Matches
// the team-name strings The Odds API's soccer_epl feed actually returns,
// same names dataStore.followParticipant stores and OddsListPage filters
// against.
const STARTER_TEAMS = [
  'Arsenal',
  'Chelsea',
  'Liverpool',
  'Manchester United',
  'Manchester City',
  'Tottenham Hotspur',
  'Newcastle United',
  'Aston Villa',
  'West Ham United',
  'Everton',
  'Brighton and Hove Albion',
  'Wolverhampton Wanderers'
]

const STEPS = [
  { title: 'Get your mates in', body: "BetMates is a competition - it's no fun solo. Start a group and share the link, or join a mate's with their code." },
  { title: 'Follow your teams', body: "Pick a few - they'll show up under \"My teams only\" on the Odds tab." },
  { title: 'Add your bookmakers', body: 'Filters the odds board down to accounts you actually hold, and speeds up Copy Bet.' },
  { title: 'Log your first bet', body: "One from a screenshot, a bet slip, or just typed in - whatever you've already got on." }
]

// Replaces the old passive slideshow (see App.jsx's ONBOARDED_PREFIX gate,
// unchanged) with three real actions instead of five slides to read past -
// each step does something live in the account rather than just describing
// a feature, and each is independently skippable so nobody's blocked from
// getting into the app. Reuses the exact same data calls/components the
// rest of the app already uses for these (dataStore.followParticipant,
// AuthContext's updateBookmakerPrefs, ManualEntrySheet) rather than
// building parallel one-off versions.
export default function FirstRunWizard({ onDone }) {
  const { user, updateBookmakerPrefs } = useAuth()
  const runAsync = useAsyncAction()
  const [step, setStep] = useState(0)
  const [followedTeams, setFollowedTeams] = useState(new Set())
  const [loadingFollows, setLoadingFollows] = useState(true)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [firstBetLogged, setFirstBetLogged] = useState(false)
  // Group step: the group the user has just created/joined (or already had),
  // so we can show its invite link to share with mates from minute one.
  const [myGroup, setMyGroup] = useState(null)
  const [groupName, setGroupName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    dataStore.listFollowedParticipants(user.id).then((list) => {
      if (cancelled) return
      setFollowedTeams(new Set(list.filter((p) => p.sport === 'football').map((p) => p.name)))
      setLoadingFollows(false)
    })
    // If they already belong to a group, surface its invite link straight away.
    dataStore.listMyGroups(user.id).then((groups) => {
      if (cancelled || !groups || !groups.length) return
      setMyGroup(groups[0])
    })
    return () => {
      cancelled = true
    }
  }, [user.id])

  async function createGroup() {
    const name = groupName.trim()
    if (!name) return
    let created = null
    const ok = await runAsync(async () => {
      created = await dataStore.createGroup(name, user.id)
    }, "Couldn't create the group - try again")
    if (ok && created) {
      setMyGroup(created)
      setGroupName('')
    }
  }

  async function joinGroup() {
    const code = joinCode.trim()
    if (!code) return
    let joined = null
    const ok = await runAsync(async () => {
      joined = await dataStore.joinGroupByCode(code, user.id)
    }, "Couldn't find a group with that code - check it and try again")
    if (ok && joined) {
      setMyGroup(joined)
      setJoinCode('')
    }
  }

  async function shareInvite() {
    if (!myGroup?.inviteCode) return
    const result = await shareOrCopy({
      title: `Join "${myGroup.name}" on BetMates`,
      text: `Join my group "${myGroup.name}" on BetMates`,
      url: groupInviteUrl(myGroup.inviteCode)
    })
    if (result === 'copied') {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    }
  }

  // Optimistic: flips the chip immediately rather than waiting on the
  // follow/unfollow round-trip, then reverts if it turns out to have
  // failed - a chip that only lights up after a network call feels
  // unresponsive on a slow connection, and invites a confused second tap.
  async function toggleTeam(name) {
    const following = followedTeams.has(name)
    setFollowedTeams((prev) => {
      const next = new Set(prev)
      following ? next.delete(name) : next.add(name)
      return next
    })
    const ok = await runAsync(
      () => (following ? dataStore.unfollowParticipant(user.id, 'football', name) : dataStore.followParticipant(user.id, 'football', name)),
      `Couldn't ${following ? 'unfollow' : 'follow'} ${name} - try again`
    )
    if (ok) return
    setFollowedTeams((prev) => {
      const next = new Set(prev)
      following ? next.add(name) : next.delete(name)
      return next
    })
  }

  async function toggleBookmaker(name) {
    const current = user.bookmakerPrefs ?? []
    const next = current.includes(name) ? current.filter((b) => b !== name) : [...current, name]
    await runAsync(() => updateBookmakerPrefs(next), "Couldn't save that - try again")
  }

  const last = step === STEPS.length - 1

  return (
    <div className="onboarding-overlay">
      <div className="first-run-card">
        <div className="first-run-steps">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={i === step ? 'first-run-step active' : 'first-run-step'}
              onClick={() => setStep(i)}
            >
              <span className="first-run-step-num">{i + 1}</span>
              {s.title}
            </button>
          ))}
        </div>

        <p className="hint">{STEPS[step].body}</p>

        {step === 0 &&
          (myGroup ? (
            <div className="first-run-group-ready">
              <p className="tone-good icon-row">
                You&apos;re in <strong>{myGroup.name}</strong>. Now get your mates in <CelebrateIcon width={16} height={16} />
              </p>
              <div className="manage-list">
                <div className="manage-list-row">
                  <span>Invite code</span>
                  <span className="manage-list-code">{myGroup.inviteCode}</span>
                  <button className="btn btn-primary btn-small" type="button" onClick={shareInvite}>
                    Share link
                  </button>
                </div>
              </div>
              {inviteCopied && <div className="hint">Invite link copied - drop it in your group chat.</div>}
            </div>
          ) : (
            <div className="first-run-group">
              <div className="field">
                <span>Start a group</span>
                <div className="inline-form">
                  <input
                    placeholder="What should we call it? (e.g. The Lads)"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    maxLength={40}
                  />
                  <button className="btn btn-primary" type="button" onClick={createGroup} disabled={!groupName.trim()}>
                    Create
                  </button>
                </div>
              </div>
              <div className="field">
                <span>Or join a mate&apos;s with their code</span>
                <div className="inline-form">
                  <input placeholder="Invite code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
                  <button className="btn btn-ghost" type="button" onClick={joinGroup} disabled={!joinCode.trim()}>
                    Join
                  </button>
                </div>
              </div>
            </div>
          ))}

        {step === 1 && (
          <div className="first-run-chip-grid">
            {loadingFollows
              ? null
              : STARTER_TEAMS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={followedTeams.has(name) ? 'first-run-chip active icon-row' : 'first-run-chip icon-row'}
                    onClick={() => toggleTeam(name)}
                  >
                    <StarIcon width={12} height={12} filled={followedTeams.has(name)} /> {name}
                  </button>
                ))}
          </div>
        )}

        {step === 2 && (
          <div className="first-run-chip-grid">
            {BOOKMAKERS.map((name) => (
              <button
                key={name}
                type="button"
                className={(user.bookmakerPrefs ?? []).includes(name) ? 'first-run-chip active' : 'first-run-chip'}
                onClick={() => toggleBookmaker(name)}
              >
                {(user.bookmakerPrefs ?? []).includes(name) ? '✓' : ''} {name}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="first-run-log-bet">
            {firstBetLogged ? (
              <p className="tone-good icon-row">
                Nice - your first bet's on the Tracker. <CelebrateIcon width={16} height={16} />
              </p>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => setShowManualEntry(true)}>
                Log a bet
              </button>
            )}
          </div>
        )}

        <div className="onboarding-actions">
          {!last && (
            <button className="btn btn-ghost" onClick={onDone}>
              Skip
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? "I'm in" : 'Next'}
          </button>
        </div>
      </div>

      {showManualEntry && (
        <ManualEntrySheet
          userId={user.id}
          onClose={() => setShowManualEntry(false)}
          onSaved={() => {
            setShowManualEntry(false)
            setFirstBetLogged(true)
          }}
        />
      )}
    </div>
  )
}
