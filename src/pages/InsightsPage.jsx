import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeInsights } from '../utils/insights.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import ShareRecapButton from '../components/ShareRecapButton.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function InsightsPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setEntries([...posted, ...manual])
    })
  }, [user.id])

  if (entries === null) return <div className="loading">Digging through your betting history…</div>

  const insights = computeInsights(entries)
  const rows = insights.map((i) => ({ label: i.title, value: i.value }))

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

      {!insights.length && (
        <EmptyState icon="🔍" title="Not enough history yet" subtitle="Settle a few more bets and your patterns will start showing up here." />
      )}

      {insights.length > 0 && (
        <>
          <div className="tracker-list">
            {insights.map((i) => (
              <div key={i.key} className="tracker-row">
                <div className="tracker-row-main">
                  <div className="selection-event">
                    {i.icon} {i.title}
                  </div>
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
    </div>
  )
}
