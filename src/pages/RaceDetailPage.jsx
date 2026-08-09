import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRace } from '../api/racingClient.js'
import * as dataStore from '../lib/dataStore.js'
import { formatKickoff, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { isLive } from '../utils/liveStatus.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import LiveBadge from '../components/LiveBadge.jsx'
import WatchLiveButton from '../components/WatchLiveButton.jsx'
import FollowButton from '../components/FollowButton.jsx'
import RunnerForm from '../components/RunnerForm.jsx'
import CoachGptLink from '../components/CoachGptLink.jsx'
import SharpMoneyBadge from '../components/SharpMoneyBadge.jsx'

export default function RaceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const { format } = useOddsFormat()
  const [race, setRace] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [expandedRunner, setExpandedRunner] = useState(null)
  // Only has data if this race is followed - see FixtureDetailPage.jsx's
  // identical fetch for the full reasoning.
  const [snapshotSeries, setSnapshotSeries] = useState({})

  useEffect(() => {
    fetchRace(id)
      .then(setRace)
      .catch((err) => setError(err.message))
    dataStore.getOddsSnapshotSeries(id).then(setSnapshotSeries).catch(() => {})
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
      sport: 'racing',
      kickoff: race.offTime,
      runnerCount: race.runners.length,
      raceId: race.id,
      horseId: runner.id,
      // Same identity-key convention FixtureDetailPage.jsx/FightDetailPage.jsx/
      // GenericEventDetailPage.jsx already stamp, so netlify/functions/
      // odds-snapshot.js can record a real closing line for racing bets too
      // (see that file's collectRacingSnapshots) - without these, racing
      // legs silently never qualified for Closing Line Value, only the
      // device-local line-value fallback.
      eventId: race.id,
      marketKey: 'win',
      outcomeName: runner.name
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
        <FollowButton sport="racing" eventId={race.id} eventLabel={`${race.course} · ${race.raceName}`} kickoff={race.offTime} />
        <CoachGptLink question={`What's the best value in the ${race.raceName} at ${race.course}?`} />
        {isLive(race.offTime, 'racing') && (
          <div className="race-header-live">
            <LiveBadge />
            <WatchLiveButton />
          </div>
        )}
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={myBookiesOnly}
            onChange={(e) => setMyBookiesOnly(e.target.checked)}
            disabled={!user?.bookmakerPrefs?.length}
          />
          <span>My bookies only</span>
        </label>
        <p className="hint">Tap more than one price to build an accumulator.</p>
      </div>

      <div className="runner-list">
        {runners.map((runner) => {
          const best = bestWithinFilter(runner.allOdds, bookmakerFilter)
          const isExpanded = expandedRunner === runner.id
          const selected = best && isSelected({ event: raceEvent, market: 'Win', selection: runner.name })
          return (
            <div key={runner.id} className={isExpanded ? 'runner-row expanded' : 'runner-row'}>
              <div
                className="runner-summary"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => setExpandedRunner(isExpanded ? null : runner.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  setExpandedRunner(isExpanded ? null : runner.id)
                }}
              >
                <span className="runner-silk" style={{ background: runner.silkColor }}>
                  {runner.number}
                </span>
                <div className="runner-info">
                  <div className="runner-name">{runner.name}</div>
                  <div className="runner-connections">
                    {runner.jockey} · {runner.trainer}
                    {runner.form && <span className="runner-form-inline"> · Form {runner.form}</span>}
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
                    <div className="best-price">{formatOdds(best.decimal, format, best.price)}</div>
                    <div className="best-bookmaker">{best.bookmaker}</div>
                    <SharpMoneyBadge series={snapshotSeries[`win|${runner.name}`]} />
                  </button>
                ) : (
                  <div className="runner-best">
                    <div className="best-bookmaker">No price</div>
                  </div>
                )}
              </div>
              <RunnerForm runner={runner} />
              <div className="runner-all-odds">
                {runner.allOdds.map((o) => (
                  <div key={o.bookmaker} className={o.bookmaker === best?.bookmaker ? 'odds-cell is-best' : 'odds-cell'}>
                    <span className="odds-bookmaker">{o.bookmaker}</span>
                    <span className="odds-price">{formatOdds(o.decimal, format, o.price)}</span>
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
