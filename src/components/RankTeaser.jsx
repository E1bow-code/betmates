import { Link } from 'react-router-dom'

// HomePage's glance-able social-standing signal - see HomePage.jsx's own
// header comment for why P&L/activity isn't repeated here too. Only ever
// rendered when there's an actual rank to show (see HomePage's derivation) -
// no "join a group" nudge otherwise, same silent-omission pattern as the
// streak badge above it.
export default function RankTeaser({ groupId, groupName, rank, totalRanked }) {
  return (
    <Link to={`/groups/${groupId}`} className="rank-teaser">
      <span className="rank-teaser-rank">#{rank}</span>
      <span className="rank-teaser-body">
        <span className="rank-teaser-group">in {groupName}</span>
        <span className="rank-teaser-context">{totalRanked} ranked · tap for the board</span>
      </span>
      <span className="rank-teaser-chevron">›</span>
    </Link>
  )
}
