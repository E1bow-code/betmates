import { Fragment, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { computeGroupLeaderboard, computeGroupClvLeaderboard } from '../utils/groupLeaderboard.js'
import { rankDeltas } from '../utils/rankMovement.js'
import { leaderboardGap } from '../utils/leaderboardGap.js'
import { LEADERBOARD_WINDOWS, formatPeriod } from '../utils/dateWindows.js'
import * as dataStore from '../lib/dataStore.js'
import Avatar from './Avatar.jsx'
import UserLink from './UserLink.jsx'
import ShareLeaderboardButton from './ShareLeaderboardButton.jsx'
import ReferralTierBadge from './ReferralTierBadge.jsx'
import WinStreakBadge from './WinStreakBadge.jsx'
import PremiumGate from './PremiumGate.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { TargetIcon, TrophyIcon } from './icons/Icons.jsx'

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

export default function Leaderboard({ posts, memberNames, currentUserId, closes = {}, groupId, referralCounts = {} }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [timeWindow, setTimeWindow] = useState('all')
  const [metric, setMetric] = useState('profit')
  const [seasons, setSeasons] = useState(null)
  // Snapshot of each member's all-time rank as it was when this viewer last
  // opened the group, so rows can show a ▲/▼ movement arrow "since you last
  // looked". Captured once per mount (before overwriting the stored snapshot),
  // per-viewer via localStorage - no schema, mirroring the rivalry watermark.
  const [prevRanks, setPrevRanks] = useState(null)
  const snappedRef = useRef(false)

  // Past champions only matter once the leaderboard itself is open, and
  // groupId is optional (older/other callers than GroupFeedPage.jsx just
  // won't get the strip) - no point fetching a list nobody will see.
  useEffect(() => {
    if (!expanded || !groupId) return
    dataStore
      .listSeasonResults(groupId)
      .then(setSeasons)
      .catch(() => setSeasons([]))
  }, [expanded, groupId])

  // "You just passed X" - a lightweight rivalry moment. We keep the set of
  // members ranked above me last time in localStorage (per group; no schema,
  // mirroring ActivityContext's lastSeen watermarks) and, when someone who
  // was above me is now genuinely below me on the all-time profit board,
  // toast it once. Never fires on first sight of a group (no watermark yet),
  // and updating the watermark each run keeps it idempotent across re-renders.
  useEffect(() => {
    if (!groupId || !currentUserId) return
    const board = computeGroupLeaderboard(posts, memberNames, 'all')
    const meIndex = board.findIndex((r) => r.userId === currentUserId)
    if (meIndex === -1) return
    const aboveNow = board.slice(0, meIndex).map((r) => r.userId)
    const belowNow = new Set(board.slice(meIndex + 1).map((r) => r.userId))
    const key = `betmates:lbAbove:${groupId}`
    let stored = null
    try {
      stored = JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      stored = null
    }
    try {
      localStorage.setItem(key, JSON.stringify(aboveNow))
    } catch {
      /* private mode / storage disabled - the moment just won't fire */
    }
    if (!Array.isArray(stored)) return // first time seeing this group
    // nearest mate who was above me before and is now below me = who I passed
    const passedUid = [...stored].reverse().find((uid) => belowNow.has(uid))
    if (passedUid) showToast(`🔥 You passed ${memberNames[passedUid] || 'a mate'} on the leaderboard`)
  }, [groupId, currentUserId, posts, memberNames, showToast])

  // Capture the prior all-time ranks once per mount (for the movement arrows),
  // then overwrite the stored snapshot with the current standing so the next
  // visit compares against now.
  useEffect(() => {
    if (!groupId || snappedRef.current) return
    const board = computeGroupLeaderboard(posts, memberNames, 'all')
    if (!board.length) return
    const key = `betmates:lbRanks:${groupId}`
    let stored = null
    try {
      stored = JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      stored = null
    }
    setPrevRanks(stored && typeof stored === 'object' ? stored : {})
    const cur = {}
    board.forEach((r) => {
      cur[r.userId] = r.rank
    })
    try {
      localStorage.setItem(key, JSON.stringify(cur))
    } catch {
      /* storage disabled - arrows just won't show */
    }
    snappedRef.current = true
  }, [groupId, posts, memberNames])

  const hasAnySettled = posts.some((p) => !p.stakeHidden && p.stake && ['won', 'lost', 'void'].includes(p.status))
  if (!hasAnySettled) return null

  const rows =
    metric === 'clv' ? computeGroupClvLeaderboard(posts, memberNames, closes, timeWindow) : computeGroupLeaderboard(posts, memberNames, timeWindow)

  // Movement arrows only make sense on the default all-time profit view, whose
  // ranks are what the snapshot stores; a windowed or CLV board would compare
  // against the wrong basis, so it just shows no arrows.
  const deltas = prevRanks && metric === 'profit' && timeWindow === 'all' ? rankDeltas(rows, prevRanks) : {}

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
            <button className={metric === 'clv' ? 'mode-tab active icon-row' : 'mode-tab icon-row'} onClick={() => setMetric('clv')}>
              <TargetIcon width={14} height={14} /> CLV
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
              {rows.map((row) => {
                const gap = row.userId === currentUserId ? leaderboardGap(rows, currentUserId) : null
                return (
                <Fragment key={row.userId}>
                <div className={row.rank === 1 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">
                    #{row.rank}
                    {deltas[row.userId] > 0 && <span className="rank-move up" title={`Up ${deltas[row.userId]} since you last looked`}>▲{deltas[row.userId]}</span>}
                    {deltas[row.userId] < 0 && <span className="rank-move down" title={`Down ${-deltas[row.userId]} since you last looked`}>▼{-deltas[row.userId]}</span>}
                  </span>
                  <Avatar name={row.name} size={24} />
                  <UserLink id={row.userId} className="leaderboard-name">
                    {row.name}
                    <ReferralTierBadge count={referralCounts[row.userId]} />
                    <WinStreakBadge count={row.winStreak} />
                  </UserLink>
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
                {gap && gap.type !== 'alone' && (
                  <p className="leaderboard-gap">
                    {gap.type === 'behind'
                      ? gap.gap === 0
                        ? `Level with ${gap.name} — the next bet decides it`
                        : `£${gap.gap.toFixed(2)} behind ${gap.name} — reel them in`
                      : gap.gap === 0
                        ? `Level at the top with ${gap.name}`
                        : `£${gap.gap.toFixed(2)} clear of ${gap.name} at the top`}
                  </p>
                )}
                </Fragment>
                )
              })}
            </div>
          )}
          {rows.length > 0 && metric === 'clv' && (
            <PremiumGate isPremium={user.isPremium} label="The CLV leaderboard">
              <div className="leaderboard-list">
                {rows.map((row) => (
                  <div key={row.userId} className={row.rank === 1 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                    <span className="leaderboard-rank">#{row.rank}</span>
                    <Avatar name={row.name} size={24} />
                    <UserLink id={row.userId} className="leaderboard-name">
                      {row.name}
                      <ReferralTierBadge count={referralCounts[row.userId]} />
                    </UserLink>
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
            </PremiumGate>
          )}
          {seasons && seasons.length > 0 && (
            <div className="season-champions">
              <p className="season-champions-title icon-row">
                <TrophyIcon width={16} height={16} /> Past champions
              </p>
              <div className="season-champions-list">
                {seasons.map((s) => (
                  <div key={s.period} className="season-champions-entry">
                    <div className="season-champions-row">
                      <span className="season-champions-period">{formatPeriod(s.period)}</span>
                      <span className="season-champions-name">{s.winnerName}</span>
                      <span className={`season-champions-profit ${s.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                        {s.profit >= 0 ? '+' : ''}£{s.profit.toFixed(2)}
                      </span>
                    </div>
                    {s.clvWinnerName && (
                      <div className="season-champions-clv icon-row">
                        <TargetIcon width={13} height={13} /> Sharpest: {s.clvWinnerName} · {s.clvAvgPct >= 0 ? '+' : ''}
                        {s.clvAvgPct}% CLV
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
