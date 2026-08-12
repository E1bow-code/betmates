import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'

// "If someone sees a video they think is good advice, send it to a group
// or a friend" - forwards an existing video post without re-uploading
// anything, just a new video_shares row pointing at the same video.

export default function ShareVideoSheet({ video, onClose }) {
  const { user } = useAuth()
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)
  const [groups, setGroups] = useState([])
  const [friends, setFriends] = useState([])
  const [sent, setSent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    dataStore.listMyGroups(user.id).then(setGroups)
    dataStore.listFriends(user.id).then(setFriends)
  }, [user.id])

  async function handleShare(target, label) {
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.shareVideo(video.id, user.id, target)
      setSent(label)
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
        <h2 className="sheet-title">Send this to…</h2>

        {sent && <div className="potential-return">Sent to {sent}.</div>}
        {error && <div className="auth-error">{error}</div>}

        {!groups.length && !friends.length && (
          <p className="hint">Join a group or add a friend first - see the Social tab.</p>
        )}

        {groups.length > 0 && (
          <div>
            <div className="share-section-label">Groups</div>
            <div className="share-target-list">
              {groups.map((g) => (
                <button key={g.id} className="share-target-btn" onClick={() => handleShare({ type: 'group', id: g.id }, g.name)} disabled={submitting}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {friends.length > 0 && (
          <div>
            <div className="share-section-label">Friends</div>
            <div className="share-target-list">
              {friends.map((f) => (
                <button
                  key={f.id}
                  className="share-target-btn"
                  onClick={() => handleShare({ type: 'friend', id: f.id }, f.displayName)}
                  disabled={submitting}
                >
                  {f.displayName}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-ghost" onClick={requestClose}>
          Done
        </button>
      </div>
    </div>
  )
}
