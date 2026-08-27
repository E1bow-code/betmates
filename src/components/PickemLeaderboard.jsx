import { useState } from 'react'
import { computePickemLeaderboard } from '../utils/pickem.js'
import Avatar from './Avatar.jsx'
import UserLink from './UserLink.jsx'
import { TargetIcon } from './icons/Icons.jsx'

// Separate from the real-money Leaderboard above it on GroupFeedPage - this
// one only ever counts free (no-stake) picks, resets every week, and is
// deliberately framed around a win-loss record rather than P&L, so it
// reads as a lower-stakes side contest rather than a second scoreboard for
// the same thing.
export default function PickemLeaderboard({ posts, memberNames }) {
  const [expanded, setExpanded] = useState(false)
  const rows = computePickemLeaderboard(posts, memberNames)
  if (!rows.length) return null

  return (
    <div className="leaderboard">
      <button className="leaderboard-toggle icon-row" onClick={() => setExpanded((v) => !v)}>
        <TargetIcon width={16} height={16} /> Pick'em this week {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="leaderboard-list">
          {rows.map((row, i) => (
            <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
              <span className="leaderboard-rank">#{i + 1}</span>
              <Avatar name={row.name} size={24} />
              <UserLink id={row.userId} displayName={row.name} className="leaderboard-name" />
              <span className="leaderboard-pnl tone-good">
                {row.wins}-{row.losses}
              </span>
              <span className="leaderboard-meta">free picks, no stake</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
