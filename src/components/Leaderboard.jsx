import { useState } from 'react'
import { computeStats } from '../utils/trackerStats.js'
import { LEADERBOARD_WINDOWS, isWithinWindow } from '../utils/dateWindows.js'
import Avatar from './Avatar.jsx'
import ShareLeaderboardButton from './ShareLeaderboardButton.jsx'

// Section 2C's "aggregate group leaderboard" - ranks members of a single
// group by P&L using the same computeStats math as the personal Tracker,
// scoped to bets posted in this group. Only settled (won/lost) bets with a
// visible stake count - hidden-stake bets can't contribute a real P&L.

export default function Leaderboard({ posts, memberNames, currentUserId }) {
  const [expanded, setExpanded] = useState(false)
  const [timeWindow, setTimeWindow] = useState('all')

  const hasAnySettled = posts.some((p) => !p.stakeHidden && p.stake && ['won', 'lost', 'void'].includes(p.status))
  if (!hasAnySettled) return null

  const byUser = new Map()
  for (const post of posts) {
    if (post.stakeHidden) continue
    if (post.settledAt && !isWithinWindow(post.settledAt, timeWindow)) continue
    if (!byUser.has(post.userId)) byUser.set(post.userId, [])
    byUser.get(post.userId).push(post)
  }

  const rows = [...byUser.entries()]
    .map(([userId, userPosts]) => ({ userId, name: memberNames[userId] ?? 'Someone', ...computeStats(userPosts) }))
    .filter((row) => row.settledCount > 0)
    .sort((a, b) => b.profit - a.profit)

  return (
    <div className="leaderboard">
      <button className="leaderboard-toggle" onClick={() => setExpanded((v) => !v)}>
        Leaderboard {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <>
          <div className="mode-switcher">
            {LEADERBOARD_WINDOWS.map((w) => (
              <button
                key={w.key}
                className={timeWindow === w.key ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setTimeWindow(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
          {!rows.length && <p className="hint">Nothing settled in this window.</p>}
          {rows.length > 0 && (
            <div className="leaderboard-list">
              {rows.map((row, i) => (
                <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">#{i + 1}</span>
                  <Avatar name={row.name} size={24} />
                  <span className="leaderboard-name">{row.name}</span>
                  <span className={`leaderboard-pnl ${row.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                    {row.profit >= 0 ? '+' : ''}£{row.profit.toFixed(2)}
                  </span>
                  <span className="leaderboard-meta">
                    {row.winRate === null ? '-' : `${row.winRate}% WR`} ·{' '}
                    {row.roi === null ? '-' : `${row.roi >= 0 ? '+' : ''}${row.roi}% ROI`}
                  </span>
                  {row.userId === currentUserId && (
                    <ShareLeaderboardButton
                      name={row.name}
                      rank={i + 1}
                      profit={row.profit}
                      winRate={row.winRate}
                      roi={row.roi}
                      windowLabel={LEADERBOARD_WINDOWS.find((w) => w.key === timeWindow)?.label ?? 'All-time'}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
