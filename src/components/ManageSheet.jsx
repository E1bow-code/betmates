import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { shareOrCopy, groupInviteUrl } from '../lib/share.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'

// Everything that isn't the feed itself - creating/joining a group, or
// adding a friend by code - lives behind this sheet instead of sitting
// above the feed, so the feed is what you actually see when you open the
// Social tab (see src/pages/SocialFeedPage.jsx).

export default function ManageSheet({ segment, groups, friends, onClose, onChanged }) {
  const { user } = useAuth()
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [shareStatus, setShareStatus] = useState(null)

  async function handleShareInvite(group) {
    const result = await shareOrCopy({
      title: `Join "${group.name}" on BetMates`,
      text: `Join my group "${group.name}" on BetMates`,
      url: groupInviteUrl(group.inviteCode)
    })
    setShareStatus(result === 'copied' ? 'Link copied' : null)
    if (result === 'copied') setTimeout(() => setShareStatus(null), 2000)
  }

  async function handleShareFriendCode() {
    const result = await shareOrCopy({
      title: 'Add me on BetMates',
      text: `Add me on BetMates with my friend code: ${user.friendCode}`
    })
    setShareStatus(result === 'copied' ? 'Copied' : null)
    if (result === 'copied') setTimeout(() => setShareStatus(null), 2000)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.createGroup(name.trim(), user.id)
      setName('')
      onChanged()
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
      onChanged()
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
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        {segment === 'bets' ? (
          <>
            <h2 className="sheet-title">Your groups</h2>

            {groups && groups.length > 0 && (
              <div className="manage-list">
                {groups.map((g) => (
                  <div key={g.id} className="manage-list-row">
                    <span>{g.name}</span>
                    <span className="manage-list-code">{g.inviteCode}</span>
                    <button className="btn btn-ghost btn-small" onClick={() => handleShareInvite(g)}>
                      Share
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form className="field" onSubmit={handleCreate}>
              <span>Start a new group</span>
              <div className="inline-form">
                <input placeholder="What should we call it?" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  Create
                </button>
              </div>
            </form>

            <form className="field" onSubmit={handleJoin}>
              <span>Join with a code</span>
              <div className="inline-form">
                <input placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={8} />
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  Join
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="sheet-title">Your friends</h2>

            <div className="hint hint-with-action">
              <span>
                Your code: <strong>{user.friendCode}</strong>
              </span>
              <button className="btn btn-ghost btn-small" onClick={handleShareFriendCode}>
                Share
              </button>
            </div>

            {friends && friends.length > 0 && (
              <div className="manage-list">
                {friends.map((f) => (
                  <div key={f.id} className="manage-list-row">
                    <span>{f.displayName}</span>
                    <Link className="btn btn-ghost btn-small" to={`/messages/${f.id}`} onClick={onClose}>
                      Message
                    </Link>
                  </div>
                ))}
              </div>
            )}

            <form className="field" onSubmit={handleAddFriend}>
              <span>Add a friend</span>
              <div className="inline-form">
                <input placeholder="Friend's code" value={friendCode} onChange={(e) => setFriendCode(e.target.value.toUpperCase())} required maxLength={8} />
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  Add
                </button>
              </div>
            </form>
          </>
        )}

        {error && <div className="auth-error">{error}</div>}
        {shareStatus && <div className="hint">{shareStatus}</div>}

        <button className="btn btn-ghost" onClick={requestClose}>
          Done
        </button>
      </div>
    </div>
  )
}
