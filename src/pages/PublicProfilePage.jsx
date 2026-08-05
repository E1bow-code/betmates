import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

// The one route in this app that works fully logged out - reachable from a
// "Share my profile" link (see AccountPage) without the visitor needing an
// account first. Backed by netlify/functions/public-profile.js, which only
// ever reads that one person's PUBLIC bet posts, same visibility rule as
// the public feed.
export default function PublicProfilePage() {
  const { code } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/public-profile?code=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err.message))
  }, [code])

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
          <div className="account-identity">
            <Avatar name={data.displayName} photoUrl={data.avatarUrl} size={48} />
            <div>
              <span className="account-name">{data.displayName}</span>
              <div className="race-card-meta">
                On BetMates since {new Date(data.memberSince).toLocaleDateString([], { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="stat-tiles">
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
                    <span className={`bet-status-pill status-${r.status}`}>{r.status === 'won' ? 'Won' : 'Lost'}</span>
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
