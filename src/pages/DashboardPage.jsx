import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats, computeStreak } from '../utils/trackerStats.js'
import { computeTrendingPicks } from '../utils/trending.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { formatRelativeTime } from '../utils/format.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import EmptyState from '../components/EmptyState.jsx'

// The front door post-login (see App.jsx's HomeRedirect) - everything here
// is composed from data other pages already fetch (Tracker's stats,
// ActivityContext's notification feed, the public feed's trending picks),
// not a new table or endpoint. Deliberately built to look and feel like a
// front door rather than another list page - a real scoreboard moment up
// top instead of Tracker's four-tile grid at the same scale, open bets as
// betting-slip-style dockets, activity as a moving tape rather than a log.
export default function DashboardPage() {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const { notifications } = useActivity()
  const [entries, setEntries] = useState(null)
  const [trending, setTrending] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)])
      .then(([posted, manual]) => setEntries([...posted, ...manual]))
      .catch(() => setEntries([]))
  }, [user.id])

  useEffect(() => {
    dataStore
      .listPublicFeed(user.id)
      .then((feed) => setTrending(computeTrendingPicks(feed)))
      .catch(() => setTrending([]))
  }, [user.id])

  const stats = useMemo(() => (entries ? computeStats(entries) : null), [entries])
  const streak = useMemo(() => (entries ? computeStreak(entries) : { type: null, count: 0 }), [entries])
  const openBets = useMemo(
    () =>
      entries
        ? [...entries].filter((e) => e.status === 'open').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [],
    [entries]
  )
  const recentNotifications = (notifications ?? []).slice(0, 6)

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user.displayName?.split(' ')[0] ?? 'there'
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div>
      <SportHeroBanner sport="social" />

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
      </div>

      {stats && stats.settledCount > 0 && (
        <div className="scoreboard-panel">
          <div>
            <p className="scoreboard-headline-label">All-time P&amp;L</p>
            <div className={`scoreboard-headline-value ${stats.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
              {stats.profit >= 0 ? '+' : ''}£{stats.profit.toFixed(2)}
            </div>
          </div>
          <div className="scoreboard-side-stats">
            <div>
              <div className="scoreboard-side-stat-value">{stats.winRate === null ? '-' : `${stats.winRate}%`}</div>
              <div className="scoreboard-side-stat-label">Win rate</div>
            </div>
            <div>
              <div className="scoreboard-side-stat-value">{openBets.length}</div>
              <div className="scoreboard-side-stat-label">Open</div>
            </div>
          </div>
        </div>
      )}

      <div className="account-section">
        <div className="dashboard-section-header">
          <h2 className="market-title">Open bets</h2>
          <Link to="/tracker" className="hint">
            View all →
          </Link>
        </div>
        {entries === null && <div className="loading">Loading…</div>}
        {entries && !openBets.length && (
          <EmptyState icon="🎯" title="Nothing pending" subtitle="Pick something on the Odds tab to see it here." />
        )}
        {openBets.length > 0 && (
          <div className="docket-list">
            {openBets.slice(0, 4).map((entry) => (
              <div key={entry.id} className="docket">
                <div className="docket-main">
                  <div className="docket-event">
                    <SportIcon sport={entry.sport} /> {entry.selections?.[0]?.event ?? 'Bet'}
                  </div>
                  <div className="docket-meta">
                    {entry.selections?.[0]?.selection} @ {formatOdds(entry.selections?.[0]?.odds, format)}
                    {entry.selections?.length > 1 ? ` +${entry.selections.length - 1} more` : ''}
                  </div>
                </div>
                <span className="bet-status-pill status-open">Pending</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="account-section">
        <div className="dashboard-section-header">
          <h2 className="market-title">Recent activity</h2>
          <Link to="/alerts" className="hint">
            View all →
          </Link>
        </div>
        {recentNotifications.length === 0 ? (
          <EmptyState icon="🔔" title="All quiet" subtitle="Nothing new from your mates or your bets yet." />
        ) : (
          <div className="pulse-tape">
            {recentNotifications.map((n) => (
              <div key={n.id} className="pulse-card">
                <div className="pulse-card-title">{n.kind === 'posted' ? `${n.name} posted a pick` : n.event}</div>
                <div className="pulse-card-meta">
                  {n.kind === 'posted' ? n.event : `Settled ${n.status}`} · {formatRelativeTime(n.at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {trending && trending.length > 0 && (
        <div className="account-section">
          <div className="dashboard-section-header">
            <h2 className="market-title">🔥 Trending this week</h2>
            <Link to="/groups" className="hint">
              See the feed →
            </Link>
          </div>
          <div className="trending-row">
            {trending.slice(0, 4).map((pick, i) => (
              <div key={pick.key} className="trending-chip">
                <span className="trending-chip-rank">{i + 1}</span>
                <SportIcon sport={pick.sport} size={18} />
                <div>
                  <div className="trending-chip-pick">{pick.selection}</div>
                  <div className="trending-chip-meta">
                    {pick.event} · {pick.count} backing this
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-quick-links">
        <Link to="/odds" className="btn btn-secondary">
          Browse odds
        </Link>
        <Link to="/tracker" className="btn btn-secondary">
          Full tracker
        </Link>
      </div>
    </div>
  )
}
