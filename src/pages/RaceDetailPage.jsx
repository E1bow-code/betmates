import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRace } from '../api/racingClient.js'
import * as dataStore from '../lib/dataStore.js'
import { formatKickoff, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { isLive, hasFinished } from '../utils/liveStatus.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import LiveBadge from '../components/LiveBadge.jsx'
import WatchLiveButton from '../components/WatchLiveButton.jsx'
import WatchHighlightsButton from '../components/WatchHighlightsButton.jsx'
import FollowButton from '../components/FollowButton.jsx'
import RunnerForm from '../components/RunnerForm.jsx'
import RatingBar from '../components/RatingBar.jsx'
import { pickRatingMetric } from '../utils/ratingBar.js'
import CoachGptLink from '../components/CoachGptLink.jsx'
import SharpMoneyBadge from '../components/SharpMoneyBadge.jsx'
import { useMyBookiesOnly } from '../lib/useMyBookiesOnly.js'

// How many bookmaker prices to show under a tapped runner before the rest go
// behind a "show all" toggle. A busy UK race can list 25+ books at only two
// or three distinct prices - dumping every one made the tapped-open row a
// wall to scroll past. The list is sorted best-first, so the top few are the
// prices that actually matter.
const VISIBLE_ODDS = 6

export default function RaceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const { format } = useOddsFormat()
  const [race, setRace] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useMyBookiesOnly()
  const [expandedRunner, setExpandedRunner] = useState(null)
  // Reset when a different runner is opened, so every horse's price list
  // starts collapsed to its best few rather than inheriting the last one's
  // "show all" state.
  const [showAllOdds, setShowAllOdds] = useState(false)
  // Only has data if this race is followed - see FixtureDetailPage.jsx's
  // identical fetch for the full reasoning.
  const [snapshotSeries, setSnapshotSeries] = useState({})

  useEffect(() => {
    // Clear the previous race and guard the responses so an in-place id change
    // can't leave the old one on screen or let a stale response overwrite the
    // new one.
    let live = true
    setRace(null)
    fetchRace(id)
      .then((r) => live && setRace(r))
      .catch((err) => live && setError(err.message))
    dataStore
      .getOddsSnapshotSeries(id)
      .then((s) => live && setSnapshotSeries(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id])

  if (error) return <ErrorState message={error} />
  if (!race) return <LoadingState />

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null
  const runners = [...race.runners].sort((a, b) => {
    const aBest = bestWithinFilter(a.allOdds, bookmakerFilter)
    const bBest = bestWithinFilter(b.allOdds, bookmakerFilter)
    return (aBest?.decimal ?? Infinity) - (bBest?.decimal ?? Infinity)
  })

  // One rating metric for the whole race (a true speed figure if the feed has
  // it, otherwise Racing Post / official rating) - drives every runner's bar,
  // all scaled against the same yardstick. Null if the race carries nothing to
  // rate, in which case the bars and legend simply don't render.
  const ratingMetric = pickRatingMetric(race.runners)

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

  function toggleRunner(runnerId, isExpanded) {
    setExpandedRunner(isExpanded ? null : runnerId)
    setShowAllOdds(false)
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
        {isLive(race.offTime, 'racing') ? (
          <div className="race-header-live">
            <LiveBadge />
            <WatchLiveButton />
          </div>
        ) : (
          hasFinished(race.offTime, 'racing') && (
            <div className="race-header-live">
              <WatchHighlightsButton query={`${race.raceName} ${race.course} replay`} />
            </div>
          )
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
        {ratingMetric && (
          <p className="hint rating-bar-legend">
            <span className="rating-bar-legend-swatch" aria-hidden="true" /> {ratingMetric.label} bars show each horse's{' '}
            {ratingMetric.name} - longer is {ratingMetric.better}.
          </p>
        )}
        <p className="hint">Tap a horse for full form, or tap more than one price to build an accumulator.</p>
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
                onClick={() => toggleRunner(runner.id, isExpanded)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  toggleRunner(runner.id, isExpanded)
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
                  <RatingBar value={ratingMetric && runner[ratingMetric.key]} metric={ratingMetric} />
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
              {isExpanded && runner.allOdds.length > 0 && (
                <div className="runner-odds">
                  <div className="runner-odds-heading">Compare prices</div>
                  <div className="runner-all-odds">
                    {(showAllOdds ? runner.allOdds : runner.allOdds.slice(0, VISIBLE_ODDS)).map((o) => (
                      <div key={o.bookmaker} className={o.bookmaker === best?.bookmaker ? 'odds-cell is-best' : 'odds-cell'}>
                        <span className="odds-bookmaker">{o.bookmaker}</span>
                        <span className="odds-price">{formatOdds(o.decimal, format, o.price)}</span>
                      </div>
                    ))}
                  </div>
                  {runner.allOdds.length > VISIBLE_ODDS && (
                    <button type="button" className="runner-odds-more" onClick={() => setShowAllOdds((v) => !v)}>
                      {showAllOdds ? 'Show fewer' : `Show all ${runner.allOdds.length} prices`}
                    </button>
                  )}
                </div>
              )}
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
      <div className="loading">Lining up the runners…</div>
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
