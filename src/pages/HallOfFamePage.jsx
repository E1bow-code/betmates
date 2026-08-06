import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Avatar from '../components/Avatar.jsx'

// Works fully logged out, same as PublicProfilePage - reachable as a "look
// what's possible" hook for people who don't have an account yet. Backed
// by netlify/functions/hall-of-fame.js, which only ever reads public bet
// posts (same rule as the public feed), so these are records among what's
// been shared publicly, not literally every bet anyone's ever placed.
const RECORDS = [
  { key: 'biggestWin', icon: '💰', title: 'Biggest single win', render: (r) => `+£${r.profit.toFixed(2)} on ${r.event}` },
  { key: 'longestStreak', icon: '🔥', title: 'Longest win streak', render: (r) => `${r.count} in a row` },
  { key: 'topProfit', icon: '🏆', title: 'Top all-time profit', render: (r) => `+£${r.profit.toFixed(2)}` },
  {
    key: 'monthTopProfit',
    icon: '🗓️',
    title: `Top profit this month`,
    render: (r) => `+£${r.profit.toFixed(2)} - resets next month`
  },
  { key: 'underdog', icon: '🐎', title: 'Biggest underdog win', render: (r, format) => `${formatOdds(r.odds, format)} odds on ${r.event}` },
  { key: 'mostActive', icon: '📣', title: 'Most public picks shared', render: (r) => `${r.count} picks` },
  { key: 'topRecruiter', icon: '🤝', title: 'Brought in the most mates', render: (r) => `${r.count} invited` },
  {
    key: 'sharpestTipster',
    icon: '🎯',
    title: 'Sharpest tipster',
    render: (r) => `${r.badge.icon} ${r.badge.label} · ${r.winRate}% win rate (${r.decidedCount}+ picks)`
  }
]

export default function HallOfFamePage() {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/hall-of-fame')
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  const rows = data ? RECORDS.filter((r) => data[r.key]) : []

  return (
    <div>
      <SportHeroBanner sport="social" />
      <div className="topbar">
        <Link to={user ? '/odds' : '/'} className="back">
          &larr; BetMates
        </Link>
        <h1>Hall of Fame</h1>
      </div>
      <p className="hint">
        All-time records from public picks shared across everyone on BetMates - bets posted privately to a group don't count
        toward these.
      </p>

      {error && <div className="error">Couldn't load records: {error}</div>}
      {data === undefined && !error && <div className="loading">Tallying the records…</div>}

      {data && !rows.length && (
        <EmptyState icon="🏆" title="No records yet" subtitle="Once public picks start settling, the records fill in here." />
      )}

      {rows.length > 0 && (
        <div className="tracker-list">
          {rows.map(({ key, icon, title, render }) => {
            const record = data[key]
            return (
              <div key={key} className="tracker-row hof-row">
                <span className="hof-icon">{icon}</span>
                <div className="tracker-row-main">
                  <div className="selection-event">{title}</div>
                  <div className="race-card-meta">{render(record, format)}</div>
                </div>
                <div className="hof-holder">
                  <Avatar name={record.name} size={24} />
                  {record.code ? (
                    <Link to={`/u/${record.code}`} className="leaderboard-name">
                      {record.name}
                    </Link>
                  ) : (
                    <span className="leaderboard-name">{record.name}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!user && (
        <div className="account-section">
          <p className="hint">Think you've got what it takes?</p>
          <Link className="btn btn-primary" to="/">
            Join BetMates
          </Link>
        </div>
      )}
    </div>
  )
}
