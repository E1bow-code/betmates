import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchFixtures } from '../api/oddsClient.js'
import { fetchRaces } from '../api/racingClient.js'
import { formatKickoff, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

const SPORTS = [
  { key: 'football', label: 'Football' },
  { key: 'racing', label: 'Horse Racing' }
]

export default function OddsListPage() {
  const { user } = useAuth()
  const [sport, setSport] = useState('football')
  const [items, setItems] = useState(null)
  const [itemsSport, setItemsSport] = useState(null) // which sport `items` was fetched for
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)

  useEffect(() => {
    setError(null)
    const fetcher = sport === 'football' ? fetchFixtures() : fetchRaces()
    fetcher
      .then((data) => {
        setItems(data)
        setItemsSport(sport)
      })
      .catch((err) => setError(err.message))
  }, [sport])

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null
  const loaded = itemsSport === sport ? items : null

  return (
    <div>
      <div className="topbar">
        <h1>Odds</h1>
        <div className="sport-switcher">
          {SPORTS.map((s) => (
            <button
              key={s.key}
              className={sport === s.key ? 'sport-pill active' : 'sport-pill'}
              onClick={() => setSport(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={myBookiesOnly}
            onChange={(e) => setMyBookiesOnly(e.target.checked)}
            disabled={!user?.bookmakerPrefs?.length}
          />
          <span>My bookies only</span>
        </label>
      </div>

      {!user?.bookmakerPrefs?.length && (
        <p className="hint">
          Add your bookmakers in <Link to="/account">Account</Link> to filter odds down to accounts you actually hold.
        </p>
      )}

      {error && <div className="error">Hmm, couldn't load {sport === 'football' ? 'the fixtures' : 'the races'}: {error}</div>}
      {!error && !loaded && <div className="loading">Fetching the latest {sport === 'football' ? 'fixtures' : 'races'}…</div>}
      {loaded && !loaded.length && (
        <EmptyState
          icon={sport === 'football' ? '⚽' : '🏇'}
          title="Nothing on the board"
          subtitle="Check back closer to kick-off — new fixtures land as they're announced."
        />
      )}

      {loaded && loaded.length > 0 && (
        <div className="race-list">
          {sport === 'football'
            ? loaded.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} bookmakerFilter={bookmakerFilter} />)
            : loaded.map((race) => <RaceCard key={race.id} race={race} bookmakerFilter={bookmakerFilter} />)}
        </div>
      )}
    </div>
  )
}

function FixtureCard({ fixture, bookmakerFilter }) {
  const h2h = fixture.markets.find((m) => m.key === 'h2h')
  const home = h2h?.outcomes.find((o) => o.name === 'Home')
  const away = h2h?.outcomes.find((o) => o.name === 'Away')
  const homeBest = home ? bestWithinFilter(home.allOdds, bookmakerFilter) : null
  const awayBest = away ? bestWithinFilter(away.allOdds, bookmakerFilter) : null

  return (
    <Link className="race-card" to={`/odds/football/${fixture.id}`}>
      <div className="race-card-time">
        <span className="off-time">{formatKickoff(fixture.kickoff)}</span>
        <span className="countdown">{formatCountdown(fixture.kickoff)}</span>
      </div>
      <div className="race-card-main">
        <div className="race-card-title">
          {fixture.homeTeam} v {fixture.awayTeam}
        </div>
        <div className="race-card-meta">{fixture.competition}</div>
      </div>
      <div className="race-card-fav">
        <div className="fav-label">Best 1X2</div>
        <div className="fav-price">{homeBest ? homeBest.decimal.toFixed(2) : '-'}</div>
        <div className="fav-price-away">{awayBest ? awayBest.decimal.toFixed(2) : '-'}</div>
      </div>
    </Link>
  )
}

function RaceCard({ race, bookmakerFilter }) {
  const withBest = race.runners
    .map((r) => ({ runner: r, best: bestWithinFilter(r.allOdds, bookmakerFilter) }))
    .filter((r) => r.best)
  const favourite = withBest.length ? withBest.reduce((a, b) => (b.best.decimal < a.best.decimal ? b : a)) : null

  return (
    <Link className="race-card" to={`/odds/racing/${race.id}`}>
      <div className="race-card-time">
        <span className="off-time">{formatKickoff(race.offTime)}</span>
        <span className="countdown">{formatCountdown(race.offTime)}</span>
      </div>
      <div className="race-card-main">
        <div className="race-card-title">
          {race.course} · {race.raceName}
        </div>
        <div className="race-card-meta">
          {race.raceClass} · {race.distance} · {race.going} · {race.runners.length} runners
        </div>
      </div>
      <div className="race-card-fav">
        <div className="fav-label">Favourite</div>
        {favourite ? (
          <>
            <div className="fav-name">{favourite.runner.name}</div>
            <div className="fav-price">{favourite.best.price}</div>
          </>
        ) : (
          <div className="fav-price">-</div>
        )}
      </div>
    </Link>
  )
}
