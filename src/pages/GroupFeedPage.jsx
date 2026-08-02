import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import Leaderboard from '../components/Leaderboard.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function GroupFeedPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [posts, setPosts] = useState(null)
  const [items, setItems] = useState(null) // bets + shared videos, merged and sorted
  const [memberNames, setMemberNames] = useState({})
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('feed')
  const [messages, setMessages] = useState(null)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    Promise.all([dataStore.getGroup(id), dataStore.listBetPosts(id), dataStore.listGroupMembers(id), dataStore.listSharedInGroup(id)])
      .then(([g, betPosts, members, videos]) => {
        setGroup(g)
        setPosts(betPosts)
        setMemberNames(Object.fromEntries(members.map((m) => [m.id, m.displayName])))
        const merged = [
          ...betPosts.map((p) => ({ kind: 'bet', sortAt: p.createdAt, data: p })),
          ...videos.map((v) => ({ kind: 'video', sortAt: v.sharedAt, data: v }))
        ].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt))
        setItems(merged)
      })
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    if (tab === 'chat' && messages === null) {
      dataStore.listGroupMessages(id).then(setMessages)
    }
  }, [tab, id])

  async function handleSend(e) {
    e.preventDefault()
    const body = messageBody.trim()
    if (!body) return
    setSending(true)
    try {
      const message = await dataStore.sendGroupMessage(id, user.id, body)
      setMessages((m) => [...(m ?? []), message])
      setMessageBody('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/groups" className="back">
          &larr; Social
        </Link>
        <h1>{group?.name ?? 'Group'}</h1>
        {group && <div className="race-header-meta">Invite code: {group.inviteCode}</div>}
        <div className="mode-switcher">
          <button className={tab === 'feed' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('feed')}>
            Feed
          </button>
          <button className={tab === 'chat' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('chat')}>
            Chat
          </button>
        </div>
      </div>

      {tab === 'feed' && (
        <>
          {error && <div className="error">Hmm, couldn't load this group: {error}</div>}
          {!error && items === null && <div className="loading">Catching up on the feed…</div>}
          {posts && posts.length > 0 && <Leaderboard posts={posts} memberNames={memberNames} />}
          {items && !items.length && (
            <EmptyState
              icon="💬"
              title="Nothing posted here yet"
              subtitle="Head to the Odds tab and tap a price to get things started."
            />
          )}

          {items && items.length > 0 && (
            <div className="bet-feed">
              {items.map((item) =>
                item.kind === 'bet' ? (
                  <BetCard key={`bet-${item.data.id}`} post={item.data} memberNames={memberNames} />
                ) : (
                  <VideoCard key={`video-${item.data.id}-${item.data.sharedAt}`} post={item.data} />
                )
              )}
            </div>
          )}
        </>
      )}

      {tab === 'chat' && (
        <div className="group-chat">
          {messages === null && <div className="loading">Loading chat…</div>}
          {messages && !messages.length && (
            <EmptyState icon="💬" title="No messages yet" subtitle="Say something to get the chat going." />
          )}
          {messages && messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((m) => {
                const mine = m.userId === user.id
                return (
                  <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                    {!mine && <Avatar name={memberNames[m.userId] ?? 'Someone'} size={26} />}
                    <div className="chat-bubble">
                      {!mine && <div className="chat-author">{memberNames[m.userId] ?? 'Someone'}</div>}
                      <div>{m.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              placeholder="Message the group…"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              maxLength={500}
            />
            <button className="btn btn-primary btn-small" type="submit" disabled={sending || !messageBody.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
