import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import EmptyState from './EmptyState.jsx'
import * as dataStore from '../lib/dataStore.js'
import { LEADERBOARD_WINDOWS } from '../utils/dateWindows.js'
import { MIN_SETTLED_TO_RANK } from '../utils/tipsters.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { TargetIcon, BadgeCheckIcon, FlameIcon } from './icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

// Discovery surface for the app's sharpest public tipsters (see
// src/utils/tipsters.js). Ranked by verified ROI, with a one-tap follow so
// finding a good tipster and following them is a single move - the core loop
// that turns tracking into reputation-building. Reuses the existing
// follows table (dataStore.followUser/listFollowing).
export default function TipsterLeaderboard({ rows, window, onWindowChange, currentUserId }) {
  const [following, setFollowing] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const runAsync = useAsyncAction()

  useEffect(() => {
    let cancelled = false
    dataStore
      .listFollowing(currentUserId)
      .then((ids) => !cancelled && setFollowing(new Set(ids)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  async function toggleFollow(userId) {
    const isFollowing = following.has(userId)
    setBusy(userId)
    const ok = await runAsync(
      () => (isFollowing ? dataStore.unfollowUser(currentUserId, userId) : dataStore.followUser(currentUserId, userId)),
      `Couldn't ${isFollowing ? 'unfollow' : 'follow'} - try again`
    )
    setBusy(null)
    if (ok) {
      setFollowing((prev) => {
        const next = new Set(prev)
        if (isFollowing) next.delete(userId)
        else next.add(userId)
        return next
      })
    }
  }

  return (
    <>
      <p className="hint">
        The sharpest public tipsters, ranked by ROI on verified picks (min {MIN_SETTLED_TO_RANK} settled). Every pick is logged with
        its odds locked in, so a record here can't be faked. CLV shows how much they beat the closing line by — skill that, unlike
        profit, can't be fluked.
      </p>

      <div className="mode-switcher">
        {LEADERBOARD_WINDOWS.map((w) => (
          <button key={w.key} className={window === w.key ? 'mode-tab active' : 'mode-tab'} onClick={() => onWindowChange(w.key)}>
            {w.label}
          </button>
        ))}
      </div>

      {rows === null && <div className="loading">Ranking the tipsters…</div>}
      {rows && !rows.length && (
        <EmptyState
          icon={<TargetIcon width={26} height={26} />}
          title="No ranked tipsters yet"
          subtitle={`Post picks publicly and settle at least ${MIN_SETTLED_TO_RANK} to make the board.`}
        />
      )}

      {rows && rows.length > 0 && (
        <div className="tipster-list">
          {rows.map((row, i) => (
            <div key={row.userId} className={i === 0 ? 'tipster-row tipster-row-top' : 'tipster-row'}>
              <span className="leaderboard-rank">#{i + 1}</span>
              <Avatar name={row.name} size={30} />
              <div className="tipster-main">
                <div className="tipster-name-row">
                  {row.code ? (
                    <Link to={`/u/${row.code}`} className="tipster-name">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="tipster-name">{row.name}</span>
                  )}
                  {row.badge && (
                    <span className="tipster-badge icon-row">
                      {(() => {
                        const BadgeIcon = TIPSTER_BADGE_ICON[row.badge.icon]
                        return BadgeIcon && <BadgeIcon width={13} height={13} />
                      })()}{' '}
                      {row.badge.label}
                    </span>
                  )}
                </div>
                <div className="tipster-meta">
                  {row.winRate === null ? '-' : `${row.winRate}% WR`} · {row.settledCount} picks
                  {row.streak >= 2 && (
                    <>
                      {' · '}
                      <FlameIcon width={12} height={12} className="icon-lead" /> {row.streak}
                    </>
                  )}
                  {row.clv && (
                    <>
                      {' · '}
                      <TargetIcon width={12} height={12} className="icon-lead" /> {row.clv.avgPct >= 0 ? '+' : ''}
                      {row.clv.avgPct}% CLV
                    </>
                  )}
                </div>
              </div>
              <div className="tipster-numbers">
                <div className={`tipster-roi ${row.roi >= 0 ? 'tone-good' : 'tone-bad'}`}>
                  {row.roi >= 0 ? '+' : ''}
                  {row.roi}%
                </div>
                <div className="tipster-roi-label">ROI</div>
              </div>
              {row.userId !== currentUserId && (
                <button
                  className={following.has(row.userId) ? 'btn btn-ghost btn-small' : 'btn btn-secondary btn-small'}
                  onClick={() => toggleFollow(row.userId)}
                  disabled={busy === row.userId}
                >
                  {following.has(row.userId) ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
