import { useState } from 'react'
import { computeStats } from '../utils/trackerStats.js'
import Avatar from './Avatar.jsx'

// Section 2C's "aggregate group leaderboard" - ranks members of a single
// group by P&L using the same computeStats math as the personal Tracker,
// scoped to bets posted in this group. Only settled (won/lost) bets with a
// visible stake count - hidden-stake bets can't contribute a real P&L.

export default function Leaderboard({ posts, memberNames }) {
  const [expanded, setExpanded] = useState(false)

  const byUser = new Map()
  for (const post of posts) {
    if (post.stakeHidden) continue
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  const rows = [...byUser.entries()]
    .map(([userId, userPosts]) => ({ userId, name: memberNames[userId] ?? 'Someone', ...computeStats(userPosts) }))
    .filter((row) => row.settledCount > 0)
    .sort((a, b) => b.profit - a.profit)

  if (!rows.length) return null

  return (
    <div className="leaderboard">
      <button className="leaderboard-toggle" onClick={() => setExpanded((v) => !v)}>
        🏆 Leaderboard {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="leaderboard-list">
          {rows.map((row, i) => (
            <div key={row.userId} className="leaderboard-row">
              <span className="leaderboard-rank">{i === 0 ? '🏆' : `#${i + 1}`}</span>
              <Avatar name={row.name} size={24} />
              <span className="leaderboard-name">{row.name}</span>
              <span className={`leaderboard-pnl ${row.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                {row.profit >= 0 ? '+' : ''}£{row.profit.toFixed(2)}
              </span>
              <span className="leaderboard-meta">
                {row.winRate === null ? '-' : `${row.winRate}% WR`} · {row.roi === null ? '-' : `${row.roi >= 0 ? '+' : ''}${row.roi}% ROI`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
