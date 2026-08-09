import { useState } from 'react'
import { computeGroupLeaderboard, computeGroupClvLeaderboard } from '../utils/groupLeaderboard.js'
import { LEADERBOARD_WINDOWS } from '../utils/dateWindows.js'
import Avatar from './Avatar.jsx'
import ShareLeaderboardButton from './ShareLeaderboardButton.jsx'

// Section 2C's "aggregate group leaderboard" - ranks members of a single
// group by P&L using the same computeStats math as the personal Tracker,
// scoped to bets posted in this group. Only settled (won/lost) bets with a
// visible stake count - hidden-stake bets can't contribute a real P&L.
//
// A second metric, CLV (computeGroupClvLeaderboard), ranks the same
// members by who's actually beating the market's closing line instead -
// harder to fluke than profit, since it's about the price struck, not
// whether the bet happened to win. `closes` (optional, from
// dataStore.getClosingLines) feeds it; defaults to {} so this component
// still works for any caller that doesn't fetch closing lines - the CLV
// tab just won't have any rows to show.

export default function Leaderboard({ posts, memberNames, currentUserId, closes = {} }) {
  const [expanded, setExpanded] = useState(false)
  const [timeWindow, setTimeWindow] = useState('all')
  const [metric, setMetric] = useState('profit')

  const hasAnySettled = posts.some((p) => !p.stakeHidden && p.stake && ['won', 'lost', 'void'].includes(p.status))
  if (!hasAnySettled) return null

  const rows =
    metric === 'clv' ? computeGroupClvLeaderboard(posts, memberNames, closes, timeWindow) : computeGroupLeaderboard(posts, memberNames, timeWindow)

  return (
    <div className="leaderboard">
      <button className="leaderboard-toggle" onClick={() => setExpanded((v) => !v)}>
        Leaderboard {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <>
          <div className="mode-switcher">
            <button className={metric === 'profit' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMetric('profit')}>
              Profit
            </button>
            <button className={metric === 'clv' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMetric('clv')}>
              🎯 CLV
            </button>
          </div>
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
          {!rows.length && (
            <p className="hint">
              {metric === 'clv' ? "Not enough single-leg bets with a recorded closing line yet." : 'Nothing settled in this window.'}
            </p>
          )}
          {rows.length > 0 && metric === 'profit' && (
            <div className="leaderboard-list">
              {rows.map((row) => (
                <div key={row.userId} className={row.rank === 1 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">#{row.rank}</span>
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
                      rank={row.rank}
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
          {rows.length > 0 && metric === 'clv' && (
            <div className="leaderboard-list">
              {rows.map((row) => (
                <div key={row.userId} className={row.rank === 1 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">#{row.rank}</span>
                  <Avatar name={row.name} size={24} />
                  <span className="leaderboard-name">{row.name}</span>
                  <span className={`leaderboard-pnl ${row.clv.avgPct >= 0 ? 'tone-good' : 'tone-bad'}`}>
                    {row.clv.avgPct >= 0 ? '+' : ''}
                    {row.clv.avgPct}%
                  </span>
                  <span className="leaderboard-meta">
                    Beat the close {row.clv.beatRate}% of the time · {row.clv.sample} bet{row.clv.sample === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
