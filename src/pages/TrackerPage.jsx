import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { checkAndSettleBets } from '../lib/settlement.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { getEachWayTerms, computeEachWayReturn } from '../utils/eachWay.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import {
  computeStats,
  computeStreak,
  computeBestWeek,
  computePerfectWeek,
  computeMilestoneBadges,
  computeLongestWinStreak,
  computeBestWin
} from '../utils/trackerStats.js'
import { computeDisciplineStreak } from '../utils/discipline.js'
import { findOnThisDayEntries } from '../utils/onThisDay.js'
import { SPORT_LABEL } from '../lib/sportsConfig.js'
import EmptyState from '../components/EmptyState.jsx'
import EditBetSheet from '../components/EditBetSheet.jsx'
import ManualEntrySheet from '../components/ManualEntrySheet.jsx'
import PnlChart from '../components/PnlChart.jsx'
import { trackerEntriesToCsv, downloadCsv } from '../lib/csvExport.js'
import PullToRefresh from '../components/PullToRefresh.jsx'
import ShareRecapButton from '../components/ShareRecapButton.jsx'
import ShareImageButton from '../components/ShareImageButton.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import LiveBadge from '../components/LiveBadge.jsx'
import { useLiveScores } from '../lib/liveScores.js'
import { betLineValue, beatTheLineRate } from '../utils/lineValue.js'
import { betClv, clvSummary } from '../utils/clv.js'

const STATUS_LABEL = { open: 'Pending', won: 'Won', lost: 'Lost', void: 'Void' }

