import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRace } from '../api/racingClient.js'
import { formatKickoff, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

export default function RaceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const [race, setRace] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [expandedRunner, setExpandedRunner] = useState(null)

  useEffect(() => {
    fetchRace(id)
      .then(setRace)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <ErrorState message={error} />
  if (!race) return <LoadingState />

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null
  const runners = [...race.runners].sort((a, b) => {
    const aBest = bestWithinFilter(a.allOdds, bookmakerFilter)
    const bBest = bestWithinFilter(b.allOdds, bookmakerFilter)
    return (aBest?.decimal ?? Infinity) - (bBest?.decimal ?? Infinity)
  })

  const raceEvent = `${race.course} ${formatKickoff(race.offTime)} · ${race.raceName}`

  function pick(runner, best) {
    toggleLeg({
      event: raceEvent,
      market: 'Win',
      selection: runner.name,
      odds: best.decimal,
      bookmaker: best.bookmaker,
      sport: 'racing'
    })
  }

  return (
    <div>
      <SportHeroBanner sport="racing" />
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Races
        </Link>
      </div>
      <div className="race-header">
        <h1>
          {race.course} · {race.raceName}
        </h1>
        <div className="race-header-meta">
          {formatKickoff(race.offTime)} ({formatCountdown(race.offTime)}) · {race.raceClass} · {race.distance} · {race.going}
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

      <div className="runner-list">
        {runners.map((runner) => {
          const best = bestWithinFilter(runner.allOdds, bookmakerFilter)
          const isExpanded = expandedRunner === runner.id
          const selected = best && isSelected({ event: raceEvent, market: 'Win', selection: runner.name })
          return (
            <div key={runner.id} className={isExpanded ? 'runner-row expanded' : 'runner-row'}>
              <div className="runner-summary" onClick={() => setExpandedRunner(isExpanded ? null : runner.id)}>
                <span className="runner-silk" style={{ background: runner.silkColor }}>
                  {runner.number}
                </span>
                <div className="runner-info">
                  <div className="runner-name">{runner.name}</div>
                  <div className="runner-connections">
                    {runner.jockey} · {runner.trainer}
                  </div>
                </div>
                {best ? (
                  <button
                    className={selected ? 'runner-best runner-best-btn is-selected' : 'runner-best runner-best-btn'}
                    onClick={(e) => {
                      e.stopPropagation()
                      pick(runner, best)
                    }}
                  >
                    <div className="best-price">{best.price}</div>
                    <div className="best-bookmaker">{best.bookmaker}</div>
                  </button>
                ) : (
                  <div className="runner-best">
                    <div className="best-bookmaker">No price</div>
                  </div>
                )}
              </div>
              <div className="runner-all-odds">
                {runner.allOdds.map((o) => (
                  <div key={o.bookmaker} className={o.bookmaker === best?.bookmaker ? 'odds-cell is-best' : 'odds-cell'}>
                    <span className="odds-bookmaker">{o.bookmaker}</span>
                    <span className="odds-price">{o.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div>
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Races
        </Link>
      </div>
      <div className="loading">Loading runners…</div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div>
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Races
        </Link>
      </div>
      <div className="error">Couldn't load race: {message}</div>
    </div>
  )
}
