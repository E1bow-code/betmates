import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStreak } from '../utils/trackerStats.js'
import { computeGroupLeaderboard, computeGroupClvLeaderboard } from '../utils/groupLeaderboard.js'
import { computeHomeHighlights } from '../utils/homeHighlights.js'
import PublicFeedView from '../components/PublicFeedView.jsx'
import RankTeaser from '../components/RankTeaser.jsx'
import HomeHighlights from '../components/HomeHighlights.jsx'
import HomeInviteNudge from '../components/HomeInviteNudge.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import Avatar from '../components/Avatar.jsx'
import { FlameIcon, SnowflakeIcon, CalendarIcon, VideoIcon } from '../components/icons/Icons.jsx'

// The front door post-login (see App.jsx's HomeRedirect) - Facebook-home-
// feed shaped: a one-line greeting, a single compact strip for glanceable
// signals (streak/rank/highlights - previously five separate hero-sized
// blocks stacked above the feed), a tap-to-post composer bar, then
// straight into the feed itself. Raw P&L/open-bets/recent-activity still
// aren't repeated here - they already live one tap away on Tracker/Alerts.
export default function HomePage() {
  const { user } = useAuth()
  const { openSheet } = useBetSlip()
  const [entries, setEntries] = useState(null)
  const [rankTeaser, setRankTeaser] = useState(null)
  const [feedFilter, setFeedFilter] = useState('all')
  const [showRecorder, setShowRecorder] = useState(false)
  const publicFeedViewRef = useRef(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)])
      .then(([posted, manual]) => setEntries([...posted, ...manual]))
      .catch(() => setEntries([]))
  }, [user.id])

  // Headlines whichever group the user most recently had a rankable
  // (settled, staked, visible) result in - found by filtering posts already
  // fetched above, so this costs zero extra calls for users with no
  // rankable activity, and a flat 3 (regardless of how many groups they're
  // in) for users who have some. All-time window: this is a passive glance,
  // not the full interactive board (that's Leaderboard.jsx, one tap away).
  useEffect(() => {
    if (!entries) return
    const headline = entries
      .filter((e) => e.groupId && e.stake && !e.stakeHidden && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))[0]
    if (!headline) {
      setRankTeaser(null)
      return
    }
    Promise.all([
      dataStore.getGroup(headline.groupId),
      dataStore.listBetPosts(headline.groupId),
      dataStore.listGroupMembers(headline.groupId)
    ])
      .then(async ([group, posts, members]) => {
        const memberNames = Object.fromEntries(members.map((m) => [m.id, m.displayName]))
        const rows = computeGroupLeaderboard(posts, memberNames, 'all')
        const mine = rows.find((r) => r.userId === user.id)
        // The user's own CLV in this same group, for the badge next to their
        // rank. Best-effort: no recorded closes -> no badge, and it never
        // blocks the rank itself (which is the teaser's whole point).
        const fixtureIds = posts.flatMap((p) => (p.selections ?? []).map((s) => s.eventId)).filter(Boolean)
        const closes = await dataStore.getClosingLines(fixtureIds).catch(() => ({}))
        const myClv = computeGroupClvLeaderboard(posts, memberNames, closes, 'all').find((r) => r.userId === user.id)?.clv ?? null
        setRankTeaser(
          mine && group ? { groupId: group.id, groupName: group.name, rank: mine.rank, totalRanked: rows.length, clv: myClv } : null
        )
      })
      .catch(() => setRankTeaser(null))
  }, [entries, user.id])

  const streak = useMemo(() => (entries ? computeStreak(entries) : { type: null, count: 0 }), [entries])
  const highlights = useMemo(() => (entries ? computeHomeHighlights(entries) : []), [entries])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user.displayName?.split(' ')[0] ?? 'there'
  // The daily "log a bet" streak (src/utils/dailyStreak.js) - different
  // from `streak` above, which counts consecutive WINS. today's date as a
  // UTC string matches the 'date' column streak_last_logged_date holds.
  const loggedToday = user.streakLastLoggedDate === now.toISOString().slice(0, 10)
  const hasStatsStrip = streak.count >= 2 || user.streakCurrentCount >= 1 || rankTeaser || highlights.length > 0

  return (
    <div className="home-page">
      <h1 className="home-greeting-text">
        {greeting}, {firstName}
      </h1>

      {hasStatsStrip && (
        <div className="home-stats-strip">
          {streak.count >= 2 && (
            <span className="chip chip--pill chip--md chip--filled-accent home-stat-chip">
              {streak.type === 'won' ? <FlameIcon /> : <SnowflakeIcon />} {streak.count}-{streak.type === 'won' ? 'win' : 'loss'} streak
            </span>
          )}
          {user.streakCurrentCount >= 1 && (
            <span className="chip chip--pill chip--md chip--filled-accent home-stat-chip">
              <CalendarIcon /> {user.streakCurrentCount}-day streak{!loggedToday && ' · log today'}
            </span>
          )}
          {rankTeaser && <RankTeaser {...rankTeaser} />}
          <HomeHighlights highlights={highlights} />
        </div>
      )}

      {entries && <HomeInviteNudge user={user} entryCount={entries.length} />}

      <div className="home-composer-row">
        <button type="button" className="home-composer" onClick={openSheet}>
          <Avatar name={user.displayName} photoUrl={user.avatarUrl} size={36} />
          <span className="home-composer-placeholder">Share your next pick…</span>
        </button>
        <button type="button" className="home-record-tip-btn" onClick={() => setShowRecorder(true)} aria-label="Record a tip">
          <VideoIcon />
        </button>
      </div>

      <div className="mode-switcher">
        <button className={feedFilter === 'all' ? 'mode-tab active' : 'mode-tab'} onClick={() => setFeedFilter('all')}>
          All
        </button>
        <button className={feedFilter === 'following' ? 'mode-tab active' : 'mode-tab'} onClick={() => setFeedFilter('following')}>
          Following
        </button>
      </div>

      <PublicFeedView ref={publicFeedViewRef} filter={feedFilter} />

      {showRecorder && (
        <VideoRecorder
          onClose={() => setShowRecorder(false)}
          onPosted={() => {
            setShowRecorder(false)
            publicFeedViewRef.current?.refresh()
          }}
        />
      )}
    </div>
  )
}
