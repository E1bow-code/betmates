import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStreak } from '../utils/trackerStats.js'
import { computeGroupLeaderboard, computeGroupClvLeaderboard } from '../utils/groupLeaderboard.js'
import { computeHomeHighlights } from '../utils/homeHighlights.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import PublicFeedView from '../components/PublicFeedView.jsx'
import RankTeaser from '../components/RankTeaser.jsx'
import HomeHighlights from '../components/HomeHighlights.jsx'

// The front door post-login (see App.jsx's HomeRedirect) - the public feed
// is still the main attraction, and raw P&L/open-bets/recent-activity still
// aren't repeated here (they already live one tap away on Tracker/Alerts).
// What *is* worth surfacing is a different class of signal: glanceable
// patterns-of-behaviour (streak, rank, and now the highlights strip below)
// rather than raw numbers - a nudge to look deeper, not a second Tracker.
export default function HomePage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)
  const [rankTeaser, setRankTeaser] = useState(null)
  const [feedFilter, setFeedFilter] = useState('all')

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
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  // The daily "log a bet" streak (src/utils/dailyStreak.js) - different
  // from `streak` above, which counts consecutive WINS. today's date as a
  // UTC string matches the 'date' column streak_last_logged_date holds.
  const loggedToday = user.streakLastLoggedDate === now.toISOString().slice(0, 10)

  return (
    <div>
      <SportHeroBanner sport="dashboard" />

      <div className="dashboard-hero">
        <p className="dashboard-hero-date">{dateLabel}</p>
        <h1 className="dashboard-hero-greeting">
          {greeting}, {firstName}
        </h1>
        {streak.count >= 2 && (
          <div className="dashboard-hero-streak">
            {streak.type === 'won' ? '🔥' : '🥶'} {streak.count}-{streak.type === 'won' ? 'win' : 'loss'} streak
          </div>
        )}
        {user.streakCurrentCount >= 1 && (
          <div className="dashboard-hero-streak dashboard-hero-daily-streak">
            📅 {user.streakCurrentCount}-day streak{!loggedToday && ' · log a bet today to keep it going'}
          </div>
        )}
      </div>

      {rankTeaser && <RankTeaser {...rankTeaser} />}

      <HomeHighlights highlights={highlights} />

      <div className="mode-switcher">
        <button className={feedFilter === 'all' ? 'mode-tab active' : 'mode-tab'} onClick={() => setFeedFilter('all')}>
          All
        </button>
        <button className={feedFilter === 'following' ? 'mode-tab active' : 'mode-tab'} onClick={() => setFeedFilter('following')}>
          Following
        </button>
        <Link to="/groups" state={{ segment: 'tips' }} className="mode-tab">
          Tips
        </Link>
      </div>

      <PublicFeedView filter={feedFilter} />
    </div>
  )
}
