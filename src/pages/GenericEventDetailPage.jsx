import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchEvent } from '../api/genericSportsClient.js'
import { GENERIC_SPORTS } from '../lib/sportsConfig.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsMovement, movementKey } from '../lib/oddsMemory.js'
import TeamBadge from '../components/TeamBadge.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

export default function GenericEventDetailPage() {
  const { sportKey, id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const config = GENERIC_SPORTS[sportKey]
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)

  useEffect(() => {
    fetchEvent(sportKey, id)
      .then(setEvent)
      .catch((err) => setError(err.message))
  }, [sportKey, id])

  const movements = useOddsMovement(event)

  if (error) return <ErrorState message={error} />
  if (!event) return <LoadingState />

  const Photo = config.participantType === 'player' ? PlayerPhoto : TeamBadge
  const photoProp = config.participantType === 'player' ? 'name' : 'team'
  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null

  function nameFor(outcomeName) {
    if (outcomeName === 'Home') return event.participantA
    if (outcomeName === 'Away') return event.participantB
    return outcomeName
  }

  function pick(market, outcome) {
    const best = bestWithinFilter(outcome.allOdds, bookmakerFilter) ?? outcome.bestOdds
    toggleLeg({
      event: `${event.participantA} v ${event.participantB}`,
      market: market.label,
      selection: nameFor(outcome.name),
      odds: best.decimal,
      bookmaker: best.bookmaker,
      sport: sportKey
    })
  }

  return (
    <div>
      <SportHeroBanner sport={sportKey} />
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; {config.label}
        </Link>
      </div>
      <div className="race-header">
        <h1 className="fixture-teams-row">
          <span className="fixture-team">
            <Photo {...{ [photoProp]: event.participantA }} size={26} />
            <span>{event.participantA}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <Photo {...{ [photoProp]: event.participantB }} size={26} />
            <span>{event.participantB}</span>
          </span>
        </h1>
        <div className="race-header-meta">
          {formatDateTime(event.kickoff)} ({formatCountdown(event.kickoff)}) · {event.competition}
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

      {!event.markets.length && (
        <div className="empty">No odds posted for this one yet — check back closer to kick-off.</div>
      )}

      {event.markets.map((market) => (
        <div key={market.key} className="market-block">
          <h2 className="market-title">{market.label}</h2>
          <div className="outcome-list">
            {market.outcomes.map((outcome) => {
              const best = bestWithinFilter(outcome.allOdds, bookmakerFilter)
              const name = nameFor(outcome.name)
              const selected =
                best && isSelected({ event: `${event.participantA} v ${event.participantB}`, market: market.label, selection: name })
              return (
                <button
                  key={outcome.name}
                  className={selected ? 'outcome-row is-selected' : 'outcome-row'}
                  onClick={() => pick(market, outcome)}
                  disabled={!best}
                >
                  <span className="outcome-name">
                    {outcome.team ? (
                      <span className="fixture-team">
                        <Photo {...{ [photoProp]: name }} size={20} />
                        <span>{name}</span>
                      </span>
                    ) : (
                      name
                    )}
                  </span>
                  {best ? (
                    <span className="outcome-odds">
                      <span className="best-price">
                        {best.decimal.toFixed(2)}
                        <OddsMoveIndicator direction={movements[movementKey(event.id, market.key, outcome.name)]} />
                      </span>
                      <span className="best-bookmaker">{best.bookmaker}</span>
                    </span>
                  ) : (
                    <span className="outcome-odds outcome-odds-empty">No price for your bookies</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadingState() {
  return (
    <div>
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Odds
        </Link>
      </div>
      <div className="loading">Loading odds…</div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div>
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Odds
        </Link>
      </div>
      <div className="error">Couldn't load this one: {message}</div>
    </div>
  )
}
