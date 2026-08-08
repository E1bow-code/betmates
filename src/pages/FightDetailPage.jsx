import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFight } from '../api/ufcClient.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { isLive } from '../utils/liveStatus.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useOddsMovement, movementKey, useOddsHistory, historyKey } from '../lib/oddsMemory.js'
import { useBacking } from '../lib/backing.js'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'
import BestValueBadge from '../components/BestValueBadge.jsx'
import Sparkline from '../components/Sparkline.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import LiveBadge from '../components/LiveBadge.jsx'
import WatchLiveButton from '../components/WatchLiveButton.jsx'
import OddsAlertSheet from '../components/OddsAlertSheet.jsx'
import FollowButton from '../components/FollowButton.jsx'
import FixtureChatPanel from '../components/FixtureChatPanel.jsx'
import FollowParticipantButton from '../components/FollowParticipantButton.jsx'
import ParticipantProfileSheet from '../components/ParticipantProfileSheet.jsx'

export default function FightDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toggleLeg, isSelected } = useBetSlip()
  const { format } = useOddsFormat()
  const [fight, setFight] = useState(null)
  const [error, setError] = useState(null)
  const [myBookiesOnly, setMyBookiesOnly] = useState(false)
  const [alertTarget, setAlertTarget] = useState(null)
  const [expandedOutcome, setExpandedOutcome] = useState(null)
  const [expandedMarkets, setExpandedMarkets] = useState(new Set())
  const [profileTarget, setProfileTarget] = useState(null)

  useEffect(() => {
    fetchFight(id)
      .then(setFight)
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    if (fight) setExpandedMarkets(new Set([fight.markets[0]?.key]))
  }, [fight?.id])

  function toggleMarket(key) {
    setExpandedMarkets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const movements = useOddsMovement(fight)
  const histories = useOddsHistory(fight)
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
      link: best.link,
      linkIsBetslip: best.isBetslipLink,
      sport: 'ufc',
      kickoff: fight.kickoff,
      eventId: fight.id,
      marketKey: market.key,
      outcomeName: outcome.name
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
            <button type="button" className="fixture-team-profile-btn" onClick={() => setProfileTarget(fight.fighterA)}>
              <PlayerPhoto name={fight.fighterA} size={26} />
              <span>{fight.fighterA}</span>
            </button>
            <FollowParticipantButton sport="ufc" name={fight.fighterA} />
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <button type="button" className="fixture-team-profile-btn" onClick={() => setProfileTarget(fight.fighterB)}>
              <PlayerPhoto name={fight.fighterB} size={26} />
              <span>{fight.fighterB}</span>
            </button>
            <FollowParticipantButton sport="ufc" name={fight.fighterB} />
          </span>
        </h1>
        <div className="race-header-meta">
          {formatDateTime(fight.kickoff)} ({formatCountdown(fight.kickoff)}) · {fight.competition}
        </div>
        <FollowButton sport="ufc" eventId={fight.id} eventLabel={`${fight.fighterA} v ${fight.fighterB}`} kickoff={fight.kickoff} />
        {isLive(fight.kickoff, 'ufc') && (
          <div className="race-header-live">
            <LiveBadge />
            <WatchLiveButton leagueKey="ufc" participants={[fight.fighterA, fight.fighterB]} kickoff={fight.kickoff} />
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
        <FixtureChatPanel sport="ufc" eventId={fight.id} eventLabel={`${fight.fighterA} v ${fight.fighterB}`} />
      </div>

      {!fight.markets.length && (
        <div className="empty">No odds posted for this fight yet — check back closer to fight night.</div>
      )}

      {fight.markets.map((market) => {
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
              const selected =
                best && isSelected({ event: `${fight.fighterA} v ${fight.fighterB}`, market: market.label, selection: outcome.name })
              const backingCount = backing?.counts.get(outcome.name) ?? 0
              const outcomeKey = `${market.key}|${outcome.name}`
              const isExpanded = expandedOutcome === outcomeKey
              return (
                <div key={outcome.name} className={selected ? 'outcome-row is-selected' : 'outcome-row'}>
                  <div className="outcome-row-buttons">
                    <button className="outcome-row-main" onClick={() => pick(market, outcome)} disabled={!best}>
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
                            {formatOdds(best.decimal, format)}
                            <OddsMoveIndicator direction={movements[movementKey(fight.id, market.key, outcome.name)]} />
                          </span>
                          <span className="best-bookmaker">{best.bookmaker}</span>
                          {!bookmakerFilter && <BestValueBadge allOdds={outcome.allOdds} />}
                          <Sparkline points={histories[historyKey(fight.id, market.key, outcome.name)]} />
                        </span>
                      ) : (
                        <span className="outcome-odds outcome-odds-empty">No price for your bookies</span>
                      )}
                    </button>
                    {best && (
                      <button
                        className="outcome-more-btn"
                        type="button"
                        aria-label={isExpanded ? 'Hide bookmaker comparison' : 'Compare bookmakers, set a price alert'}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedOutcome(isExpanded ? null : outcomeKey)}
                      >
                        {outcome.allOdds.length} {isExpanded ? '▴' : '▾'}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="outcome-panel">
                      <div className="outcome-all-odds">
                        {outcome.allOdds.map((o) => (
                          <div key={o.bookmaker} className={o.bookmaker === best?.bookmaker ? 'odds-cell is-best' : 'odds-cell'}>
                            <span className="odds-bookmaker">{o.bookmaker}</span>
                            <span className="odds-price">{formatOdds(o.decimal, format)}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        className="btn btn-ghost btn-small outcome-alert-link"
                        type="button"
                        onClick={() =>
                          setAlertTarget({
                            sport: 'ufc',
                            eventId: fight.id,
                            eventLabel: `${fight.fighterA} v ${fight.fighterB}`,
                            kickoff: fight.kickoff,
                            marketKey: market.key,
                            marketLabel: market.label,
                            outcomeName: outcome.name,
                            selectionLabel: outcome.name,
                            currentDecimal: best.decimal
                          })
                        }
                      >
                        🔔 Set a price alert
                      </button>
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
