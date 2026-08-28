import { Link } from 'react-router-dom'

// The cold-start state for a group feed with no bets yet. A brand-new group is
// make-or-break: land a member on a dead feed and they bounce. So instead of a
// bare "nothing here", give them the two things that actually get a group
// going - post the first slip, and pull more mates in - with the emphasis
// keyed to whether they're still on their own. `onInvite` reuses the page's
// existing share-invite handler (shareOrCopy + groupInviteUrl).
export default function GroupColdStart({ group, memberCount, onInvite, shareStatus }) {
  const soloish = (memberCount ?? 0) <= 1
  const name = group?.name ?? 'This group'

  return (
    <div className="cold-start">
      <div className="cold-start-icon" aria-hidden="true">🎯</div>
      <h3 className="cold-start-title">{soloish ? "It's just you in here so far" : `${name} is quiet — kick it off`}</h3>
      <p className="cold-start-sub">
        {soloish
          ? 'Groups are more fun with mates. Send the invite, then log a slip to get the leaderboard moving.'
          : 'Be the first to log a slip — once one bet lands, the leaderboard and the banter follow.'}
      </p>

      <div className="cold-start-actions">
        {soloish ? (
          <>
            <button className="btn btn-primary" type="button" onClick={onInvite}>
              Invite your mates
            </button>
            <Link className="btn btn-secondary" to="/odds">
              Log the first slip
            </Link>
          </>
        ) : (
          <>
            <Link className="btn btn-primary" to="/odds">
              Log the first slip
            </Link>
            <button className="btn btn-secondary" type="button" onClick={onInvite}>
              Invite more mates
            </button>
          </>
        )}
      </div>

      {shareStatus && <p className="cold-start-note">{shareStatus}</p>}

      <p className="cold-start-ideas">Ideas to kick off: a weekend acca, a banker single, or screenshot a slip from your bookie.</p>
    </div>
  )
}
