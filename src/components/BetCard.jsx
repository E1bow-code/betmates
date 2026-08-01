import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import CopyBetButton from './CopyBetButton.jsx'
import Avatar from './Avatar.jsx'

const REACTION_EMOJIS = ['🔥', '😬', '👍']
const STATUS_LABEL = { open: 'Pending', won: 'Won', lost: 'Lost', void: 'Void' }
const STATUS_ICON = { open: '⏳', won: '✅', lost: '❌', void: '↩️' }

export default function BetCard({ post, memberNames }) {
  const { user } = useAuth()
  const [reactions, setReactions] = useState([])
  const [comments, setComments] = useState([])
  const [showComments, setShowComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [status, setStatus] = useState(post.status)

  useEffect(() => {
    dataStore.listReactions(post.id).then(setReactions)
    dataStore.listComments(post.id).then(setComments)
  }, [post.id])

  const isAuthor = post.userId === user.id
  const authorName = memberNames?.[post.userId] ?? 'Someone'

  async function toggleReaction(emoji) {
    const updated = await dataStore.toggleReaction(post.id, user.id, emoji)
    setReactions(updated)
  }

  async function handleStatusChange(e) {
    const nextStatus = e.target.value
    await dataStore.updateBetStatus(post.id, nextStatus)
    setStatus(nextStatus)
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentBody.trim()) return
    const comment = await dataStore.addComment(post.id, user.id, commentBody.trim())
    setComments((c) => [...c, comment])
    setCommentBody('')
  }

  const selection = post.selections[0]

  return (
    <div className={`bet-card status-${status}`}>
      <div className="bet-card-header">
        <div className="bet-card-who">
          <Avatar name={authorName} />
          <div>
            <span className="bet-card-author">{authorName}</span>
            {post.groupName && <span className="bet-card-group-tag">in {post.groupName}</span>}
          </div>
        </div>
        <span className={`bet-status-pill status-${status}`}>
          {STATUS_ICON[status]} {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="bet-card-body">
        <div className="selection-event">{selection.event}</div>
        <div className="selection-row">
          <span>{selection.market}</span>
          <span className="selection-pick">{selection.selection}</span>
        </div>
        <div className="selection-odds-row">
          <span className="selection-odds">{selection.odds.toFixed(2)}</span>
          <span className="selection-bookmaker">{selection.bookmaker}</span>
        </div>
        {!post.stakeHidden && post.stake ? (
          <div className="bet-card-stake">
            £{post.stake} staked{post.potentialReturn ? <> · returns <strong>£{post.potentialReturn.toFixed(2)}</strong></> : ''}
          </div>
        ) : (
          post.stakeHidden && <div className="bet-card-stake bet-card-stake-hidden">Stake kept private</div>
        )}
      </div>

      <div className="bet-card-footer">
        <div className="reaction-row">
          {REACTION_EMOJIS.map((emoji) => {
            const count = reactions.filter((r) => r.emoji === emoji).length
            const mine = reactions.some((r) => r.emoji === emoji && r.userId === user.id)
            return (
              <button key={emoji} className={mine ? 'reaction-btn active' : 'reaction-btn'} onClick={() => toggleReaction(emoji)}>
                {emoji} {count > 0 && count}
              </button>
            )
          })}
          <button className="reaction-btn" onClick={() => setShowComments((v) => !v)}>
            💬 {comments.length > 0 && comments.length}
          </button>
        </div>

        <div className="bet-card-actions">
          <CopyBetButton post={post} userId={user.id} />
          {isAuthor && status === 'open' && (
            <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
              <option value="open">How'd it go?</option>
              <option value="won">🎉 It won!</option>
              <option value="lost">😬 No luck</option>
              <option value="void">↩️ Voided</option>
            </select>
          )}
        </div>
      </div>

      {showComments && (
        <div className="comment-thread">
          {comments.length === 0 && <div className="comment-empty">No comments yet — be the first to weigh in.</div>}
          {comments.map((c) => (
            <div key={c.id} className="comment-row">
              <Avatar name={memberNames?.[c.userId] ?? 'Someone'} size={22} />
              <span className="comment-author">{memberNames?.[c.userId] ?? 'Someone'}</span>
              <span>{c.body}</span>
            </div>
          ))}
          <form className="comment-form" onSubmit={handleAddComment}>
            <input placeholder="Say something…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} maxLength={280} />
            <button className="btn btn-ghost btn-small" type="submit">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