export default function TrackerPage() {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const [entries, setEntries] = useState(null)
  // Server-recorded closing lines for the outcomes these bets reference, keyed
  // {eventId|marketKey|outcomeName} (see dataStore.getClosingLines). Feeds real
  // CLV; stays empty in local mode, where the Tracker falls back to line value.
  const [closes, setCloses] = useState({})
  const [checking, setChecking] = useState(false)
  const [rebetting, setRebetting] = useState(null)
  const [rebetDone, setRebetDone] = useState(null)
  const [editingEntry, setEditingEntry] = useState(null)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const runAsync = useAsyncAction()

  useEffect(() => {
    let cancelled = false
    // Settle whatever we can from final scores before the user has to
    // touch anything - only runs once per page visit, after the first
    // load, so it never fights with a manual status change mid-session.
    refresh().then(() => {
      if (cancelled) return
      setChecking(true)
      checkAndSettleBets(user.id)
        .then(({ settled }) => settled > 0 && !cancelled && refresh())
        .catch(() => {})
        .finally(() => !cancelled && setChecking(false))
    })
    return () => {
      cancelled = true
    }
  }, [])

  function refresh() {
    return Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      const combined = [
        ...posted.map((p) => ({ ...p, source: 'group' })),
        ...manual.map((m) => ({ ...m, source: 'manual' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setEntries(combined)
      // Pull the closing lines for every fixture these bets touch so single-leg
      // rows can show real CLV. Best-effort - a failure just leaves CLV absent.
      const fixtureIds = combined.flatMap((entry) => (entry.selections ?? []).map((s) => s.eventId)).filter(Boolean)
      dataStore.getClosingLines(fixtureIds).then(setCloses).catch(() => {})
    })
  }

  // "placed" isn't a real status column value (see supabase/schema.sql's
  // check constraint) - it's an each-way result where the horse placed but
  // didn't win, so it settles as 'won' but with potentialReturn corrected
  // down to just the place-part payout (see eachWay.js). The P&L math
  // already handles any potentialReturn < stake correctly as a net loss;
  // only "win streak"-style badges would (rarely) miscount this as a win.
  async function handleStatusChange(entry, status) {
    const ok = await runAsync(() => {
      if (status === 'placed') {
        const leg = entry.selections[0]
        const terms = { fraction: leg.eachWayFraction, places: leg.eachWayPlaces }
        const placeReturn = Math.round(computeEachWayReturn(entry.stake, leg.odds, terms, 'place') * 100) / 100
        return dataStore.updateManualEntryStatus(entry.id, 'won', placeReturn)
      }
      return dataStore.updateManualEntryStatus(entry.id, status)
    }, "Couldn't save that result - try again")
    if (ok) refresh()
  }

  // Repeats a past wager as a fresh open manual entry - the app never
  // places real bets (see the disclaimer on sign-up), so this just logs the
  // same selections/stake again rather than trying to re-fetch live odds
  // for a fixture that's often already kicked off or finished by now.
  async function handleRebet(entry) {
    setRebetting(entry.id)
    try {
      await dataStore.addManualEntry({
        userId: user.id,
        sport: entry.sport,
        marketType: entry.marketType,
        selections: entry.selections,
        stake: entry.stake,
        potentialReturn: entry.potentialReturn
      })
      await refresh()
      setRebetDone(entry.id)
      setTimeout(() => setRebetDone((id) => (id === entry.id ? null : id)), 2000)
    } finally {
      setRebetting(null)
    }
  }

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`betmates-tracker-${date}.csv`, trackerEntriesToCsv(entries))
  }

  const bySport = useMemo(() => {
    if (!entries) return []
    const groups = new Map()
    for (const entry of entries) {
      const key = entry.sport ?? 'football'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    return [...groups.entries()]
      .map(([sport, sportEntries]) => ({ sport, ...computeStats(sportEntries) }))
      .filter((row) => row.settledCount > 0)
      .sort((a, b) => b.profit - a.profit)
  }, [entries])

  const openEntries = useMemo(() => (entries ?? []).filter((e) => e.status === 'open'), [entries])
  const liveByEvent = useLiveScores(openEntries)
  const onThisDay = useMemo(() => (entries ? findOnThisDayEntries(entries) : []), [entries])

  if (entries === null) return <div className="loading">Tallying up your bets…</div>

  const stats = computeStats(entries)
  const streak = computeStreak(entries)
  const bestWeek = computeBestWeek(entries)
  const perfectWeek = computePerfectWeek(entries)
  const badges = [
    streak.count >= 2 && {
      icon: streak.type === 'won' ? '🔥' : '🥶',
      label: `${streak.count}-${streak.type === 'won' ? 'win' : 'loss'} streak`
    },
    bestWeek &&
      bestWeek.profit > 0 && {
        icon: '🏆',
        label: `Best week +£${bestWeek.profit.toFixed(2)} (${new Date(bestWeek.weekStart).toLocaleDateString([], { month: 'short', day: 'numeric' })})`
      },
    perfectWeek && {
      icon: '💯',
      label: `Perfect week, ${perfectWeek.count}-0 (${new Date(perfectWeek.weekStart).toLocaleDateString([], { month: 'short', day: 'numeric' })})`
    },
    ...computeMilestoneBadges(entries),
    (() => {
      // Prefer real Closing Line Value once snapshots exist; otherwise fall back
      // to the device-local "beat the line" rate.
      const clv = clvSummary(entries, closes)
      if (clv) return { icon: '🎯', label: `Closing line value ${clv.avgPct >= 0 ? '+' : ''}${clv.avgPct}% (${clv.sample})` }
      const lv = beatTheLineRate(entries)
      return lv && { icon: '📈', label: `Beat the line ${lv.rate}% (${lv.sample})` }
    })(),
    (() => {
      // The positive twin of the loss-chasing nudge (BetBuilderSheet/
      // ManualEntrySheet) - only worth showing once there's been an actual
      // loss to chase, so a brand-new account with zero losses doesn't get
      // credited for discipline it's never been tested on.
      const disciplineStreak = computeDisciplineStreak(entries)
      const hasLoss = entries.some((e) => e.status === 'lost')
      return hasLoss && disciplineStreak >= 3 && { icon: '🧊', label: `${disciplineStreak} bets without chasing a loss` }
    })()
  ].filter(Boolean)

  const longestStreak = computeLongestWinStreak(entries)
  const bestWin = computeBestWin(entries)
  const recapRows = [
    { label: 'Bets logged', value: String(entries.length) },
    { label: 'Staked', value: `£${stats.staked.toFixed(2)}` },
    { label: 'Profit', value: `${stats.profit >= 0 ? '+' : ''}£${stats.profit.toFixed(2)}`, tone: stats.profit >= 0 ? 'good' : 'bad' },
    { label: 'Win rate', value: stats.winRate === null ? '-' : `${stats.winRate}%` },
    { label: 'Longest streak', value: longestStreak ? `${longestStreak} wins` : '-' },
    { label: 'Best win', value: bestWin ? `+£${bestWin.profit.toFixed(2)}` : '-' }
  ]

  return (
    <PullToRefresh onRefresh={refresh}>
      <SportHeroBanner sport="tracker" />
      <div className="topbar">
        <div className="topbar-row">
          <h1>Tracker</h1>
          <div className="topbar-actions">
            {entries.length > 0 && <ShareRecapButton rows={recapRows} periodLabel="all-time" />}
            {entries.length > 0 && (
              <button className="btn btn-ghost btn-small" onClick={handleExport}>
                Export CSV
              </button>
            )}
            <button className="btn btn-secondary btn-small" onClick={() => setShowAddEntry(true)}>
              Log a bet
            </button>
          </div>
        </div>
        {checking && <span className="tracker-checking">Checking latest results…</span>}
      </div>

      <div className="scoreboard-panel">
        <div>
          <p className="scoreboard-headline-label">All-time P&amp;L</p>
          <div className={`scoreboard-headline-value ${stats.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
            {stats.profit >= 0 ? '+' : ''}£{stats.profit.toFixed(2)}
          </div>
        </div>
        <div className="scoreboard-side-stats tracker-scoreboard-stats">
          <div>
            <div className={`scoreboard-side-stat-value ${stats.roi === null ? '' : stats.roi >= 0 ? 'tone-good' : 'tone-bad'}`}>
              {stats.roi === null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}%`}
            </div>
            <div className="scoreboard-side-stat-label">ROI</div>
          </div>
          <div>
            <div className="scoreboard-side-stat-value">{stats.winRate === null ? '-' : `${stats.winRate}%`}</div>
            <div className="scoreboard-side-stat-label">Win rate</div>
          </div>
          <div>
            <div className="scoreboard-side-stat-value">£{stats.staked.toFixed(2)}</div>
            <div className="scoreboard-side-stat-label">Staked</div>
          </div>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="badge-row">
          {badges.map((b) => (
            <span key={b.label} className="badge">
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="tracker-links-row">
        <Link to="/achievements" className="back achievements-link">
          View all achievements &rarr;
        </Link>
        <Link to="/insights" className="back achievements-link">
          Your insights &rarr;
        </Link>
      </div>

      {onThisDay.length > 0 && (
        <div className="account-section">
          <h2 className="market-title">📅 On this day</h2>
          <div className="docket-list">
            {onThisDay.slice(0, 3).map((entry) => (
              <div key={entry.id} className="docket">
                <div className="docket-main">
                  <div className="docket-event">
                    <SportIcon sport={entry.sport} /> {entry.selections?.[0]?.event ?? 'Bet'}
                  </div>
                  <div className="docket-meta">
                    {new Date(entry.createdAt).getFullYear()} · {entry.selections?.[0]?.selection} @{' '}
                    {formatOdds(entry.selections?.[0]?.odds, format)}
                  </div>
                </div>
                <span className={`bet-status-pill status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PnlChart entries={entries} />

      {bySport.length > 1 && (
        <>
          <h2 className="tracker-section-title">Sport breakdown</h2>
          <div className="sport-breakdown">
            {bySport.map((row, i) => (
              <div key={row.sport} className="sport-breakdown-row">
                <span className="sport-breakdown-rank">{i + 1}</span>
                <span className="sport-breakdown-icon">
                  <SportIcon sport={row.sport} />
                </span>
                <span className="sport-breakdown-name">{SPORT_LABEL[row.sport] ?? row.sport}</span>
                <span className={`sport-breakdown-pnl ${row.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                  {row.profit >= 0 ? '+' : ''}£{row.profit.toFixed(2)}
                </span>
                <span className="sport-breakdown-meta">{row.winRate === null ? '-' : `${row.winRate}% WR`}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!entries.length && (
        <EmptyState
          icon="📊"
          title="Nothing logged yet"
          subtitle="Post a bet to a group, save one privately from the Odds tab, or log a bet from elsewhere with the button above."
        />
      )}

      {entries.length > 0 && (
        <>
          <h2 className="tracker-section-title">Bet history</h2>
          <div className="tracker-list">
          {entries.map((entry) => {
            const selections = entry.selections
            const combinedOdds = selections.length > 1 ? selections.reduce((acc, s) => acc * s.odds, 1) : null
            const lineValue = betLineValue(entry)
            const clv = betClv(entry, closes)
            return (
              <div key={entry.id} className={`tracker-row status-${entry.status}`}>
                <div className="tracker-row-main">
                  {selections.length > 1 && <div className="bet-card-leg-count">{selections.length}-leg bet builder</div>}
                  {selections.map((selection, i) => {
                    const live = entry.status === 'open' ? liveByEvent.get(selection.event) : null
                    return (
                      <div key={i}>
                        <div className="selection-event">
                          {selection.event}
                          {live && <LiveScoreTag game={live} />}
                        </div>
                        <div className="race-card-meta">
                          {selection.market}: {selection.selection} @ {formatOdds(selection.odds, format)} ({selection.bookmaker})
                        </div>
                      </div>
                    )
                  })}
                  {combinedOdds && (
                    <div className="race-card-meta">
                      Combined odds: <strong>{formatOdds(combinedOdds, format)}</strong>
                    </div>
                  )}
                  {entry.stake ? (
                    <div className="race-card-meta">
                      £{entry.stake} staked{entry.potentialReturn ? ` · returns £${Number(entry.potentialReturn).toFixed(2)}` : ''}
                    </div>
                  ) : null}
                  {clv ? <ClvTag clv={clv} /> : lineValue ? <LineValueTag lv={lineValue} /> : null}
                </div>
                <div className="tracker-row-status">
                  {entry.source === 'manual' && entry.status === 'open' ? (
                    <select className="status-select" defaultValue="open" onChange={(e) => handleStatusChange(entry, e.target.value)}>
                      <option value="open">Mark result</option>
                      <option value="won">Won</option>
                      {entry.selections.length === 1 && entry.selections[0].eachWay && <option value="placed">Placed (not won)</option>}
                      <option value="lost">Lost</option>
                      <option value="void">Void</option>
                    </select>
                  ) : (
                    <span className={`bet-status-pill status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                  )}
                  {entry.status === 'open' && (
                    <button className="btn btn-ghost btn-small" onClick={() => setEditingEntry(entry)}>
                      Edit
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => handleRebet(entry)}
                    disabled={rebetting === entry.id}
                  >
                    {rebetDone === entry.id ? 'Logged ✓' : rebetting === entry.id ? 'Adding…' : 'Bet again'}
                  </button>
                  <ShareImageButton post={entry} />
                </div>
              </div>
            )
          })}
          </div>
        </>
      )}

      {editingEntry && (
        <EditBetSheet
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onUpdated={refresh}
          onDeleted={refresh}
        />
      )}

      {showAddEntry && (
        <ManualEntrySheet userId={user.id} onClose={() => setShowAddEntry(false)} onSaved={refresh} />
      )}
    </PullToRefresh>
  )
}

// The in-play score for a leg whose game is live right now. Names the score
// to each side rather than assuming array order, since betEvaluation reads
// scores by team name too and a feed needn't return home-first.
// "You beat the line" indicator for a single-leg bet - your price vs the
// latest price this device saw for that outcome (see src/utils/lineValue.js).
function LineValueTag({ lv }) {
  const pct = Math.abs(lv.deltaPct)
  if (pct < 0.5) return null // effectively no movement - not worth a badge
  return (
    <div className={`line-value ${lv.beat ? 'line-value-good' : 'line-value-bad'}`}>
      {lv.beat ? '📈 Beat the line' : '📉 Below the line'} by {pct.toFixed(1)}%
      <span className="line-value-detail">
        {' '}
        (you {lv.bet.toFixed(2)} vs {lv.line.toFixed(2)})
      </span>
    </div>
  )
}

// Real Closing Line Value for a single-leg bet - the struck price vs the
// market's server-recorded closing line (src/utils/clv.js). Shown in place of
// LineValueTag's device-local approximation whenever a true close was recorded,
// so it reuses the same .line-value styling.
function ClvTag({ clv }) {
  const pct = Math.abs(clv.deltaPct)
  if (pct < 0.5) return null // effectively the close - not worth a badge
  return (
    <div className={`line-value ${clv.beat ? 'line-value-good' : 'line-value-bad'}`}>
      {clv.beat ? '🎯 Beat the close' : '🎯 Below the close'} by {pct.toFixed(1)}%
      <span className="line-value-detail">
        {' '}
        (you {clv.bet.toFixed(2)} vs close {clv.close.toFixed(2)})
      </span>
    </div>
  )
}

function LiveScoreTag({ game }) {
  const home = game.scores?.find((s) => s.name === game.homeTeam)?.score
  const away = game.scores?.find((s) => s.name === game.awayTeam)?.score
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null
  return (
    <span className="live-score-tag">
      <LiveBadge />
      <span className="live-score">
        {home}&ndash;{away}
      </span>
    </span>
  )
}
