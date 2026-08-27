import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { shareOrCopy } from '../lib/share.js'
import UserLink from '../components/UserLink.jsx'
import VideoCard from '../components/VideoCard.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import HeadToHeadSheet from '../components/HeadToHeadSheet.jsx'
import EmptyState from '../components/EmptyState.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import MatesSwitcher from '../components/MatesSwitcher.jsx'
import { CommentIcon, VideoIcon, SwordsIcon } from '../components/icons/Icons.jsx'

// The Friends side of the Mates tab (see components/MatesSwitcher.jsx) - a
// first-class space instead of a modal gated behind whichever segment of
// the old SocialFeedPage.jsx happened to be active (that used to be its
// Tips segment plus a "friends" branch of components/ManageSheet.jsx, only
// reachable when you'd tapped into that exact segment first). Friend
// management (add by code, message, compare) and the friend-tip feed
// (talking-to-camera picks, src/components/VideoRecorder.jsx) live together
// here, reachable directly.
export default function FriendsPage() {
  const { user } = useAuth()
  const { markSeen, hasUnseenMessages } = useActivity()
  const [friends, setFriends] = useState(null)
  const [videos, setVideos] = useState(null)
  const [friendCode, setFriendCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)
  const [shareStatus, setShareStatus] = useState(null)
  const [showRecorder, setShowRecorder] = useState(false)
  const [compareFriend, setCompareFriend] = useState(null)

  useEffect(() => {
    refresh()
    markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refresh() {
    return Promise.all([dataStore.listFriends(user.id).then(setFriends), dataStore.listTipsFeed(user.id).then(setVideos)])
  }

  async function handleAddFriend(e) {
    e.preventDefault()
    setAdding(true)
    setError(null)
    try {
      await dataStore.addFriendByCode(friendCode.trim(), user.id)
      setFriendCode('')
      refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleShareFriendCode() {
    const result = await shareOrCopy({
      title: 'Add me on BetMates',
      text: `Add me on BetMates with my friend code: ${user.friendCode}`
    })
    setShareStatus(result === 'copied' ? 'Copied' : null)
    if (result === 'copied') setTimeout(() => setShareStatus(null), 2000)
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <SportHeroBanner sport="friends" />
      <div className="topbar">
        <div className="topbar-row">
          <h1>Friends</h1>
          <Link className="icon-btn" to="/messages" aria-label={`Messages${hasUnseenMessages ? ' - unread' : ''}`}>
            <CommentIcon width={16} height={16} />
            {hasUnseenMessages && <span className="pill-dot" />}
          </Link>
        </div>
        <MatesSwitcher />
      </div>

      <div className="hint hint-with-action">
        <span>
          Your code: <strong>{user.friendCode}</strong>
        </span>
        <button className="btn btn-ghost btn-small" onClick={handleShareFriendCode}>
          Share
        </button>
      </div>

      <form className="field" onSubmit={handleAddFriend}>
        <span>Add a friend</span>
        <div className="inline-form">
          <input
            placeholder="Friend's code"
            value={friendCode}
            onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            required
            maxLength={8}
          />
          <button className="btn btn-primary" type="submit" disabled={adding}>
            Add
          </button>
        </div>
      </form>

      {error && <div className="auth-error">{error}</div>}
      {shareStatus && <div className="hint">{shareStatus}</div>}

      {friends === null && <div className="loading">Rounding up your friends…</div>}

      {friends && !friends.length && (
        <EmptyState
          icon={<CommentIcon width={26} height={26} />}
          title="No friends yet"
          subtitle="Add one with their code above to start comparing picks and messaging."
        />
      )}

      {friends && friends.length > 0 && (
        <div className="manage-list">
          {friends.map((f) => (
            <div key={f.id} className="manage-list-row">
              <UserLink id={f.id} displayName={f.displayName} />
              <div className="topbar-actions">
                <button className="btn btn-ghost btn-small icon-row" onClick={() => setCompareFriend(f)}>
                  <SwordsIcon width={14} height={14} /> Compare
                </button>
                <Link className="btn btn-ghost btn-small" to={`/messages/${f.id}`}>
                  Message
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="group-actions">
        <button className="btn btn-primary btn-small" onClick={() => setShowRecorder(true)}>
          New tip
        </button>
      </div>

      {videos === null && <div className="loading">Catching up on the tips…</div>}
      {videos && !videos.length && (
        <EmptyState
          icon={<VideoIcon width={26} height={26} />}
          title="No tips yet"
          subtitle="Add a friend with their code above, or record the first one yourself."
        />
      )}

      {videos && videos.length > 0 && (
        <div className="bet-feed">
          {videos.map((v) => (
            <VideoCard key={`${v.id}-${v.sharedAt ?? 'own'}`} post={v} />
          ))}
        </div>
      )}

      {showRecorder && <VideoRecorder onClose={() => setShowRecorder(false)} onPosted={refresh} />}
      {compareFriend && <HeadToHeadSheet friend={compareFriend} onClose={() => setCompareFriend(null)} />}
    </PullToRefresh>
  )
}
