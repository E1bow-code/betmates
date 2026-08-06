import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { notifyBetAuthor } from '../lib/notify.js'
import CopyBetButton from './CopyBetButton.jsx'
import BackBetButton from './BackBetButton.jsx'
import ShareImageButton from './ShareImageButton.jsx'
import Avatar from './Avatar.jsx'
import EditBetSheet from './EditBetSheet.jsx'

const REACTION_EMOJIS = ['🔥', '😬', '👍']
const VOTE_OPTIONS = [
  { key: 'lock_in', label: 'Lock in' },
  { key: 'not_sure', label: 'Not sure' },
  { key: 'not_happening', label: 'Not happening' }
]
const STATUS_LABEL = { open: 'Pending', won: 'Won', lost: 'Lost', void: 'Void' }
const REPORT_REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'misleading', label: 'Misleading' }
]

// variant='public' is for the everyone-can-see feed (see
// src/pages/SocialFeedPage.jsx's Feed segment): swaps the emoji reaction
// row for a three-way confidence vote and adds a follow button, since
// there's no group membership here to imply "these are your mates". Block/
// report only make sense here too - group posts are already people you
// chose to be around, not unsolicited exposure.

export default function BetCard({ post, memberNames, variant = 'group', onBlocked, onChanged }) {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const [reactions, setReactions] = useState([])
  const [comments, setComments] = useState([])
  const [showComments, setShowComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [status, setStatus] = useState(post.status)
  const [following, setFollowing] = useState(false)
  const [showModeration, setShowModeration] = useState(false)
  const [reported, setReported] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    dataStore.listReactions(post.id).then(setReactions)
    dataStore.listComments(post.id).then(setComments)
  }, [post.id])

  useEffect(() => {
    if (variant === 'public' && post.userId !== user.id) {
      dataStore.listFollowing(user.id).then((ids) => setFollowing(ids.includes(post.userId)))
    }
  }, [variant, post.userId, user.id])

  const isAuthor = post.userId === user.id
  const authorName = memberNames?.[post.userId] ?? post.authorName ?? 'Someone'

  async function toggleReaction(key) {
    const updated = await dataStore.toggleReaction(post.id, user.id, key)
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
    const body = commentBody.trim()
    const comment = await dataStore.addComment(post.id, user.id, body)
    setComments((c) => [...c, comment])
    setCommentBody('')
    if (!isAuthor) {
      const commenterName = memberNames?.[user.id] ?? user.displayName ?? 'Someone'
      notifyBetAuthor(post.userId, { title: `💬 ${commenterName} commented`, body, url: '/#/groups' })
    }
  }

  async function handleFollowToggle() {
    if (following) {
      await dataStore.unfollowUser(user.id, post.userId)
    } else {
      await dataStore.followUser(user.id, post.userId)
    }
    setFollowing((f) => !f)
  }

  async function handleBlock() {
    if (!window.confirm(`Block ${authorName}? You won't see their posts anymore, and they won't see yours.`)) return
    await dataStore.blockUser(user.id, post.userId)
    onBlocked?.(post.userId)
  }

  async function handleReport(reason) {
    await dataStore.reportPost(post.id, user.id, reason)
    setReported(true)
    setShowModeration(false)
  }

  const selections = post.selections
  const combinedOdds = selections.length > 1 ? selections.reduce((acc, s) => acc * s.odds, 1) : null

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
        <div className="bet-card-header-right">
          {variant === 'public' && !isAuthor && (
            <button className={following ? 'follow-btn active' : 'follow-btn'} onClick={handleFollowToggle}>
              {following ? 'Following' : 'Follow'}
            </button>
          )}
          <span className={`bet-status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
          {variant === 'public' && !isAuthor && (
            <button className="moderation-toggle" onClick={() => setShowModeration((v) => !v)} aria-label="More options">
              ⋯
            </button>
          )}
        </div>
      </div>

      {showModeration && (
        <div className="moderation-menu">
          <button className="btn btn-ghost btn-small" onClick={handleBlock}>
            Block {authorName}
          </button>
          {reported ? (
            <span className="hint">Reported, thanks.</span>
          ) : (
            <>
              <span className="hint">Report:</span>
              {REPORT_REASONS.map((r) => (
                <button key={r.key} className="btn btn-ghost btn-small" onClick={() => handleReport(r.key)}>
                  {r.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="bet-card-body">
        {selections.length > 1 && <div className="bet-card-leg-count">{selections.length}-leg bet builder</div>}
        {selections.map((selection, i) => (
          <div key={i} className={selections.length > 1 ? 'bet-card-leg' : undefined}>
            <div className="selection-event">{selection.event}</div>
            <div className="selection-row">
              <span>{selection.market}</span>
              <span className="selection-pick">{selection.selection}</span>
            </div>
            <div className="selection-odds-row">
              <span className="selection-odds">{formatOdds(selection.odds, format)}</span>
              <span className="selection-bookmaker">{selection.bookmaker}</span>
            </div>
          </div>
        ))}
        {combinedOdds && (
          <div className="bet-card-combined-odds">
            Combined odds: <strong>{formatOdds(combinedOdds, format)}</strong>
          </div>
        )}
        {!post.stakeHidden && post.stake ? (
          <div className="bet-card-stake">
            £{post.stake} staked{post.potentialReturn ? <> · returns <strong>£{post.potentialReturn.toFixed(2)}</strong></> : ''}
          </div>
        ) : (
          post.stakeHidden && <div className="bet-card-stake bet-card-stake-hidden">Stake kept private</div>
        )}
      </div>

      <div className="bet-card-footer">
        {variant === 'public' ? (
          <div className="vote-row">
            {VOTE_OPTIONS.map((opt) => {
              const count = reactions.filter((r) => r.emoji === opt.key).length
              const mine = reactions.some((r) => r.emoji === opt.key && r.userId === user.id)
              return (
                <button key={opt.key} className={mine ? 'vote-btn active' : 'vote-btn'} onClick={() => toggleReaction(opt.key)}>
                  {opt.label} {count > 0 && <span className="vote-count">{count}</span>}
                </button>
              )
            })}
          </div>
        ) : (
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
          </div>
        )}

        <div className="bet-card-actions">
          <button className="reaction-btn" onClick={() => setShowComments((v) => !v)}>
            💬 {comments.length > 0 && comments.length}
          </button>
          <CopyBetButton post={post} userId={user.id} />
          {!isAuthor && <BackBetButton post={post} />}
          <ShareImageButton post={post} />
          {isAuthor && status === 'open' && (
            <>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setShowEdit(true)}>
                Edit
              </button>
              <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
                <option value="open">Mark result</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="void">Void</option>
              </select>
            </>
          )}
        </div>
      </div>

      {showEdit && (
        <EditBetSheet
          entry={{ ...post, source: 'group' }}
          onClose={() => setShowEdit(false)}
          onUpdated={onChanged}
          onDeleted={onChanged}
        />
      )}

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
