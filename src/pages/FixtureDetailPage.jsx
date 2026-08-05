import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFixture } from '../api/oddsClient.js'
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

const PLAYER_MARKET_KEYS = ['player_goal_scorer_anytime', 'player_first_goal_scorer', 'player_last_goal_scorer']

export default function FixtureDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const { format } = useOddsFormat()
  const [fixture, setFixture] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [alertTarget, setAlertTarget] = useState(null)
  const [expandedOutcome, setExpandedOutcome] = useState(null)

  useEffect(() => {
    fetchFixture(id)
      .then(setFixture)
      .catch((err) => setError(err.message))
  }, [id])

  const movements = useOddsMovement(fixture)
  const backing = useBacking(fixture ? `${fixture.homeTeam} v ${fixture.awayTeam}` : null, user.id)

  if (error) return <ErrorState message={error} />
  if (!fixture) return <LoadingState />

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null

  function pick(market, outcome) {
    const best = bestWithinFilter(outcome.allOdds, bookmakerFilter) ?? outcome.bestOdds
    toggleLeg({
      event: `${fixture.homeTeam} v ${fixture.awayTeam}`,
      market: market.label,
      selection: outcome.name === 'Home' ? fixture.homeTeam : outcome.name === 'Away' ? fixture.awayTeam : outcome.name,
      odds: best.decimal,
      bookmaker: best.bookmaker,
      sport: 'football',
      kickoff: fixture.kickoff
    })
  }

  return (
    <div>
      <SportHeroBanner sport="football" />
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Fixtures
        </Link>
      </div>
      <div className="race-header">
        <h1 className="fixture-teams-row">
          <span className="fixture-team">
            <TeamBadge team={fixture.homeTeam} size={26} />
            <span>{fixture.homeTeam}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <TeamBadge team={fixture.awayTeam} size={26} />
            <span>{fixture.awayTeam}</span>
          </span>
        </h1>
        <div className="race-header-meta">
          {formatDateTime(fixture.kickoff)} ({formatCountdown(fixture.kickoff)}) · {fixture.competition}
        </div>
        <FollowButton
          sport="football"
          eventId={fixture.id}
          eventLabel={`${fixture.homeTeam} v ${fixture.awayTeam}`}
          kickoff={fixture.kickoff}
        />
        {isLive(fixture.kickoff, 'football') && (
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

      {fixture.markets.map((market) => (
        <div key={market.key} className="market-block">
          <h2 className="market-title">{market.label}</h2>
          <div className="outcome-list">
            {market.outcomes.map((outcome) => {
              const best = bestWithinFilter(outcome.allOdds, bookmakerFilter)
              const resolvedSelection = outcome.name === 'Home' ? fixture.homeTeam : outcome.name === 'Away' ? fixture.awayTeam : outcome.name
              const selected =
                best &&
                isSelected({
                  event: `${fixture.homeTeam} v ${fixture.awayTeam}`,
                  market: market.label,
                  selection: resolvedSelection
                })
              const backingCount = backing?.counts.get(resolvedSelection) ?? 0
              const outcomeKey = `${market.key}|${outcome.name}`
              const isExpanded = expandedOutcome === outcomeKey
              return (
                <div key={outcome.name} className={selected ? 'outcome-row is-selected' : 'outcome-row'}>
                  <div className="outcome-row-buttons">
                    <button className="outcome-row-main" onClick={() => pick(market, outcome)} disabled={!best}>
                      <span className="outcome-name">
                        {PLAYER_MARKET_KEYS.includes(market.key) ? (
                          <span className="fixture-team">
                            <PlayerPhoto name={outcome.name} size={26} />
                            <span>{outcome.name}</span>
                          </span>
                        ) : outcome.name === 'Home' || outcome.name === 'Away' ? (
                          <span className="fixture-team">
                            <TeamBadge team={outcome.name === 'Home' ? fixture.homeTeam : fixture.awayTeam} size={20} />
                            <span>{outcome.name === 'Home' ? fixture.homeTeam : fixture.awayTeam}</span>
                          </span>
                        ) : (
                          outcome.name
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
                            <OddsMoveIndicator direction={movements[movementKey(fixture.id, market.key, outcome.name)]} />
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
                            sport: 'football',
                            eventId: fixture.id,
                            eventLabel: `${fixture.homeTeam} v ${fixture.awayTeam}`,
                            kickoff: fixture.kickoff,
                            marketKey: market.key,
                            marketLabel: market.label,
                            outcomeName: outcome.name,
                            selectionLabel: resolvedSelection,
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
        </div>
      ))}

      {alertTarget && <OddsAlertSheet target={alertTarget} onClose={() => setAlertTarget(null)} />}
    </div>
  )
}

function LoadingState() {
  return (
    <div>
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Fixtures
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
          &larr; Fixtures
        </Link>
      </div>
      <div className="error">Couldn't load fixture: {message}</div>
    </div>
  )
}
