import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import ManageSheet from '../components/ManageSheet.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Avatar from '../components/Avatar.jsx'

// Landing view for the Social tab. The feed is the main attraction - group/
// friend management (create, join, invite codes) lives behind the Manage
// sheet instead of sitting above the feed. Four segments:
// - Bets: one merged timeline across every group the user is in.
// - Tips: a Twitter-style feed of talking-to-camera picks from the user
//   and their friends (see src/components/VideoRecorder.jsx), with a way
//   to forward a good one into a group or straight to a friend.
// - Feed: public timeline, anyone's posts, regardless of group membership -
//   confidence votes + follow instead of group-mate reactions (BetCard's
//   variant="public").
// - Leaderboard: unlike components/Leaderboard.jsx (scoped to one group's
//   posts, embedded in GroupFeedPage), this ranks everyone the user can
//   see a settled bet from at all - their own groups' posts plus the
//   public feed - since "who's actually good at this" is more interesting
//   across everything than locked to a single group.

export default function SocialFeedPage() {
  const { user } = useAuth()
  const { markSeen } = useActivity()
  const location = useLocation()
  const [segment, setSegment] = useState(location.state?.segment ?? 'bets')
  const [groups, setGroups] = useState(null)
  const [feed, setFeed] = useState(null)
  const [friends, setFriends] = useState(null)
  const [videos, setVideos] = useState(null)
  const [publicFeed, setPublicFeed] = useState(null)
  const [showManage, setShowManage] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)

  useEffect(() => {
    refreshBets()
    markSeen()
  }, [])

  useEffect(() => {
    if (segment === 'tips' && videos === null) refreshTips()
    if ((segment === 'feed' || segment === 'leaderboard') && publicFeed === null) refreshPublicFeed()
  }, [segment])

  const leaderboardRows = useMemo(() => {
    if (feed === null || publicFeed === null) return null
    const names = new Map()
    const byUser = new Map()
    for (const post of [...feed, ...publicFeed]) {
      if (post.stakeHidden) continue
      const name = post.memberNames?.[post.userId] ?? post.authorName ?? 'Someone'
      if (!names.has(post.userId)) names.set(post.userId, name)
      if (!byUser.has(post.userId)) byUser.set(post.userId, [])
      byUser.get(post.userId).push(post)
    }
    return [...byUser.entries()]
      .map(([userId, posts]) => ({ userId, name: names.get(userId), ...computeStats(posts) }))
      .filter((row) => row.settledCount > 0)
      .sort((a, b) => b.profit - a.profit)
  }, [feed, publicFeed])

  function refreshBets() {
    dataStore.listMyGroups(user.id).then(setGroups)
    dataStore.listFeedForUser(user.id).then(setFeed)
  }

  function refreshTips() {
    dataStore.listFriends(user.id).then(setFriends)
    Promise.all([dataStore.listFriendsFeed(user.id), dataStore.listSharedWithMe(user.id)]).then(([own, shared]) => {
      const merged = new Map()
      for (const v of [...own, ...shared]) merged.set(`${v.id}-${v.sharedAt ?? 'own'}`, v)
      setVideos([...merged.values()].sort((a, b) => new Date(b.sharedAt ?? b.createdAt) - new Date(a.sharedAt ?? a.createdAt)))
    })
  }

  function refreshPublicFeed() {
    dataStore.listPublicFeed().then(setPublicFeed)
  }

  function handleManageChanged() {
    refreshBets()
    refreshTips()
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-row">
          <h1>Social</h1>
          {segment !== 'feed' && (
            <button className="btn btn-ghost btn-small" onClick={() => setShowManage(true)}>
              {segment === 'bets' ? 'Groups' : 'Friends'}
            </button>
          )}
        </div>
        <div className="sport-switcher">
          <button className={segment === 'bets' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('bets')}>
            Bets
          </button>
          <button className={segment === 'feed' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('feed')}>
            Feed
          </button>
          <button className={segment === 'tips' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('tips')}>
            Tips
          </button>
          <button className={segment === 'leaderboard' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('leaderboard')}>
            Leaderboard
          </button>
        </div>
      </div>

      {segment === 'bets' && (
        <>
          {groups === null && <div className="loading">Loading your groups…</div>}

          {groups && !groups.length && (
            <EmptyState
              icon="👥"
              title="No groups yet"
              subtitle="Create one for your mates, or join with an invite code, to start sharing bets."
              action={
                <button className="btn btn-primary" onClick={() => setShowManage(true)}>
                  Create or join a group
                </button>
              }
            />
          )}

          {groups && groups.length > 0 && (
            <div className="group-chip-row">
              {groups.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`} className="group-chip">
                  {g.name}
                </Link>
              ))}
            </div>
          )}

          {feed === null && groups?.length > 0 && <div className="loading">Catching up on the latest bets…</div>}
          {feed && groups?.length > 0 && !feed.length && (
            <EmptyState icon="🔕" title="Quiet in here so far" subtitle="Head to the Odds tab and tap a price to get the first bet posted." />
          )}

          {feed && feed.length > 0 && (
            <div className="bet-feed">
              {feed.map((post) => (
                <BetCard key={post.id} post={post} memberNames={post.memberNames} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'feed' && (
        <>
          <p className="hint">Everyone's picks - tap a price on the Odds tab and choose "Post to everyone" to add yours.</p>

          {publicFeed === null && <div className="loading">Catching up on the feed…</div>}
          {publicFeed && !publicFeed.length && (
            <EmptyState icon="📣" title="Nothing here yet" subtitle="Be the first to post a pick for everyone to see." />
          )}

          {publicFeed && publicFeed.length > 0 && (
            <div className="bet-feed">
              {publicFeed.map((post) => (
                <BetCard key={post.id} post={post} variant="public" />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'tips' && (
        <>
          {friends && friends.length > 0 && (
            <div className="group-chip-row">
              {friends.map((f) => (
                <span key={f.id} className="group-chip friend-chip">
                  {f.displayName}
                </span>
              ))}
            </div>
          )}

          <div className="group-actions">
            <button className="btn btn-primary btn-small" onClick={() => setShowRecorder(true)}>
              New tip
            </button>
          </div>

          {videos === null && <div className="loading">Loading tips…</div>}
          {videos && !videos.length && (
            <EmptyState
              icon="🎥"
              title="No tips yet"
              subtitle="Add a friend with their code, or record the first one yourself."
              action={
                <button className="btn btn-secondary" onClick={() => setShowManage(true)}>
                  Add a friend
                </button>
              }
            />
          )}

          {videos && videos.length > 0 && (
            <div className="bet-feed">
              {videos.map((v) => (
                <VideoCard key={`${v.id}-${v.sharedAt ?? 'own'}`} post={v} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'leaderboard' && (
        <>
          <p className="hint">Ranked by profit across every group you're in, plus the public feed - hidden-stake bets don't count.</p>

          {leaderboardRows === null && <div className="loading">Adding it all up…</div>}
          {leaderboardRows && !leaderboardRows.length && (
            <EmptyState icon="🏆" title="Nothing settled yet" subtitle="Once bets start getting marked won or lost, the table fills in here." />
          )}

          {leaderboardRows && leaderboardRows.length > 0 && (
            <div className="leaderboard-list leaderboard-list-standalone">
              {leaderboardRows.map((row, i) => (
                <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">#{i + 1}</span>
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
        </>
      )}

      {showManage && (
        <ManageSheet
          segment={segment}
          groups={groups}
          friends={friends}
          onChanged={handleManageChanged}
          onClose={() => setShowManage(false)}
        />
      )}

      {showRecorder && <VideoRecorder onClose={() => setShowRecorder(false)} onPosted={refreshTips} />}
    </div>
  )
}
