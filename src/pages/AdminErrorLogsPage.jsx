import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime } from '../utils/format.js'
import EmptyState from '../components/EmptyState.jsx'
import { CheckIcon } from '../components/icons/Icons.jsx'

// Companion to AdminReportsPage.jsx - same is_admin gating (client-side for
// UX, "admins read/delete error logs" RLS policies in schema.sql for the
// real enforcement), same report-list/report-card markup so this didn't
// need its own CSS. Fed by two writers sharing this one table: the client's
// own src/components/ErrorBoundary.jsx (a signed-in/out user's route crashed)
// and src/lib/logProviderError.js (a Netlify Function's odds/racing/scores
// provider degraded to mock/empty - see its own header comment), tagged
// route: "provider:<source>" so the two are easy to tell apart below.
export default function AdminErrorLogsPage() {
  const { user } = useAuth()
  const [logs, setLogs] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!user.isAdmin) return
    dataStore
      .listErrorLogs()
      .then(setLogs)
      .catch((err) => setError(err.message))
  }, [user.isAdmin])

  if (!user.isAdmin) return <Navigate to="/odds" replace />

  async function handleDismiss(id) {
    setBusyId(id)
    try {
      await dataStore.deleteErrorLog(id)
      setLogs((list) => list.filter((l) => l.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/account" className="back">
          &larr; Account
        </Link>
        <h1>Error logs</h1>
      </div>

      {error && <div className="error">Couldn't load error logs: {error}</div>}
      {!error && logs === null && <div className="loading">Loading error logs…</div>}
      {logs && !logs.length && (
        <EmptyState icon={<CheckIcon width={26} height={26} />} title="No errors logged" subtitle="Nothing's crashed for anyone recently." />
      )}

      {logs && logs.length > 0 && (
        <div className="report-list">
          {logs.map((log) => (
            <div key={log.id} className="report-card">
              <div className="report-card-meta">
                {formatRelativeTime(log.createdAt)} · {log.route || 'unknown route'} ·{' '}
                {log.userId ? 'signed in' : log.route?.startsWith('provider:') ? 'server' : 'signed out'}
              </div>
              <div className="report-card-title">{log.message}</div>
              {log.stack && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  style={{ marginBottom: 8 }}
                  onClick={() => setExpandedId((id) => (id === log.id ? null : log.id))}
                >
                  {expandedId === log.id ? 'Hide stack trace' : 'Show stack trace'}
                </button>
              )}
              {log.stack && expandedId === log.id && (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem', opacity: 0.8, marginBottom: 8 }}>
                  {log.stack}
                </pre>
              )}
              <div className="report-card-actions">
                <button className="btn btn-ghost btn-small" disabled={busyId === log.id} onClick={() => handleDismiss(log.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
