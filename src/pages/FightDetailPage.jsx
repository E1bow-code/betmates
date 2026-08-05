import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFight } from '../api/ufcClient.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsMovement, movementKey } from '../lib/oddsMemory.js'
import { useBacking } from '../lib/backing.js'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

export default function FightDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const [fight, setFight] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)

  useEffect(() => {
    fetchFight(id)
      .then(setFight)
      .catch((err) => setError(err.message))
  }, [id])

  const movements = useOddsMovement(fight)
  const backing = useBacking(fight ? `${fight.fighterA} v ${fight.fighterB}` : null, user.id)

  if (error) return <ErrorState message={error} />
  if (!fight) return <LoadingState />

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null

  function pick(market, outcome) {
    const best = bestWithinFilter(outcome.allOdds, bookmakerFilter) ?? outcome.bestOdds
    toggleLeg({
      event: `${fight.fighterA} v ${fight.fighterB}`,
      market: market.label,
      selection: outcome.name,
      odds: best.decimal,
      bookmaker: best.bookmaker,
      sport: 'ufc',
      kickoff: fight.kickoff
    })
  }

  return (
    <div>
      <SportHeroBanner sport="ufc" />
      <div className="topbar">
        <Link to="/odds" className="back">
          &larr; Fights
        </Link>
      </div>
      <div className="race-header">
        <h1 className="fixture-teams-row">
          <span className="fixture-team">
            <PlayerPhoto name={fight.fighterA} size={26} />
            <span>{fight.fighterA}</span>
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <PlayerPhoto name={fight.fighterB} size={26} />
            <span>{fight.fighterB}</span>
          </span>
        </h1>
        <div className="race-header-meta">
          {formatDateTime(fight.kickoff)} ({formatCountdown(fight.kickoff)}) · {fight.competition}
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
        <p className="hint">Tap more than one price to build an accumulator.</p>
      </div>

      {!fight.markets.length && (
        <div className="empty">No odds posted for this fight yet — check back closer to fight night.</div>
      )}

      {fight.markets.map((market) => (
        <div key={market.key} className="market-block">
          <h2 className="market-title">{market.label}</h2>
          <div className="outcome-list">
            {market.outcomes.map((outcome) => {
              const best = bestWithinFilter(outcome.allOdds, bookmakerFilter)
              const selected =
                best && isSelected({ event: `${fight.fighterA} v ${fight.fighterB}`, market: market.label, selection: outcome.name })
              const backingCount = backing?.counts.get(outcome.name) ?? 0
              return (
                <button
                  key={outcome.name}
                  className={selected ? 'outcome-row is-selected' : 'outcome-row'}
                  onClick={() => pick(market, outcome)}
                  disabled={!best}
                >
                  <span className="outcome-name">
                    <span className="fixture-team">
                      <PlayerPhoto name={outcome.name} size={22} />
                      <span>{outcome.name}</span>
                    </span>
                    {backingCount > 0 && (
                      <span className="backing-badge">
                        🔥 {backingCount} backing
                      </span>
                    )}
                  </span>
                  {best ? (
                    <span className="outcome-odds">
                      <span className="best-price">
                        {best.decimal.toFixed(2)}
                        <OddsMoveIndicator direction={movements[movementKey(fight.id, market.key, outcome.name)]} />
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
          &larr; Fights
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
          &larr; Fights
        </Link>
      </div>
      <div className="error">Couldn't load fight: {message}</div>
    </div>
  )
}
