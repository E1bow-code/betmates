import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFixture } from '../api/oddsClient.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { useAuth } from '../context/AuthContext.jsx'
import BetBuilderSheet from '../components/BetBuilderSheet.jsx'

export default function FixtureDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [fixture, setFixture] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [builderSelection, setBuilderSelection] = useState(null)

  useEffect(() => {
    fetchFixture(id)
      .then(setFixture)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <ErrorState message={error} />
  if (!fixture) return <LoadingState />

  const bookmakerFilter = myBookiesOnly ? user?.bookmakerPrefs ?? [] : null

  function openBuilder(market, outcome) {
    const best = bestWithinFilter(outcome.allOdds, bookmakerFilter) ?? outcome.bestOdds
    setBuilderSelection({
      event: `${fixture.homeTeam} v ${fixture.awayTeam}`,
      market: market.label,
      selection: outcome.name === 'Home' ? fixture.homeTeam : outcome.name === 'Away' ? fixture.awayTeam : outcome.name,
      odds: best.decimal,
      bookmaker: best.bookmaker
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
        <h1>
          {fixture.homeTeam} v {fixture.awayTeam}
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
              return (
                <button
                  key={outcome.name}
                  className="outcome-row"
                  onClick={() => openBuilder(market, outcome)}
                  disabled={!best}
                >
                  <span className="outcome-name">{outcome.name === 'Home' ? fixture.homeTeam : outcome.name === 'Away' ? fixture.awayTeam : outcome.name}</span>
                  {best ? (
                    <span className="outcome-odds">
                      <span className="best-price">{best.decimal.toFixed(2)}</span>
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

      {builderSelection && <BetBuilderSheet selection={builderSelection} sport="football" onClose={() => setBuilderSelection(null)} />}
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
