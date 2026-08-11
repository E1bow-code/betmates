import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { formatRelativeTime } from '../utils/format.js'
import { computeEachWayReturn } from '../utils/eachWay.js'
import { isLive } from '../utils/liveStatus.js'
import { notifyBetAuthor } from '../lib/notify.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import CopyBetButton from './CopyBetButton.jsx'
import BackBetButton from './BackBetButton.jsx'
import ShareImageButton from './ShareImageButton.jsx'
import Avatar from './Avatar.jsx'
import EditBetSheet from './EditBetSheet.jsx'
import LiveBadge from './LiveBadge.jsx'
import FixtureChatSheet from './FixtureChatSheet.jsx'

const REACTION_EMOJIS = ['🔥', '😬', '👍']
const REACTION_LABEL = { '🔥': 'fire', '😬': 'grimace', '👍': 'thumbs up' }
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

export default function BetCard({ post, memberNames, memberAvatars, variant = 'group', onBlocked, onChanged }) {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const runAsync = useAsyncAction()
  const [reactions, setReactions] = useState([])
  const [comments, setComments] = useState([])
  const [copyCount, setCopyCount] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [status, setStatus] = useState(post.status)
  const [following, setFollowing] = useState(false)
  const [showCardMenu, setShowCardMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [chatTarget, setChatTarget] = useState(null)

  useEffect(() => {
    dataStore.listReactions(post.id).then(setReactions)
    dataStore.listComments(post.id).then(setComments)
    dataStore.listBetCopies(post.id).then((copies) => setCopyCount(copies.length))
  }, [post.id])

  useEffect(() => {
    return dataStore.subscribeBetActivity(post.id, {
      onComment: (comment) => setComments((c) => (c.some((x) => x.id === comment.id) ? c : [...c, comment])),
      onReactionInsert: (reaction) => setReactions((r) => (r.some((x) => x.id === reaction.id) ? r : [...r, reaction])),
      onReactionDelete: (reaction) => setReactions((r) => r.filter((x) => x.id !== reaction.id))
    })
  }, [post.id])

  useEffect(() => {
    if (variant === 'public' && post.userId !== user.id) {
      dataStore.listFollowing(user.id).then((ids) => setFollowing(ids.includes(post.userId)))
    }
  }, [variant, post.userId, user.id])

  const isAuthor = post.userId === user.id
  const authorName = memberNames?.[post.userId] ?? post.authorName ?? 'Someone'
  const authorAvatarUrl = memberAvatars?.[post.userId] ?? post.authorAvatarUrl ?? null

  async function toggleReaction(key) {
    const { action, reaction } = await dataStore.toggleReaction(post.id, user.id, key)
    setReactions((r) => (action === 'added' ? [...r, reaction] : r.filter((x) => x.id !== reaction.id)))
    if (action === 'added' && !isAuthor && live) {
      const reactorName = memberNames?.[user.id] ?? user.displayName ?? 'Someone'
      const icon = REACTION_EMOJIS.includes(key) ? key : '🎯'
      const verb = REACTION_EMOJIS.includes(key) ? 'reacted' : `voted "${VOTE_OPTIONS.find((o) => o.key === key)?.label}"`
      notifyBetAuthor(post.userId, { title: `${icon} ${reactorName} ${verb} while your bet's live`, body: '', url: '/#/groups' })
    }
  }

  // "placed" isn't a real status column value - it's an each-way result
  // where the horse placed but didn't win, so it settles as 'won' but with
  // potentialReturn corrected down to just the place-part payout. Same
  // handling as TrackerPage.jsx's manual "Placed (not won)" option; without
  // this a self-report here could only pick Won (overpaying) or Lost
  // (underpaying) for a bet that actually placed.
  async function handleStatusChange(e) {
    const nextStatus = e.target.value
    if (nextStatus === 'placed') {
      const leg = post.selections[0]
      const terms = { fraction: leg.eachWayFraction, places: leg.eachWayPlaces }
      const placeReturn = Math.round(computeEachWayReturn(post.stake, leg.odds, terms, 'place') * 100) / 100
      const ok = await runAsync(() => dataStore.updateBetStatus(post.id, 'won', placeReturn), "Couldn't save that result - try again")
      if (ok) setStatus('won')
      return
    }
    const ok = await runAsync(() => dataStore.updateBetStatus(post.id, nextStatus), "Couldn't save that result - try again")
    if (ok) setStatus(nextStatus)
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentBody.trim()) return
    const body = commentBody.trim()
    let comment
    const ok = await runAsync(async () => {
      comment = await dataStore.addComment(post.id, user.id, body)
    }, "Couldn't post that comment - try again")
    if (!ok) return
    setComments((c) => [...c, comment])
    setCommentBody('')
    if (!isAuthor) {
      const commenterName = memberNames?.[user.id] ?? user.displayName ?? 'Someone'
      notifyBetAuthor(post.userId, { title: `💬 ${commenterName} commented`, body, url: '/#/groups' })
    }
  }

  async function handleFollowToggle() {
    const ok = await runAsync(
      () => (following ? dataStore.unfollowUser(user.id, post.userId) : dataStore.followUser(user.id, post.userId)),
      `Couldn't ${following ? 'unfollow' : 'follow'} - try again`
    )
    if (ok) setFollowing((f) => !f)
  }

  async function handleBlock() {
    if (!window.confirm(`Block ${authorName}? You won't see their posts anymore, and they won't see yours.`)) return
    const ok = await runAsync(() => dataStore.blockUser(user.id, post.userId), "Couldn't block them - try again")
    if (ok) onBlocked?.(post.userId)
  }

  async function handleReport(reason) {
    const ok = await runAsync(() => dataStore.reportPost(post.id, user.id, reason), "Couldn't send that report - try again")
    if (!ok) return
    setReported(true)
    setShowCardMenu(false)
  }

  const selections = post.selections
  const combinedOdds = selections.length > 1 ? selections.reduce((acc, s) => acc * s.odds, 1) : null
  const live = status === 'open' && selections.some((s) => isLive(s.kickoff, s.sport ?? post.sport))
  const liveChatLeg = live && selections.find((s) => s.eventId && isLive(s.kickoff, s.sport ?? post.sport))

  return (
    <div className={`bet-card status-${status}`}>
      <div className="bet-card-header">
        <div className="bet-card-who">
          <Avatar name={authorName} photoUrl={authorAvatarUrl} />
          <div>
            <span className="bet-card-author">{authorName}</span>
            <span className="bet-card-time">{formatRelativeTime(post.createdAt)}</span>
            {post.groupName && <span className="bet-card-group-tag">in {post.groupName}</span>}
          </div>
        </div>
        <div className="bet-card-header-right">
          {liveChatLeg ? (
            <button
              className="live-badge-link"
              type="button"
              onClick={() =>
                setChatTarget({ sport: liveChatLeg.sport ?? post.sport, eventId: liveChatLeg.eventId, eventLabel: liveChatLeg.event })
              }
              aria-label={`Open match chat for ${liveChatLeg.event}`}
            >
              <LiveBadge />
            </button>
          ) : (
            live && <LiveBadge />
          )}
          {variant === 'public' && (
            <button
              className="moderation-toggle"
              onClick={() => setShowCardMenu((v) => !v)}
              aria-label="More options"
              aria-expanded={showCardMenu}
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/* variant='public' folds Follow, Edit+result, Back this bet, Share
          image and Block/Report into one menu behind the header's "⋯" -
          on the old layout these were scattered across a header toggle, a
          footer "More" toggle and always-visible buttons, ~9-11 clickable
          elements per card. Copy Bet and the comment toggle stay directly
          visible below since they're the actual engagement mechanic, not
          incidental clutter. */}
      {variant === 'public' && showCardMenu && (
        <div className="moderation-menu">
          {!isAuthor && (
            <button className={following ? 'btn btn-ghost btn-small active' : 'btn btn-ghost btn-small'} onClick={handleFollowToggle}>
              {following ? 'Following ✓' : 'Follow'}
            </button>
          )}
          {isAuthor && status === 'open' && (
            <>
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={() => {
                  setShowEdit(true)
                  setShowCardMenu(false)
                }}
              >
                Edit
              </button>
              <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
                <option value="open">Mark result</option>
                <option value="won">Won</option>
                {selections.length === 1 && selections[0].eachWay && <option value="placed">Placed (not won)</option>}
                <option value="lost">Lost</option>
                <option value="void">Void</option>
              </select>
            </>
          )}
          {!isAuthor && <BackBetButton post={post} />}
          <ShareImageButton post={post} />
          {!isAuthor && (
            <>
              <div className="moderation-menu-divider" />
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
            </>
          )}
        </div>
      )}

      <div className="bet-card-body">
        {post.caption && <p className="bet-card-caption">"{post.caption}"</p>}

        <div className="bet-card-ticket">
          <div className="bet-card-ticket-header">
            <span className="bet-card-ticket-tag">{post.marketType}</span>
            <span className={`bet-status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
          </div>

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

          {post.stakeHidden ? (
            <div className="bet-card-stake bet-card-stake-hidden">Stake kept private</div>
          ) : (
            <>
              <div className="bet-card-ticket-divider" />
              <div className="bet-card-stats">
                {post.stake ? (
                  <div className="bet-card-stat">
                    <span className="bet-card-stat-label">Stake</span>
                    <span className="bet-card-stat-value">£{post.stake}</span>
                  </div>
                ) : null}
                <div className="bet-card-stat">
                  <span className="bet-card-stat-label">Odds</span>
                  <span className="bet-card-stat-value">{formatOdds(combinedOdds ?? selections[0].odds, format)}</span>
                </div>
                {post.stake && post.potentialReturn ? (
                  <div className="bet-card-stat">
                    <span className="bet-card-stat-label">Returns</span>
                    <span className="bet-card-stat-value accent">£{post.potentialReturn.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bet-card-footer">
        {variant === 'public' ? (
          <div className={live ? 'vote-row vote-row-live' : 'vote-row'}>
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
          <div className={live ? 'reaction-row reaction-row-live' : 'reaction-row'}>
            {REACTION_EMOJIS.map((emoji) => {
              const count = reactions.filter((r) => r.emoji === emoji).length
              const mine = reactions.some((r) => r.emoji === emoji && r.userId === user.id)
              return (
                <button
                  key={emoji}
                  className={mine ? 'reaction-btn active' : 'reaction-btn'}
                  onClick={() => toggleReaction(emoji)}
                  aria-label={`${mine ? 'Remove' : 'React with'} ${REACTION_LABEL[emoji]}${count > 0 ? ` · ${count}` : ''}`}
                  aria-pressed={mine}
                >
                  {emoji} {count > 0 && count}
                </button>
              )
            })}
          </div>
        )}

        {variant === 'group' && reactions.length > 0 && (
          <p className="hint reaction-names">
            {REACTION_EMOJIS.filter((emoji) => reactions.some((r) => r.emoji === emoji))
              .map((emoji) => {
                const names = reactions.filter((r) => r.emoji === emoji).map((r) => memberNames?.[r.userId] ?? 'Someone')
                return `${emoji} ${names.join(', ')}`
              })
              .join('   ')}
          </p>
        )}

        <div className="bet-card-actions">
          <button
            className="reaction-btn"
            onClick={() => setShowComments((v) => !v)}
            aria-expanded={showComments}
            aria-label={`${showComments ? 'Hide' : 'Show'} comments${comments.length > 0 ? ` · ${comments.length}` : ''}`}
          >
            💬 {comments.length > 0 && comments.length}
          </button>
          <CopyBetButton post={post} userId={user.id} copyCount={copyCount} onCopied={() => setCopyCount((c) => c + 1)} />
          {variant === 'group' && isAuthor && status === 'open' && (
            <>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setShowEdit(true)}>
                Edit
              </button>
              <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
                <option value="open">Mark result</option>
                <option value="won">Won</option>
                {selections.length === 1 && selections[0].eachWay && <option value="placed">Placed (not won)</option>}
                <option value="lost">Lost</option>
                <option value="void">Void</option>
              </select>
            </>
          )}
          {variant === 'group' && (
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setShowMoreActions((v) => !v)}
              aria-expanded={showMoreActions}
            >
              {showMoreActions ? 'Less ▴' : 'More ▾'}
            </button>
          )}
        </div>
        {variant === 'group' && showMoreActions && (
          <div className="bet-card-more-menu">
            {!isAuthor && <BackBetButton post={post} />}
            <ShareImageButton post={post} />
          </div>
        )}
      </div>

      {showEdit && (
        <EditBetSheet
          entry={{ ...post, source: 'group' }}
          onClose={() => setShowEdit(false)}
          onUpdated={onChanged}
          onDeleted={onChanged}
        />
      )}

      {chatTarget && <FixtureChatSheet {...chatTarget} onClose={() => setChatTarget(null)} />}

      {showComments && (
        <div className="comment-thread">
          {comments.length === 0 && <div className="comment-empty">No comments yet — be the first to weigh in.</div>}
          {comments.map((c) => (
            <div key={c.id} className="comment-row">
              <Avatar name={memberNames?.[c.userId] ?? 'Someone'} photoUrl={memberAvatars?.[c.userId]} size={22} />
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
