import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'

// All of a user's DM threads in one place, sorted by most recent message -
// the only other way to reach a thread is one friend at a time from the
// Friends list (ManageSheet.jsx). "Unread" here is approximate: it's driven
// by the same single last-seen-messages timestamp the nav badge uses (see
// ActivityContext.jsx), not a true per-thread read receipt, so opening any
// one thread clears the highlight on all of them - consistent with how the
// in-app notification centre already works (mark-all, not per-item).
export default function MessagesInboxPage() {
  const { user } = useAuth()
  const { markMessagesSeen } = useActivity()
  const [conversations, setConversations] = useState(null)
  const [error, setError] = useState(null)

  function refresh() {
    return dataStore
      .listConversations(user.id)
      .then(setConversations)
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    refresh()
    markMessagesSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="topbar">
        <Link to="/groups" state={{ segment: 'tips' }} className="back">
          &larr; Social
        </Link>
        <h1>Messages</h1>
      </div>

      {error && <div className="error">Couldn't load your messages: {error}</div>}
      {!error && conversations === null && <div className="loading">Loading conversations…</div>}
      {conversations && !conversations.length && (
        <EmptyState icon="💬" title="No conversations yet" subtitle="Message a friend from the Friends list to start one." />
      )}

      {conversations && conversations.length > 0 && (
        <div className="conversation-list">
          {conversations.map((c) => (
            <Link key={c.friendId} to={`/messages/${c.friendId}`} className="conversation-row">
              <Avatar name={c.friendName} photoUrl={c.friendAvatarUrl} size={40} />
              <div className="conversation-row-main">
                <div className="conversation-row-name">{c.friendName}</div>
                <div className="conversation-row-preview">{c.lastFromFriend ? c.lastBody : `You: ${c.lastBody}`}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PullToRefresh>
  )
}
