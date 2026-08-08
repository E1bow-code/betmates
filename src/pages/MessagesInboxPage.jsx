import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import Avatar from '../components/Avatar.jsx'
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

  useEffect(() => {
    return dataStore.subscribeInboxMessages(user.id, () => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="topbar">
        <Link to="/groups" state={{ segment: 'tips' }} className="back">
          &larr; Social
        </Link>
        <h1>Messages</h1>
      </div>

      {error && <div className="error">Couldn't load your messages: {error}</div>}

      {/* CoachGPT pinned above friend DMs - it's always there (no "did they
          reply yet" to check, unlike a friend), so it doesn't wait on
          conversations to load and isn't affected by the DM empty state
          below. Same conversation-row shell as a friend thread, just with
          a badge instead of an Avatar photo/initials. */}
      <div className="conversation-list">
        <Link to="/coach" className="conversation-row">
          <span className="avatar conversation-row-coach-avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
            🧠
          </span>
          <div className="conversation-row-main">
            <div className="conversation-row-name">CoachGPT</div>
            <div className="conversation-row-preview">Ask about a fixture or a player</div>
          </div>
        </Link>
        {conversations &&
          conversations.map((c) => (
            <Link key={c.friendId} to={`/messages/${c.friendId}`} className="conversation-row">
              <Avatar name={c.friendName} photoUrl={c.friendAvatarUrl} size={40} />
              <div className="conversation-row-main">
                <div className="conversation-row-name">{c.friendName}</div>
                <div className="conversation-row-preview">{c.lastFromFriend ? c.lastBody : `You: ${c.lastBody}`}</div>
              </div>
            </Link>
          ))}
      </div>

      {!error && conversations === null && <div className="loading">Loading conversations…</div>}
      {conversations && !conversations.length && (
        <p className="hint">No conversations with friends yet - message someone from the Friends list to start one.</p>
      )}
    </PullToRefresh>
  )
}
