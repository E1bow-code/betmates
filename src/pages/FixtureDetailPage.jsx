import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CoachGptLink from '../components/CoachGptLink.jsx'
import { fetchFixture } from '../api/oddsClient.js'
import * as dataStore from '../lib/dataStore.js'
import { formatDateTime, formatCountdown } from '../utils/format.js'
import { bestWithinFilter } from '../utils/oddsUtils.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { isLive } from '../utils/liveStatus.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useOddsMovement, movementKey, useOddsHistory, historyKey } from '../lib/oddsMemory.js'
import { useBacking } from '../lib/backing.js'
import TeamBadge from '../components/TeamBadge.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import OddsMoveIndicator from '../components/OddsMoveIndicator.jsx'
import SharpMoneyBadge from '../components/SharpMoneyBadge.jsx'
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
  const [expandedMarkets, setExpandedMarkets] = useState(new Set())
  const [profileTarget, setProfileTarget] = useState(null)
  // Server-recorded price history for this fixture - only has anything in
  // it if someone's followed it (see netlify/functions/odds-snapshot.js),
  // which is also the only case SharpMoneyBadge ever renders anything.
  const [snapshotSeries, setSnapshotSeries] = useState({})

  useEffect(() => {
    fetchFixture(id)
      .then(setFixture)
      .catch((err) => setError(err.message))
    dataStore.getOddsSnapshotSeries(id).then(setSnapshotSeries).catch(() => {})
  }, [id])

  // Every market used to render fully expanded, which turned a fixture
  // with goalscorer/alternate-totals markets into one long continuous
  // scroll - only the headline market (1X2/Moneyline, always first) opens
  // by default now; the rest are one tap away instead of always-on.
  useEffect(() => {
    if (fixture) setExpandedMarkets(new Set([fixture.markets[0]?.key]))
  }, [fixture?.id])

  function toggleMarket(key) {
    setExpandedMarkets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const movements = useOddsMovement(fixture)
  const histories = useOddsHistory(fixture)
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
      link: best.link,
      linkIsBetslip: best.isBetslipLink,
      sport: 'football',
      kickoff: fixture.kickoff,
      // Identity keys so the Tracker can match this leg back to the recorded
      // price history and show line value (see src/utils/lineValue.js).
      eventId: fixture.id,
      marketKey: market.key,
      outcomeName: outcome.name
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
            <TeamBadge team={fixture.homeTeam} sport="football" size={26} />
            <span>{fixture.homeTeam}</span>
            <FollowParticipantButton sport="football" name={fixture.homeTeam} />
          </span>
          <span className="fixture-vs">v</span>
          <span className="fixture-team">
            <TeamBadge team={fixture.awayTeam} sport="football" size={26} />
            <span>{fixture.awayTeam}</span>
            <FollowParticipantButton sport="football" name={fixture.awayTeam} />
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
        <CoachGptLink question={`What's the best bet for ${fixture.homeTeam} v ${fixture.awayTeam}?`} />
        {isLive(fixture.kickoff, 'football') && (
          <div className="race-header-live">
            <LiveBadge />
            <WatchLiveButton leagueKey={fixture.sportKey} participants={[fixture.homeTeam, fixture.awayTeam]} kickoff={fixture.kickoff} />
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
        <FixtureChatPanel sport="football" eventId={fixture.id} eventLabel={`${fixture.homeTeam} v ${fixture.awayTeam}`} />
      </div>

      {fixture.markets.map((market) => {
        const marketOpen = expandedMarkets.has(market.key)
        return (
        <div key={market.key} className="market-block">
          <button className="market-header" onClick={() => toggleMarket(market.key)} type="button" aria-expanded={marketOpen}>
            <h2 className="market-title">{market.label}</h2>
            <span className={marketOpen ? 'market-header-meta market-header-meta-open' : 'market-header-meta'}>
              {market.outcomes.length} {marketOpen ? '▴' : '▾'}
            </span>
          </button>
          {marketOpen && (
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
                    {PLAYER_MARKET_KEYS.includes(market.key) && (
                      <button
                        className="outcome-profile-btn"
                        type="button"
                        aria-label={`View ${outcome.name}'s profile`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setProfileTarget(outcome.name)
                        }}
                      >
                        <PlayerPhoto name={outcome.name} sport="football" size={30} />
                      </button>
                    )}
                    <button className="outcome-row-main" onClick={() => pick(market, outcome)} disabled={!best}>
                      <span className="outcome-name">
                        {PLAYER_MARKET_KEYS.includes(market.key) ? (
                          <span>{outcome.name}</span>
                        ) : outcome.name === 'Home' || outcome.name === 'Away' ? (
                          <span className="fixture-team">
                            <TeamBadge team={outcome.name === 'Home' ? fixture.homeTeam : fixture.awayTeam} sport="football" size={20} />
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
                          {!bookmakerFilter && <BestValueBadge allOdds={outcome.allOdds} />}
                          <SharpMoneyBadge series={snapshotSeries[`${market.key}|${outcome.name}`]} />
                          <Sparkline points={histories[historyKey(fixture.id, market.key, outcome.name)]} />
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
      {profileTarget && <ParticipantProfileSheet name={profileTarget} sport="football" onClose={() => setProfileTarget(null)} />}
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
