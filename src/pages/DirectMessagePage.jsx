import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { notifyFriend } from '../lib/notify.js'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'

// 1:1 chat with a friend - same free-text shape as GroupFeedPage's Chat
// tab, just between two people instead of a group's members. Reached from
// the Friends list in ManageSheet.jsx.
export default function DirectMessagePage() {
  const { friendId } = useParams()
  const { user } = useAuth()
  const { markMessagesSeen } = useActivity()
  const [friend, setFriend] = useState(null)
  const [messages, setMessages] = useState(null)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  function refresh() {
    return Promise.all([
      dataStore.getProfileById(friendId).then(setFriend),
      dataStore.listDirectMessages(user.id, friendId).then(setMessages)
    ]).catch((err) => setError(err.message))
  }

  useEffect(() => {
    refresh()
    markMessagesSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId])

  async function handleSend(e) {
    e.preventDefault()
    const body = messageBody.trim()
    if (!body) return
    setSending(true)
    try {
      const message = await dataStore.sendDirectMessage(user.id, friendId, body)
      setMessages((m) => [...(m ?? []), message])
      setMessageBody('')
      notifyFriend(friendId, {
        title: `${user.displayName} sent you a message`,
        body,
        url: `/#/messages/${user.id}`
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="topbar">
        <Link to="/groups" state={{ segment: 'tips' }} className="back">
          &larr; Friends
        </Link>
        <h1>{friend?.displayName ?? 'Message'}</h1>
      </div>

      {error && <div className="error">Couldn't load this conversation: {error}</div>}

      <div className="group-chat">
        {messages === null && !error && <div className="loading">Loading messages…</div>}
        {messages && !messages.length && (
          <EmptyState icon="💬" title="No messages yet" subtitle={`Say something to ${friend?.displayName ?? 'your friend'}.`} />
        )}
        {messages && messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((m) => {
              const mine = m.senderId === user.id
              return (
                <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                  {!mine && <Avatar name={friend?.displayName ?? 'Someone'} photoUrl={friend?.avatarUrl} size={26} />}
                  <div className="chat-bubble">
                    <div>{m.body}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            placeholder={`Message ${friend?.displayName ?? 'your friend'}…`}
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            maxLength={500}
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={sending || !messageBody.trim()}>
            Send
          </button>
        </form>
      </div>
    </PullToRefresh>
  )
}
