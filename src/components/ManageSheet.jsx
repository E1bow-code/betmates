import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { shareOrCopy, groupInviteUrl } from '../lib/share.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { backdropDismissProps } from '../lib/sheetDismiss.js'

// Creating/joining a group, or grabbing an invite code to share, lives
// behind this sheet instead of sitting above the feed on
// src/pages/GroupsHomePage.jsx. Friend management has its own full page now
// (src/pages/FriendsPage.jsx) - this used to have a second "friends" branch
// gated by a `segment` prop, back when Groups and Friends shared one page.

export default function ManageSheet({ groups, onClose, onChanged }) {
  const { user } = useAuth()
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
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

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} {...backdropDismissProps(requestClose)}>
      <div className={`sheet${closing ? ' closing' : ''}`}>
        <div className="sheet-handle" />
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

        {error && <div className="auth-error">{error}</div>}
        {shareStatus && <div className="hint">{shareStatus}</div>}

        <button className="btn btn-ghost" onClick={requestClose}>
          Done
        </button>
      </div>
    </div>
  )
}
