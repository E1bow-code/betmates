import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { checkAndSettleBets } from '../lib/settlement.js'
import { computeStats } from '../utils/trackerStats.js'
import { SPORT_LABEL, SPORT_ICON } from '../lib/sportsConfig.js'
import EmptyState from '../components/EmptyState.jsx'
import PnlChart from '../components/PnlChart.jsx'

const STATUS_LABEL = { open: 'Pending', won: 'Won', lost: 'Lost', void: 'Void' }

export default function TrackerPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)
  const [checking, setChecking] = useState(false)

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
    })
  }

  async function handleStatusChange(entry, status) {
    await dataStore.updateManualEntryStatus(entry.id, status)
    refresh()
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

  if (entries === null) return <div className="loading">Tallying up your bets…</div>

  const stats = computeStats(entries)

  return (
    <div>
      <div className="topbar">
        <h1>Tracker</h1>
        {checking && <span className="tracker-checking">Checking latest results…</span>}
      </div>

      <div className="stat-tiles">
        <StatTile label="P&L" value={`${stats.profit >= 0 ? '+' : ''}£${stats.profit.toFixed(2)}`} tone={stats.profit >= 0 ? 'good' : 'bad'} />
        <StatTile label="ROI" value={stats.roi === null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}%`} tone={stats.roi >= 0 ? 'good' : 'bad'} />
        <StatTile label="Win rate" value={stats.winRate === null ? '-' : `${stats.winRate}%`} />
        <StatTile label="Staked" value={`£${stats.staked.toFixed(2)}`} />
      </div>

      <PnlChart entries={entries} />

      {bySport.length > 1 && (
        <div className="sport-breakdown">
          {bySport.map((row) => (
            <div key={row.sport} className="sport-breakdown-row">
              <span className="sport-breakdown-icon">{SPORT_ICON[row.sport] ?? '🎟️'}</span>
              <span className="sport-breakdown-name">{SPORT_LABEL[row.sport] ?? row.sport}</span>
              <span className={`sport-breakdown-pnl ${row.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                {row.profit >= 0 ? '+' : ''}£{row.profit.toFixed(2)}
              </span>
              <span className="sport-breakdown-meta">{row.winRate === null ? '-' : `${row.winRate}% WR`}</span>
            </div>
          ))}
        </div>
      )}

      {!entries.length && (
        <EmptyState
          icon="📊"
          title="Nothing logged yet"
          subtitle="Post a bet to a group or save one privately from the Odds tab — it'll show up here."
        />
      )}

      {entries.length > 0 && (
        <div className="tracker-list">
          {entries.map((entry) => {
            const selections = entry.selections
            const combinedOdds = selections.length > 1 ? selections.reduce((acc, s) => acc * s.odds, 1) : null
            return (
              <div key={entry.id} className={`tracker-row status-${entry.status}`}>
                <div className="tracker-row-main">
                  {selections.length > 1 && <div className="bet-card-leg-count">{selections.length}-leg bet builder</div>}
                  {selections.map((selection, i) => (
                    <div key={i}>
                      <div className="selection-event">{selection.event}</div>
                      <div className="race-card-meta">
                        {selection.market}: {selection.selection} @ {selection.odds.toFixed(2)} ({selection.bookmaker})
                      </div>
                    </div>
                  ))}
                  {combinedOdds && (
                    <div className="race-card-meta">
                      Combined odds: <strong>{combinedOdds.toFixed(2)}</strong>
                    </div>
                  )}
                  {entry.stake ? (
                    <div className="race-card-meta">
                      £{entry.stake} staked{entry.potentialReturn ? ` · returns £${Number(entry.potentialReturn).toFixed(2)}` : ''}
                    </div>
                  ) : null}
                </div>
                <div className="tracker-row-status">
                  {entry.source === 'manual' && entry.status === 'open' ? (
                    <select className="status-select" defaultValue="open" onChange={(e) => handleStatusChange(entry, e.target.value)}>
                      <option value="open">Mark result</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="void">Void</option>
                    </select>
                  ) : (
                    <span className={`bet-status-pill status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, tone }) {
  return (
    <div className={`stat-tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}
