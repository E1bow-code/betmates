import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import Avatar from '../components/Avatar.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import ReferralTierBadge from '../components/ReferralTierBadge.jsx'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { TargetIcon, BadgeCheckIcon } from '../components/icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

// Reachable two ways: /u/:code, the one route in this app that works fully
// logged out (from a "Share my profile" link, see AccountPage, without the
// visitor needing an account first), and /user/:id, for internal in-app
// links (a group member, a comment author, a name in a leaderboard) where
// the caller already has the person's real user id but no friend code.
// Both are backed by netlify/functions/public-profile.js (?code= or ?id=),
// which only ever reads that one person's PUBLIC bet posts, same
// visibility rule as the public feed, regardless of which param found them.
export default function PublicProfilePage() {
  const { code, id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(null)
  // null until checked - the Tipster Leaderboard is the only other place
  // this follow relationship is surfaced, and a signed-in visitor arriving
  // here via a shared link (the whole point of a public profile) had no way
  // to act on it without navigating back there first.
  const [following, setFollowing] = useState(null)
  const [followBusy, setFollowBusy] = useState(false)
  // null until checked, same as `following` above - Add friend stays
  // instant/no-consent, exactly matching addFriendByCode's existing
  // behaviour elsewhere in the app (ManageSheet's "add a friend" form).
  const [isFriendState, setIsFriendState] = useState(null)
  const [friendBusy, setFriendBusy] = useState(false)
  const runAsync = useAsyncAction()

  useEffect(() => {
    const query = code ? `code=${encodeURIComponent(code)}` : `id=${encodeURIComponent(id)}`
    fetch(`/api/public-profile?${query}`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err.message))
  }, [code, id])

  useEffect(() => {
    if (!user || !data?.id || data.id === user.id) return
    let cancelled = false
    dataStore
      .listFollowing(user.id)
      .then((ids) => !cancelled && setFollowing(ids.includes(data.id)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, data?.id])

  useEffect(() => {
    if (!user || !data?.id || data.id === user.id) return
    let cancelled = false
    dataStore
      .isFriend(user.id, data.id)
      .then((yes) => !cancelled && setIsFriendState(yes))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, data?.id])

  async function toggleFollow() {
    setFollowBusy(true)
    const ok = await runAsync(
      () => (following ? dataStore.unfollowUser(user.id, data.id) : dataStore.followUser(user.id, data.id)),
      `Couldn't ${following ? 'unfollow' : 'follow'} - try again`
    )
    setFollowBusy(false)
    if (ok) setFollowing((f) => !f)
  }

  async function handleAddFriend() {
    setFriendBusy(true)
    const ok = await runAsync(() => dataStore.addFriend(user.id, data.id), "Couldn't add friend - try again")
    setFriendBusy(false)
    if (ok) setIsFriendState(true)
  }

  return (
    <div>
      <SportHeroBanner sport="profile" />
      <div className="topbar">
        <Link to={user ? '/odds' : '/'} className="back">
          &larr; BetMates
        </Link>
      </div>

      {error && <div className="error">Couldn't load this profile: {error}</div>}
      {data === undefined && !error && <div className="loading">Loading profile…</div>}
      {data === null && !error && (
        <div className="empty">No profile found for that code.</div>
      )}

      {data && (
        <>
          <div className="profile-identity-row">
            <div className="account-identity">
              <Avatar name={data.displayName} photoUrl={data.avatarUrl} size={48} />
              <div>
                <span className="account-name">
                  {data.displayName}
                  {(() => {
                    const badge = tipsterBadge(data.stats)
                    if (!badge) return null
                    const BadgeIcon = TIPSTER_BADGE_ICON[badge.icon]
                    return (
                      <span className="chip chip--pill chip--sm chip--outline-accent tipster-badge icon-row" title={`${badge.label} - ${data.stats.decidedCount}+ decided public picks`}>
                        {BadgeIcon && <BadgeIcon width={13} height={13} />} {badge.label}
                      </span>
                    )
                  })()}
                  <ReferralTierBadge count={data.referralCount} />
                </span>
                <div className="race-card-meta">
                  On BetMates since {new Date(data.memberSince).toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
            {user && data.id !== user.id && (
              <div className="topbar-actions">
                {following !== null && (
                  <button
                    className={following ? 'btn btn-ghost btn-small' : 'btn btn-secondary btn-small'}
                    onClick={toggleFollow}
                    disabled={followBusy}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                )}
                {isFriendState !== null && (
                  <button
                    className={isFriendState ? 'btn btn-ghost btn-small' : 'btn btn-secondary btn-small'}
                    onClick={handleAddFriend}
                    disabled={friendBusy || isFriendState}
                  >
                    {isFriendState ? 'Friends' : 'Add friend'}
                  </button>
                )}
                <Link to={`/messages/${data.id}`} className="btn btn-ghost btn-small">
                  Message
                </Link>
              </div>
            )}
          </div>

          <div className="stat-tiles profile-stat-tiles">
            <StatTile
              label="P&L"
              value={`${data.stats.profit >= 0 ? '+' : ''}£${data.stats.profit.toFixed(2)}`}
              tone={data.stats.profit >= 0 ? 'good' : 'bad'}
            />
            <StatTile
              label="ROI"
              value={data.stats.roi === null ? '-' : `${data.stats.roi >= 0 ? '+' : ''}${data.stats.roi}%`}
              tone={data.stats.roi >= 0 ? 'good' : 'bad'}
            />
            <StatTile label="Win rate" value={data.stats.winRate === null ? '-' : `${data.stats.winRate}%`} />
            <StatTile label="Picks" value={data.stats.settledCount} />
            <StatTile label="Staked" value={`£${data.stats.staked.toFixed(2)}`} />
          </div>

          {data.recent.length > 0 && (
            <div className="account-section">
              <h2 className="market-title">Recent public picks</h2>
              <div className="tracker-list">
                {data.recent.map((r, i) => (
                  <div key={i} className={`tracker-row status-${r.status}`}>
                    <div className="tracker-row-main">
                      <div className="selection-event">
                        <SportIcon sport={r.sport} /> {r.event}
                      </div>
                    </div>
                    <span className={`chip chip--pill chip--sm chip--outline bet-status-pill status-${r.status}`}>{r.status === 'won' ? 'Won' : 'Lost'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!user && (
            <div className="account-section">
              <p className="hint">Compare odds and track your own bets alongside {data.displayName.split(' ')[0]}'s.</p>
              <Link className="btn btn-primary" to="/">
                Join BetMates
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatTile({ label, value, tone }) {
  return (
    <div className={`stat-tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}
