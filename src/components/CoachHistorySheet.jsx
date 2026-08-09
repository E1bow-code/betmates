import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime } from '../utils/format.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'

// "New chat" clears CoachGptPage's active view but never deletes anything
// (see supabase/schema.sql's coach_messages.session_id comment) - this is
// where those earlier conversations stay reachable. Reuses .conversation-row
// (MessagesInboxPage.jsx's DM-thread list shape) as a button instead of a
// Link, since picking one switches the active session in place rather than
// navigating anywhere.
export default function CoachHistorySheet({ userId, activeSessionId, onSelect, onClose }) {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  useEscapeKey(onClose, true)

  useEffect(() => {
    dataStore
      .listCoachSessions(userId)
      .then(setSessions)
      .catch((err) => setError(err.message))
  }, [userId])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Past conversations</h2>
        {error && <div className="error">Couldn't load your history: {error}</div>}
        {!error && sessions === null && <div className="loading">Loading…</div>}
        {sessions && !sessions.length && <p className="hint">No earlier conversations yet.</p>}
        {sessions && sessions.length > 0 && (
          <div className="conversation-list">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                className={s.sessionId === activeSessionId ? 'conversation-row conversation-row-active' : 'conversation-row'}
                onClick={() => onSelect(s.sessionId)}
              >
                <span className="avatar conversation-row-coach-avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                  🧠
                </span>
                <div className="conversation-row-main">
                  <div className="conversation-row-name">{s.title}</div>
                  <div className="conversation-row-preview">
                    {s.messageCount} message{s.messageCount === 1 ? '' : 's'} · {formatRelativeTime(s.lastMessageAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="sheet-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
