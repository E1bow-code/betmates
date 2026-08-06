import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchEvent } from '../api/genericSportsClient.js'
import { GENERIC_SPORTS } from '../lib/sportsConfig.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { isLive } from '../utils/liveStatus.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useOddsMovement, movementKey } from '../lib/oddsMemory.js'
import { useBacking } from '../lib/backing.js'
import TeamBadge from '../components/TeamBadge.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import LiveBadge from '../components/LiveBadge.jsx'
import WatchLiveButton from '../components/WatchLiveButton.jsx'
import OddsAlertSheet from '../components/OddsAlertSheet.jsx'
import FollowButton from '../components/FollowButton.jsx'
import FollowParticipantButton from '../components/FollowParticipantButton.jsx'
import ParticipantProfileSheet from '../components/ParticipantProfileSheet.jsx'

export default function GenericEventDetailPage() {
  const { sportKey, id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const { format } = useOddsFormat()
  const config = GENERIC_SPORTS[sportKey]
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [alertTarget, setAlertTarget] = useState(null)
  const [expandedOutcome, setExpandedOutcome] = useState(null)
  const [expandedMarkets, setExpandedMarkets] = useState(new Set())
  const [profileTarget, setProfileTarget] = useState(null)

  useEffect(() => {
    fetchEvent(sportKey, id)
      .then(setEvent)
      .catch((err) => setError(err.message))
  }, [sportKey, id])

  useEffect(() => {
    if (event) setExpandedMarkets(new Set([event.markets[0]?.key]))
  }, [event?.id])

  function toggleMarket(key) {
    setExpandedMarkets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const movements = useOddsMovement(event)
  const backing = useBacking(event ? `${event.participantA} v ${event.participantB}` : null, user.id)

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
      link: best.link,
      linkIsBetslip: best.isBetslipLink,
      sport: sportKey,
      kickoff: event.kickoff
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
            {config.participantType === 'player' ? (
              <button type="button" className="fixture-team-profile-btn" onClick={() => setProfileTarget(event.participantA)}>
                <Photo {...{ [photoProp]: event.participantA }} size={26} />
                <span>{event.participantA}</span>
              </button>
            ) : (
              <>
                <Photo {...{ [photoProp]: event.participantA }} size={26} />
                <span>{event.participantA}</span>
              </>
            )}
            <FollowParticipantButton sport={sportKey} name={event.participantA} />
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            {config.participantType === 'player' ? (
              <button type="button" className="fixture-team-profile-btn" onClick={() => setProfileTarget(event.participantB)}>
                <Photo {...{ [photoProp]: event.participantB }} size={26} />
                <span>{event.participantB}</span>
              </button>
            ) : (
              <>
                <Photo {...{ [photoProp]: event.participantB }} size={26} />
                <span>{event.participantB}</span>
              </>
            )}
            <FollowParticipantButton sport={sportKey} name={event.participantB} />
          </span>
        </h1>
        <div className="race-header-meta">
          {formatDateTime(event.kickoff)} ({formatCountdown(event.kickoff)}) · {event.competition}
        </div>
        <FollowButton
          sport={sportKey}
          eventId={event.id}
          eventLabel={`${event.participantA} v ${event.participantB}`}
          kickoff={event.kickoff}
        />
        {isLive(event.kickoff, sportKey) && (
          <div className="race-header-live">
            <LiveBadge />
            <WatchLiveButton leagueKey={sportKey} participants={[event.participantA, event.participantB]} kickoff={event.kickoff} />
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

      {!event.markets.length && (
        <div className="empty">No odds posted for this one yet — check back closer to kick-off.</div>
      )}

      {event.markets.map((market) => {
        const marketOpen = expandedMarkets.has(market.key)
        return (
        <div key={market.key} className="market-block">
          <button className="market-header" onClick={() => toggleMarket(market.key)} type="button" aria-expanded={marketOpen}>
            <h2 className="market-title">{market.label}</h2>
            <span className="market-header-meta">
              {market.outcomes.length} {marketOpen ? '▴' : '▾'}
            </span>
          </button>
          {marketOpen && (
          <div className="outcome-list">
            {market.outcomes.map((outcome) => {
              const best = bestWithinFilter(outcome.allOdds, bookmakerFilter)
              const name = nameFor(outcome.name)
              const selected =
                best && isSelected({ event: `${event.participantA} v ${event.participantB}`, market: market.label, selection: name })
              const backingCount = backing?.counts.get(name) ?? 0
              const outcomeKey = `${market.key}|${outcome.name}`
              const isExpanded = expandedOutcome === outcomeKey
              return (
                <div key={outcome.name} className={selected ? 'outcome-row is-selected' : 'outcome-row'}>
                  <div className="outcome-row-buttons">
                    <button className="outcome-row-main" onClick={() => pick(market, outcome)} disabled={!best}>
                      <span className="outcome-name">
                        {outcome.team ? (
                          <span className="fixture-team">
                            <Photo {...{ [photoProp]: outcome.team }} size={20} />
                            <span>{name}</span>
                          </span>
                        ) : (
                          name
                        )}
                        {backingCount > 0 && (
                          <span className="backing-badge">
                            🔥 {backingCount} backing
                          </span>
                        )}
                      </span>
                      {best ? (
                        <span className="outcome-odds">
                          <span className="best-price">
                            {formatOdds(best.decimal, format)}
                            <OddsMoveIndicator direction={movements[movementKey(event.id, market.key, outcome.name)]} />
                          </span>
                          <span className="best-bookmaker">{best.bookmaker}</span>
                        </span>
                      ) : (
                        <span className="outcome-odds outcome-odds-empty">No price for your bookies</span>
                      )}
                    </button>
                    {outcome.allOdds.length > 1 && (
                      <button
                        className="outcome-expand-btn"
                        type="button"
                        aria-label="Compare all bookmakers"
                        onClick={() => setExpandedOutcome(isExpanded ? null : outcomeKey)}
                      >
                        {outcome.allOdds.length} {isExpanded ? '▴' : '▾'}
                      </button>
                    )}
                    {best && (
                      <button
                        className="outcome-alert-btn"
                        type="button"
                        aria-label="Set a price alert"
                        onClick={() =>
                          setAlertTarget({
                            sport: sportKey,
                            eventId: event.id,
                            eventLabel: `${event.participantA} v ${event.participantB}`,
                            kickoff: event.kickoff,
                            marketKey: market.key,
                            marketLabel: market.label,
                            outcomeName: outcome.name,
                            selectionLabel: name,
                            currentDecimal: best.decimal
                          })
                        }
                      >
                        🔔
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="outcome-all-odds">
                      {outcome.allOdds.map((o) => (
                        <div key={o.bookmaker} className={o.bookmaker === best?.bookmaker ? 'odds-cell is-best' : 'odds-cell'}>
                          <span className="odds-bookmaker">{o.bookmaker}</span>
                          <span className="odds-price">{formatOdds(o.decimal, format)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
        )
      })}

      {alertTarget && <OddsAlertSheet target={alertTarget} onClose={() => setAlertTarget(null)} />}
      {profileTarget && <ParticipantProfileSheet name={profileTarget} onClose={() => setProfileTarget(null)} />}
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
