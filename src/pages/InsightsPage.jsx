import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeInsights } from '../utils/insights.js'
import { findBadBeats } from '../utils/badBeats.js'
import { formatOdds } from '../utils/oddsFormat.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import ShareRecapButton from '../components/ShareRecapButton.jsx'
import CoachTake from '../components/CoachTake.jsx'
import CrowdWisdomPanel from '../components/CrowdWisdomPanel.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function InsightsPage() {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const [entries, setEntries] = useState(null)
  // Server-recorded closing lines, keyed {eventId|marketKey|outcomeName}
  // (see dataStore.getClosingLines) - feeds the "beating the market" CLV
  // card; stays empty in local mode or before odds-snapshot.js has a close
  // for anything, same as TrackerPage.jsx's own fetch of this.
  const [closes, setCloses] = useState({})

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      const combined = [...posted, ...manual]
      setEntries(combined)
      const fixtureIds = combined.flatMap((entry) => (entry.selections ?? []).map((s) => s.eventId)).filter(Boolean)
      dataStore.getClosingLines(fixtureIds).then(setCloses).catch(() => {})
    })
  }, [user.id])

  if (entries === null) return <div className="loading">Digging through your betting history…</div>

  const insights = computeInsights(entries, closes)
  const rows = insights.map((i) => ({ label: i.title, value: i.value }))
  const badBeats = findBadBeats(entries, 5)

  return (
    <div>
      <SportHeroBanner sport="insights" />
      <div className="topbar">
        <Link to="/tracker" className="back">
          &larr; Tracker
        </Link>
        <h1>Your Insights</h1>
      </div>
      <p className="hint">Patterns from your own betting history - nothing here is a tip, just what's actually happened so far.</p>

      <CoachTake entries={entries} />

      {!insights.length && (
        <EmptyState icon="🔍" title="Not enough history yet" subtitle="Settle a few more bets and your patterns will start showing up here." />
      )}

      {insights.length > 0 && (
        <>
          <div className="tracker-list">
            {insights.map((i) => (
              <div key={i.key} className="tracker-row icon-row">
                <span className="icon-row-badge">{i.icon}</span>
                <div className="tracker-row-main">
                  <div className="selection-event">{i.title}</div>
                  <div className="race-card-meta">{i.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="account-section">
            <ShareRecapButton rows={rows} periodLabel="your insights" />
          </div>
        </>
      )}

      {badBeats.length > 0 && (
        <>
          <h3 className="market-title">Agony column</h3>
          <p className="hint">Multis that lost with just one leg wrong - the ones that got away.</p>
          <div className="tracker-list">
            {badBeats.map((b) => (
              <div key={b.id} className="tracker-row icon-row">
                <span className="icon-row-badge">💔</span>
                <div className="tracker-row-main">
                  <div className="selection-event">
                    {b.legCount - 1} of {b.legCount} legs came in
                  </div>
                  <div className="race-card-meta">
                    Missed: {b.missedLeg.selection} @ {formatOdds(b.missedLeg.odds, format)} ({b.missedLeg.event})
                  </div>
                  {b.wouldHaveReturned != null && (
                    <div className="race-card-meta">Would&apos;ve returned £{b.wouldHaveReturned.toFixed(2)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <CrowdWisdomPanel userId={user.id} />
    </div>
  )
}
