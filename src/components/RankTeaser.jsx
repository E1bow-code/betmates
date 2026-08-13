import { Link } from 'react-router-dom'
import { TargetIcon } from './icons/Icons.jsx'

// HomePage's glance-able social-standing signal - see HomePage.jsx's own
// header comment for why P&L/activity isn't repeated here too. Only ever
// rendered when there's an actual rank to show (see HomePage's derivation) -
// no "join a group" nudge otherwise, same silent-omission pattern as the
// streak badge above it.
export default function RankTeaser({ groupId, groupName, rank, totalRanked, clv }) {
  return (
    <Link to={`/groups/${groupId}`} className="rank-teaser">
      <span className="rank-teaser-rank">#{rank}</span>
      <span className="rank-teaser-body">
        <span className="rank-teaser-group">in {groupName}</span>
        <span className="rank-teaser-context">
          {totalRanked} ranked · tap for the board
          {/* The user's own closing line value in this group - the "are you
              actually sharp" signal next to the "are you winning" rank. Only
              shown once enough closes exist to clear clvSummary's sample gate. */}
          {clv && (
            <>
              {' · '}
              <span className="icon-row">
                <TargetIcon width={13} height={13} />
                {clv.avgPct >= 0 ? '+' : ''}
                {clv.avgPct}% CLV
              </span>
            </>
          )}
        </span>
      </span>
      <span className="rank-teaser-chevron">›</span>
    </Link>
  )
}
