import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import EmptyState from '../components/EmptyState.jsx'
import UserLink from '../components/UserLink.jsx'
import { CheckIcon } from '../components/icons/Icons.jsx'

// Gated on profiles.is_admin (see schema.sql) - this project has one
// operator, not a team with roles, so a single boolean flag is enough.
// The redirect below is just UX; the real enforcement is the "admins
// read/dismiss/remove" RLS policies, since a client-side check alone would
// let anyone who edited the JS bundle see other people's reports.
export default function AdminReportsPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!user.isAdmin) return
    dataStore
      .listAllReports()
      .then(setReports)
      .catch((err) => setError(err.message))
  }, [user.isAdmin])

  const grouped = useMemo(() => {
    if (!reports) return null
    const byPost = new Map()
    for (const r of reports) {
      if (!byPost.has(r.postId)) byPost.set(r.postId, { post: r.post, reasons: [], reporterNames: [] })
      const g = byPost.get(r.postId)
      g.reasons.push(r.reason)
      g.reporterNames.push(r.reporterName)
    }
    return [...byPost.values()].sort((a, b) => b.reasons.length - a.reasons.length)
  }, [reports])

  if (!user.isAdmin) return <Navigate to="/odds" replace />

  async function handleDismiss(postId) {
    setBusyId(postId)
    try {
      await dataStore.dismissReportsForPost(postId)
      setReports((list) => list.filter((r) => r.postId !== postId))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(postId) {
    if (!window.confirm('Remove this post? This deletes it for everyone and clears its reports.')) return
    setBusyId(postId)
    try {
      await dataStore.removePost(postId)
      setReports((list) => list.filter((r) => r.postId !== postId))
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
        <h1>Reported posts</h1>
      </div>

      {error && <div className="error">Couldn't load reports: {error}</div>}
      {!error && grouped === null && <div className="loading">Loading reports…</div>}
      {grouped && !grouped.length && (
        <EmptyState icon={<CheckIcon width={26} height={26} />} title="Nothing reported" subtitle="No open reports on the public feed right now." />
      )}

      {grouped && grouped.length > 0 && (
        <div className="report-list">
          {grouped.map((g) => (
            <div key={g.post.id} className="report-card">
              <div className="report-card-meta">
                {g.reasons.length} report{g.reasons.length > 1 ? 's' : ''} · {[...new Set(g.reasons)].join(', ')}
              </div>
              <div className="report-card-title">{g.post.event}</div>
              <div className="hint" style={{ padding: 0, marginBottom: 10 }}>
                Posted by <UserLink id={g.post.userId} displayName={g.post.authorName} />
                {g.post.stake ? ` · £${g.post.stake} staked` : ''} · reported by {[...new Set(g.reporterNames)].join(', ')}
              </div>
              <div className="report-card-actions">
                <button className="btn btn-ghost btn-small" disabled={busyId === g.post.id} onClick={() => handleDismiss(g.post.id)}>
                  Dismiss
                </button>
                <button className="btn btn-danger btn-small" disabled={busyId === g.post.id} onClick={() => handleRemove(g.post.id)}>
                  Remove post
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
