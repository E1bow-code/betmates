import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import EmptyState from '../components/EmptyState.jsx'

// Landing view for the Social tab. Two segments:
// - Bets: one merged timeline across every group the user is in.
// - Tips: a Twitter-style feed of talking-to-camera picks from the user
//   and their friends (see src/components/VideoRecorder.jsx), with a way
//   to forward a good one into a group or straight to a friend.

export default function SocialFeedPage() {
  const { user } = useAuth()
  const [segment, setSegment] = useState('bets')
  const [groups, setGroups] = useState(null)
  const [feed, setFeed] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [friends, setFriends] = useState(null)
  const [friendCode, setFriendCode] = useState('')
  const [videos, setVideos] = useState(null)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)

  useEffect(() => {
    refreshBets()
  }, [])

  useEffect(() => {
    if (segment === 'tips' && videos === null) refreshTips()
  }, [segment])

  function refreshBets() {
    dataStore.listMyGroups(user.id).then(setGroups)
    dataStore.listFeedForUser(user.id).then(setFeed)
  }

  function refreshTips() {
    dataStore.listFriends(user.id).then(setFriends)
    Promise.all([dataStore.listFriendsFeed(user.id), dataStore.listSharedWithMe(user.id)]).then(([own, shared]) => {
      const merged = new Map()
      for (const v of [...own, ...shared]) merged.set(`${v.id}-${v.sharedAt ?? 'own'}`, v)
      setVideos([...merged.values()].sort((a, b) => new Date(b.sharedAt ?? b.createdAt) - new Date(a.sharedAt ?? a.createdAt)))
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.createGroup(name.trim(), user.id)
      setName('')
      setShowCreate(false)
      refreshBets()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.joinGroupByCode(code.trim(), user.id)
      setCode('')
      setShowJoin(false)
      refreshBets()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddFriend(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.addFriendByCode(friendCode.trim(), user.id)
      setFriendCode('')
      setShowAddFriend(false)
      refreshTips()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <h1>Social</h1>
        <div className="sport-switcher">
          <button className={segment === 'bets' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('bets')}>
            Bets
          </button>
          <button className={segment === 'tips' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('tips')}>
            Tips
          </button>
        </div>
      </div>

      {segment === 'bets' && (
        <>
          {groups === null && <div className="loading">Loading your groups…</div>}

          {groups && !groups.length && (
            <EmptyState
              icon="👥"
              title="No groups yet"
              subtitle="Create one for your mates, or join with an invite code, to start sharing bets."
            />
          )}

          {groups && groups.length > 0 && (
            <div className="group-chip-row">
              {groups.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`} className="group-chip">
                  {g.name}
                </Link>
              ))}
            </div>
          )}

          <div className="group-actions">
            <button className="btn btn-secondary btn-small" onClick={() => { setShowCreate((v) => !v); setShowJoin(false) }}>
              + New group
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => { setShowJoin((v) => !v); setShowCreate(false) }}>
              Join with code
            </button>
          </div>

          {showCreate && (
            <form className="inline-form" onSubmit={handleCreate}>
              <input placeholder="What should we call it?" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                Create
              </button>
            </form>
          )}

          {showJoin && (
            <form className="inline-form" onSubmit={handleJoin}>
              <input placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={8} />
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                Join
              </button>
            </form>
          )}

          {error && <div className="auth-error">{error}</div>}

          {feed === null && groups?.length > 0 && <div className="loading">Catching up on the latest bets…</div>}
          {feed && groups?.length > 0 && !feed.length && (
            <EmptyState icon="🔕" title="Quiet in here so far" subtitle="Head to the Odds tab and tap a price to get the first bet posted." />
          )}

          {feed && feed.length > 0 && (
            <div className="bet-feed">
              {feed.map((post) => (
                <BetCard key={post.id} post={post} memberNames={post.memberNames} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'tips' && (
        <>
          <div className="hint">Your code: <strong>{user.friendCode}</strong> — share it so mates can add you.</div>

          {friends && friends.length > 0 && (
            <div className="group-chip-row">
              {friends.map((f) => (
                <span key={f.id} className="group-chip friend-chip">
                  {f.displayName}
                </span>
              ))}
            </div>
          )}

          <div className="group-actions">
            <button className="btn btn-primary btn-small" onClick={() => setShowRecorder(true)}>
              🎥 New tip
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => setShowAddFriend((v) => !v)}>
              + Add friend
            </button>
          </div>

          {showAddFriend && (
            <form className="inline-form" onSubmit={handleAddFriend}>
              <input placeholder="Friend's code" value={friendCode} onChange={(e) => setFriendCode(e.target.value.toUpperCase())} required maxLength={8} />
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                Add
              </button>
            </form>
          )}

          {error && <div className="auth-error">{error}</div>}

          {videos === null && <div className="loading">Loading tips…</div>}
          {videos && !videos.length && (
            <EmptyState icon="🎥" title="No tips yet" subtitle="Add a friend with their code, or record the first one yourself." />
          )}

          {videos && videos.length > 0 && (
            <div className="bet-feed">
              {videos.map((v) => (
                <VideoCard key={`${v.id}-${v.sharedAt ?? 'own'}`} post={v} />
              ))}
            </div>
          )}

          {showRecorder && (
            <VideoRecorder
              onClose={() => setShowRecorder(false)}
              onPosted={refreshTips}
            />
          )}
        </>
      )}
    </div>
  )
}
