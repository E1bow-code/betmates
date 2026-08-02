import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFixture } from '../api/oddsClient.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsMovement, movementKey } from '../lib/oddsMemory.js'
import TeamBadge from '../components/TeamBadge.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'

const PLAYER_MARKET_KEYS = ['player_goal_scorer_anytime', 'player_first_goal_scorer', 'player_last_goal_scorer']

export default function FixtureDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const [fixture, setFixture] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)

  useEffect(() => {
    fetchFixture(id)
      .then(setFixture)
      .catch((err) => setError(err.message))
  }, [id])

  const movements = useOddsMovement(fixture)

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
      sport: 'football'
    })
  }

  return (
    <div>
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

      {fixture.markets.map((market) => (
        <div key={market.key} className="market-block">
          <h2 className="market-title">{market.label}</h2>
          <div className="outcome-list">
            {market.outcomes.map((outcome) => {
              const best = bestWithinFilter(outcome.allOdds, bookmakerFilter)
              const selected =
                best &&
                isSelected({
                  event: `${fixture.homeTeam} v ${fixture.awayTeam}`,
                  market: market.label,
                  selection: outcome.name === 'Home' ? fixture.homeTeam : outcome.name === 'Away' ? fixture.awayTeam : outcome.name
                })
              return (
                <button
                  key={outcome.name}
                  className={selected ? 'outcome-row is-selected' : 'outcome-row'}
                  onClick={() => pick(market, outcome)}
                  disabled={!best}
                >
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
                  </span>
                  {best ? (
                    <span className="outcome-odds">
                      <span className="best-price">
                        {best.decimal.toFixed(2)}
                        <OddsMoveIndicator direction={movements[movementKey(fixture.id, market.key, outcome.name)]} />
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
