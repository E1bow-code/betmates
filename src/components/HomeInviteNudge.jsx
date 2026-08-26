import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as dataStore from '../lib/dataStore.js'
import InviteMatesButton from './InviteMatesButton.jsx'
import { CelebrateIcon, XIcon } from './icons/Icons.jsx'

const DISMISSED_KEY = 'betmates:homeInviteDismissed'
const MIN_BETS = 3

// A gentle, one-time nudge on Home to bring mates in - shown only once someone
// is actually using the app solo (they've logged a few bets) but isn't in any
// group yet, which is exactly when the social half of BetMates is missing for
// them. Never shown to people who already have mates here, and dismissible.
export default function HomeInviteNudge({ user, entryCount }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [groupCount, setGroupCount] = useState(null)

  useEffect(() => {
    if (dismissed || entryCount < MIN_BETS) return
    let live = true
    dataStore
      .listMyGroups(user.id)
      .then((g) => live && setGroupCount(g.length))
      .catch(() => live && setGroupCount(0))
    return () => {
      live = false
    }
  }, [dismissed, entryCount, user.id])

  // Gate on everything before committing screen space: dismissed, too new to
  // nudge, still loading the group count, or already has a group.
  if (dismissed || entryCount < MIN_BETS || groupCount === null || groupCount > 0) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="home-invite-nudge">
      <button className="home-invite-nudge-close" onClick={dismiss} aria-label="Dismiss">
        <XIcon width={14} height={14} />
      </button>
      <p className="home-invite-nudge-title icon-row">
        <CelebrateIcon /> Betting solo?
      </p>
      <p className="home-invite-nudge-body">
        BetMates is better with mates — compare slips, run a leaderboard, and settle the score.
      </p>
      <div className="home-invite-nudge-actions">
        <InviteMatesButton
          name={user.displayName}
          friendCode={user.friendCode}
          label="Invite your mates"
          className="btn btn-primary btn-small"
        />
        <Link to="/groups" className="btn btn-ghost btn-small">
          Create a group
        </Link>
      </div>
    </div>
  )
}
