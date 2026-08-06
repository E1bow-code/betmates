import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { computeTrendingPicks } from '../utils/trending.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { formatRelativeTime } from '../utils/format.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import EmptyState from '../components/EmptyState.jsx'

// The actual front door post-login (see App.jsx's HomeRedirect) - everything
// here is composed from data other pages already fetch (Tracker's stats,
// ActivityContext's notification feed, the public feed's trending picks),
// not a new table or endpoint. The point is a genuine "what's going on"
// glance rather than dumping straight onto the Odds tab with zero context.
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
  const openBets = useMemo(
    () =>
      entries
        ? [...entries].filter((e) => e.status === 'open').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [],
    [entries]
  )
  const recentNotifications = (notifications ?? []).slice(0, 3)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user.displayName?.split(' ')[0] ?? 'there'

  return (
    <div>
      <SportHeroBanner sport="social" />
      <div className="topbar">
        <h1>
          {greeting}, {firstName}
        </h1>
      </div>

      {stats && stats.settledCount > 0 && (
        <div className="stat-tiles">
          <StatTile
            label="P&L"
            value={`${stats.profit >= 0 ? '+' : ''}£${stats.profit.toFixed(2)}`}
            tone={stats.profit >= 0 ? 'good' : 'bad'}
          />
          <StatTile label="Win rate" value={stats.winRate === null ? '-' : `${stats.winRate}%`} />
          <StatTile label="Open bets" value={openBets.length} />
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
          <div className="tracker-list">
            {openBets.slice(0, 4).map((entry) => (
              <div key={entry.id} className="tracker-row">
                <div className="tracker-row-main">
                  <div className="selection-event">
                    <SportIcon sport={entry.sport} /> {entry.selections?.[0]?.event ?? 'Bet'}
                  </div>
                  <div className="race-card-meta">
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
          <div className="tracker-list">
            {recentNotifications.map((n) => (
              <div key={n.id} className="tracker-row">
                <div className="tracker-row-main">
                  <div className="selection-event">
                    {n.kind === 'posted' ? `${n.name} posted a pick` : n.event}
                  </div>
                  <div className="race-card-meta">{n.kind === 'posted' ? n.event : `Settled ${n.status}`} · {formatRelativeTime(n.at)}</div>
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
            {trending.slice(0, 4).map((pick) => (
              <div key={pick.key} className="trending-chip">
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

function StatTile({ label, value, tone }) {
  return (
    <div className={`stat-tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}
