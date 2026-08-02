import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchFixtures } from '../api/oddsClient.js'
import { fetchRaces } from '../api/racingClient.js'
import { fetchFights } from '../api/ufcClient.js'
import { fetchEvents } from '../api/genericSportsClient.js'
import { GENERIC_SPORTS, SPORT_LABEL, SPORT_ICON } from '../lib/sportsConfig.js'
import { formatKickoff, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import TeamBadge from '../components/TeamBadge.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'

const SPORTS = ['football', 'racing', 'ufc', ...Object.keys(GENERIC_SPORTS)].map((key) => ({ key, label: SPORT_LABEL[key] }))

const FETCHERS = {
  football: fetchFixtures,
  racing: fetchRaces,
  ufc: fetchFights,
  ...Object.fromEntries(Object.keys(GENERIC_SPORTS).map((key) => [key, () => fetchEvents(key)]))
}

const NOUN = {
  football: 'the fixtures',
  racing: 'the races',
  ufc: 'the fights',
  ...Object.fromEntries(Object.entries(GENERIC_SPORTS).map(([key, cfg]) => [key, `the ${cfg.label.toLowerCase()} fixtures`]))
}
const ICON = SPORT_ICON

export default function OddsListPage() {
  const { user } = useAuth()
  const [sport, setSport] = useState('football')
  const [items, setItems] = useState(null)
  const [itemsSport, setItemsSport] = useState(null) // which sport `items` was fetched for
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)

  useEffect(() => {
    setError(null)
    FETCHERS[sport]()
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

      {error && <div className="error">Hmm, couldn't load {NOUN[sport]}: {error}</div>}
      {!error && !loaded && <div className="loading">Fetching the latest {NOUN[sport]}…</div>}
      {loaded && !loaded.length && (
        <EmptyState
          icon={ICON[sport]}
          title="Nothing on the board"
          subtitle="Check back closer to kick-off — new fixtures land as they're announced."
        />
      )}

      {loaded && loaded.length > 0 && (
        <div className="race-list">
          {sport === 'football' && loaded.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} bookmakerFilter={bookmakerFilter} />)}
          {sport === 'racing' && loaded.map((race) => <RaceCard key={race.id} race={race} bookmakerFilter={bookmakerFilter} />)}
          {sport === 'ufc' && loaded.map((fight) => <FightCard key={fight.id} fight={fight} bookmakerFilter={bookmakerFilter} />)}
          {GENERIC_SPORTS[sport] &&
            loaded.map((event) => (
              <EventCard key={event.id} event={event} sportKey={sport} config={GENERIC_SPORTS[sport]} bookmakerFilter={bookmakerFilter} />
            ))}
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
        <div className="race-card-title fixture-teams-row">
          <span className="fixture-team">
            <TeamBadge team={fixture.homeTeam} size={20} />
            <span>{fixture.homeTeam}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <TeamBadge team={fixture.awayTeam} size={20} />
            <span>{fixture.awayTeam}</span>
          </span>
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

function FightCard({ fight, bookmakerFilter }) {
  const h2h = fight.markets.find((m) => m.key === 'h2h')
  const a = h2h?.outcomes.find((o) => o.name === fight.fighterA)
  const b = h2h?.outcomes.find((o) => o.name === fight.fighterB)
  const aBest = a ? bestWithinFilter(a.allOdds, bookmakerFilter) : null
  const bBest = b ? bestWithinFilter(b.allOdds, bookmakerFilter) : null

  return (
    <Link className="race-card" to={`/odds/ufc/${fight.id}`}>
      <div className="race-card-time">
        <span className="off-time">{formatKickoff(fight.kickoff)}</span>
        <span className="countdown">{formatCountdown(fight.kickoff)}</span>
      </div>
      <div className="race-card-main">
        <div className="race-card-title fixture-teams-row">
          <span className="fixture-team">
            <PlayerPhoto name={fight.fighterA} size={20} />
            <span>{fight.fighterA}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <PlayerPhoto name={fight.fighterB} size={20} />
            <span>{fight.fighterB}</span>
          </span>
        </div>
        <div className="race-card-meta">{fight.competition}</div>
      </div>
      <div className="race-card-fav">
        <div className="fav-label">Moneyline</div>
        <div className="fav-price">{aBest ? aBest.decimal.toFixed(2) : '-'}</div>
        <div className="fav-price-away">{bBest ? bBest.decimal.toFixed(2) : '-'}</div>
      </div>
    </Link>
  )
}

function EventCard({ event, sportKey, config, bookmakerFilter }) {
  const h2h = event.markets.find((m) => m.key === 'h2h')
  const home = h2h?.outcomes.find((o) => o.name === 'Home')
  const away = h2h?.outcomes.find((o) => o.name === 'Away')
  const homeBest = home ? bestWithinFilter(home.allOdds, bookmakerFilter) : null
  const awayBest = away ? bestWithinFilter(away.allOdds, bookmakerFilter) : null
  const Photo = config.participantType === 'player' ? PlayerPhoto : TeamBadge
  const photoProp = config.participantType === 'player' ? 'name' : 'team'

  return (
    <Link className="race-card" to={`/odds/${sportKey}/${event.id}`}>
      <div className="race-card-time">
        <span className="off-time">{formatKickoff(event.kickoff)}</span>
        <span className="countdown">{formatCountdown(event.kickoff)}</span>
      </div>
      <div className="race-card-main">
        <div className="race-card-title fixture-teams-row">
          <span className="fixture-team">
            <Photo {...{ [photoProp]: event.participantA }} size={20} />
            <span>{event.participantA}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <Photo {...{ [photoProp]: event.participantB }} size={20} />
            <span>{event.participantB}</span>
          </span>
        </div>
        <div className="race-card-meta">{event.competition}</div>
      </div>
      <div className="race-card-fav">
        <div className="fav-label">Moneyline</div>
        <div className="fav-price">{homeBest ? homeBest.decimal.toFixed(2) : '-'}</div>
        <div className="fav-price-away">{awayBest ? awayBest.decimal.toFixed(2) : '-'}</div>
      </div>
    </Link>
  )
}
