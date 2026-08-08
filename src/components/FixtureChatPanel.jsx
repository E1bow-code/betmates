import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import Avatar from './Avatar.jsx'

// A chat room scoped to one fixture/fight/event, open to any signed-in user
// rather than a group - for mates watching the same game live who aren't
// necessarily in a group together. Separate from group chat (GroupFeedPage)
// and bet comments (threaded under one bet post). Collapsed by default,
// same reasoning as Leaderboard.jsx's toggle - detail pages are already
// busy, and most visitors aren't here to chat. Messages aren't purged after
// the match - same permanence as group chat.
export default function FixtureChatPanel({ sport, eventId, eventLabel }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const runAsync = useAsyncAction()

  useEffect(() => {
    if (open && messages === null) {
      dataStore.listFixtureChatMessages(sport, eventId).then(setMessages)
    }
  }, [open, sport, eventId])

  useEffect(() => {
    if (!open) return
    return dataStore.subscribeFixtureChatMessages(sport, eventId, (message) => {
      setMessages((m) => (m && m.some((x) => x.id === message.id) ? m : [...(m ?? []), message]))
    })
  }, [open, sport, eventId])

  async function handleSend(e) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setSending(true)
    let message
    const ok = await runAsync(async () => {
      message = await dataStore.sendFixtureChatMessage(sport, eventId, user.id, user.displayName, trimmed)
    }, "Couldn't send that message - try again")
    setSending(false)
    if (!ok) return
    setMessages((m) => [...(m ?? []), message])
    setBody('')
  }

  return (
    <div className="fixture-chat">
      <button className="leaderboard-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        💬 Match chat {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="group-chat">
          {messages === null && <div className="loading">Loading chat…</div>}
          {messages && !messages.length && (
            <p className="hint">No messages yet - say something to whoever else is watching.</p>
          )}
          {messages && messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((m) => {
                const mine = m.userId === user.id
                return (
                  <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                    {!mine && <Avatar name={m.authorName} size={26} />}
                    <div className="chat-bubble">
                      {!mine && <div className="chat-author">{m.authorName}</div>}
                      <div>{m.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              placeholder={`Say something about ${eventLabel}…`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
            />
            <button className="btn btn-primary btn-small" type="submit" disabled={sending || !body.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
