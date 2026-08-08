import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import EmptyState from '../components/EmptyState.jsx'
import Avatar from '../components/Avatar.jsx'
import AdminTimeSeriesChart from '../components/AdminTimeSeriesChart.jsx'

// Same is_admin gating as AdminReportsPage.jsx/AdminErrorLogsPage.jsx -
// client-side here is UX only, real enforcement is netlify/functions/
// admin-analytics.js checking the caller's own access token server-side
// (RLS doesn't give an admin broad read access to bet_posts/manual_entries/
// etc, so this can't be a client-side Supabase query like the other two
// admin pages).
function StatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}

function StreakList({ title, rows }) {
  if (!rows.length) return null
  return (
    <div className="leaderboard-list-standalone">
      <h2 className="market-title">{title}</h2>
      <div className="leaderboard-list">
        {rows.map((row, i) => (
          <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
            <span className="leaderboard-rank">#{i + 1}</span>
            <Avatar name={row.name} size={24} />
            <span className="leaderboard-name">{row.name}</span>
            <span className="leaderboard-pnl tone-good">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user.isAdmin) return
    dataStore
      .getAdminAnalytics()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [user.isAdmin])

  if (!user.isAdmin) return <Navigate to="/odds" replace />

  return (
    <div>
      <div className="topbar">
        <Link to="/account" className="back">
          &larr; Account
        </Link>
        <h1>Analytics</h1>
      </div>

      {error && <div className="error">Couldn't load analytics: {error}</div>}
      {!error && data === null && <div className="loading">Loading analytics…</div>}
      {data && !data.overview.totalUsers && (
        <EmptyState icon="📊" title="Nothing to show yet" subtitle="Numbers show up here once people start using the app." />
      )}

      {data && data.overview.totalUsers > 0 && (
        <>
          <div className="stat-tiles admin-stat-tiles">
            <StatTile label="Total users" value={data.overview.totalUsers} />
            <StatTile label="Total groups" value={data.overview.totalGroups} />
            <StatTile label="Bets logged" value={data.overview.totalBets} />
            <StatTile label="Bets settled" value={data.overview.totalSettled} />
            <StatTile label="Signups today" value={data.overview.signupsToday} />
            <StatTile label="Signups this week" value={data.overview.signupsThisWeek} />
          </div>

          <AdminTimeSeriesChart data={data.signupsByDay} label="Signups" />
          <AdminTimeSeriesChart data={data.betsByDay} label="Bets logged" />
          <AdminTimeSeriesChart data={data.groupsByDay} label="Groups created" />

          <h2 className="market-title">Active users</h2>
          <div className="stat-tiles admin-stat-tiles">
            <StatTile label="Today (DAU)" value={data.activeUsers.dau} />
            <StatTile label="This week (WAU)" value={data.activeUsers.wau} />
            <StatTile label="This month (MAU)" value={data.activeUsers.mau} />
          </div>

          <StreakList title="Current win streaks" rows={data.topStreaks.current} />
          <StreakList title="Longest-ever win streaks" rows={data.topStreaks.longest} />
        </>
      )}
    </div>
  )
}
