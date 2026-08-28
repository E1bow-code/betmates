import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { formatRelativeTime } from '../utils/format.js'
import { computeEachWayReturn } from '../utils/eachWay.js'
import { isLive } from '../utils/liveStatus.js'
import { notifyBetAuthor } from '../lib/notify.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { labelForTag, iconForTag } from '../lib/postTags.js'
import { parseMatchup, resolveMatchupWinner } from '../utils/matchup.js'
import { participantBadge } from '../utils/participantBadge.js'
import CopyBetButton from './CopyBetButton.jsx'
import BackBetButton from './BackBetButton.jsx'
import ShareImageButton from './ShareImageButton.jsx'
import ShareWinButton from './ShareWinButton.jsx'
import TeamBadge from './TeamBadge.jsx'
import PlayerPhoto from './PlayerPhoto.jsx'
import Avatar from './Avatar.jsx'
import UserLink from './UserLink.jsx'
import EditBetSheet from './EditBetSheet.jsx'
import LiveBadge from './LiveBadge.jsx'
import LiveScoreTag from './LiveScoreTag.jsx'
import { useLiveScores } from '../lib/liveScores.js'
import FixtureChatSheet from './FixtureChatSheet.jsx'
import MatchupBanner from './MatchupBanner.jsx'
import {
  FlameIcon,
  UnsureFaceIcon,
  ThumbsUpIcon,
  LaughFaceIcon,
  MoneyIcon,
  CommentIcon,
  HorseIcon,
  FootballIcon,
  DiamondIcon,
  TargetIcon,
  LockIcon,
  BrokenHeartIcon,
  ChevronIcon
} from './icons/Icons.jsx'
import { summariseReactions } from '../utils/reactions.js'
import { MoreIcon } from './icons/NavIcons.jsx'

const POST_TAG_ICON = {
  horse: HorseIcon,
  football: FootballIcon,
  diamond: DiamondIcon,
  target: TargetIcon,
  lock: LockIcon,
  brokenHeart: BrokenHeartIcon,
  flame: FlameIcon
}

// The emoji strings are the actual stored value (bet_reactions.emoji) and
// what goes out in push notification titles (an OS-rendered string, not
// something our own icon set can reach) - only REACTION_ICON below is
// new, for swapping the in-app button glyph for a real icon without
// touching the data model.
// Exported so NotificationsPage.jsx's "reacted" notification text can
// share these labels instead of redeclaring its own copy that could drift.
export const REACTION_EMOJIS = ['🔥', '👍', '😂', '😬', '💰']
export const REACTION_LABEL = { '🔥': 'fire', '👍': 'thumbs up', '😂': 'laughing', '😬': 'grimace', '💰': 'money' }
const REACTION_ICON = { '🔥': FlameIcon, '👍': ThumbsUpIcon, '😂': LaughFaceIcon, '😬': UnsureFaceIcon, '💰': MoneyIcon }
export const VOTE_OPTIONS = [
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
// src/components/PublicFeedView.jsx, rendered on HomePage): swaps the emoji
// reaction row for a three-way confidence vote and adds a follow button, since
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
  const [resolvedProfiles, setResolvedProfiles] = useState({})
  const [showCardMenu, setShowCardMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reported, setReported] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [chatTarget, setChatTarget] = useState(null)
  const [photoSrc, setPhotoSrc] = useState(null)
  const [videoSrc, setVideoSrc] = useState(null)

  useEffect(() => {
    dataStore.listReactions(post.id).then(setReactions)
    dataStore.listComments(post.id).then(setComments)
    dataStore.listBetCopies(post.id).then((copies) => setCopyCount(copies.length))
  }, [post.id])

  useEffect(() => {
    if (!post.photoUrl) {
      setPhotoSrc(null)
      return undefined
    }
    let url
    dataStore.getPostPhotoUrl(post.photoUrl).then((resolvedUrl) => {
      if (!resolvedUrl) return
      url = resolvedUrl
      setPhotoSrc(resolvedUrl)
    })
    return () => {
      // Local mode returns a blob: object URL that needs revoking; Supabase
      // Storage's signed URL is a plain https URL - nothing to revoke there.
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [post.photoUrl])

  useEffect(() => {
    if (!post.videoUrl) {
      setVideoSrc(null)
      return undefined
    }
    let url
    dataStore.getPostVideoUrl(post.videoUrl).then((resolvedUrl) => {
      if (!resolvedUrl) return
      url = resolvedUrl
      setVideoSrc(resolvedUrl)
    })
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [post.videoUrl])

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

  // comments/reactions only ever carry a raw userId (see mapComment/
  // mapReaction) - memberNames/memberAvatars covers group feeds (built from
  // the group's own member list), but the public feed never has a bounded
  // member set to build one from, so it doesn't pass those props at all.
  // Without this, every comment/reaction on the public feed - including the
  // viewer's own, right after posting - fell back to "Someone".
  useEffect(() => {
    const ids = new Set([...comments.map((c) => c.userId), ...reactions.map((r) => r.userId)])
    const missing = [...ids].filter((id) => id && id !== user.id && !memberNames?.[id] && !resolvedProfiles[id])
    if (!missing.length) return undefined
    let cancelled = false
    Promise.all(missing.map((id) => dataStore.getProfileById(id))).then((profiles) => {
      if (cancelled) return
      setResolvedProfiles((prev) => {
        const next = { ...prev }
        for (const p of profiles) if (p) next[p.id] = p
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [comments, reactions, memberNames, user.id])

  function resolveName(id) {
    if (!id) return 'Someone'
    if (id === user.id) return memberNames?.[id] ?? user.displayName ?? 'Someone'
    return memberNames?.[id] ?? resolvedProfiles[id]?.displayName ?? 'Someone'
  }

  function resolveAvatar(id) {
    if (!id) return undefined
    if (id === user.id) return memberAvatars?.[id] ?? user.avatarUrl
    return memberAvatars?.[id] ?? resolvedProfiles[id]?.avatarUrl
  }

  const isAuthor = post.userId === user.id
  const authorName = memberNames?.[post.userId] ?? post.authorName ?? 'Someone'
  const authorAvatarUrl = memberAvatars?.[post.userId] ?? post.authorAvatarUrl ?? null

  async function toggleReaction(key) {
    const { action, reaction } = await dataStore.toggleReaction(post.id, user.id, key)
    setReactions((r) => (action === 'added' ? [...r, reaction] : r.filter((x) => x.id !== reaction.id)))
    // Used to only push while `live` (status open + kickoff passed) - the
    // in-app Alerts fallback (ActivityContext.jsx's 'reacted' kind) never
    // had that restriction, so a pre-kickoff or already-settled reaction
    // showed up in Alerts but silently skipped the push. Now pushes
    // unconditionally like comments already did; the "while your bet's
    // live" framing only applies when it's actually true.
    if (action === 'added' && !isAuthor) {
      const reactorName = memberNames?.[user.id] ?? user.displayName ?? 'Someone'
      const icon = REACTION_EMOJIS.includes(key) ? key : '🎯'
      const verb = REACTION_EMOJIS.includes(key) ? 'reacted' : `voted "${VOTE_OPTIONS.find((o) => o.key === key)?.label}"`
      const title = live ? `${icon} ${reactorName} ${verb} while your bet's live` : `${icon} ${reactorName} ${verb} on your bet`
      notifyBetAuthor(post.userId, { title, body: '', url: variant === 'public' ? '/#/dashboard' : '/#/groups' })
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
      notifyBetAuthor(post.userId, { title: `💬 ${commenterName} commented`, body, url: variant === 'public' ? '/#/dashboard' : '/#/groups' })
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

  // Gated on `live` (kickoff estimate has actually passed), not just
  // `open` - every open card in a feed independently polls /api/scores
  // every 30s (see useLiveScores), so a card for a bet that doesn't kick
  // off until next week has no business polling at all. Confirmed live:
  // without this, a feed of N open bets was N concurrent pollers even
  // though only the ones actually in-play could ever get a result back.
  const openEntries = useMemo(() => (live ? [{ selections, sport: post.sport }] : []), [live, selections, post.sport])
  const liveByEvent = useLiveScores(openEntries)

  return (
    <div className={`bet-card status-${status}`}>
      <div className="bet-card-header">
        <div className="bet-card-who">
          <Avatar name={authorName} photoUrl={authorAvatarUrl} />
          <div>
            <UserLink id={post.userId} displayName={authorName} className="bet-card-author" />
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
              onClick={() => {
                setShowCardMenu((v) => !v)
                setShowReport(false)
              }}
              aria-label="More options"
              aria-expanded={showCardMenu}
            >
              <MoreIcon width={16} height={16} />
            </button>
          )}
        </div>
      </div>

      {/* variant='public' folds Follow, Edit+result, Back this bet, Share
          image and Block/Report into one menu behind the header's MoreIcon
          toggle - on the old layout these were scattered across a header toggle, a
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
              {selections.length > 0 && (
                <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
                  <option value="open">Mark result</option>
                  <option value="won">Won</option>
                  {selections.length === 1 && selections[0].eachWay && <option value="placed">Placed (not won)</option>}
                  <option value="lost">Lost</option>
                  <option value="void">Void</option>
                </select>
              )}
            </>
          )}
          {selections.length > 0 && !isAuthor && <BackBetButton post={post} />}
          {selections.length > 0 && <ShareImageButton post={post} />}
          {!isAuthor && (
            <>
              <div className="moderation-menu-divider" />
              <button className="btn btn-ghost btn-small" onClick={handleBlock}>
                Block {authorName}
              </button>
              {/* The report reasons stay hidden behind a single "Report"
                  button until it's tapped - opening the ⋯ menu shouldn't
                  dump every reason on screen at once (reporting a mate's post
                  is the rare action here, not the default one). */}
              {reported ? (
                <span className="hint">Reported, thanks.</span>
              ) : showReport ? (
                <>
                  <span className="hint">Report for:</span>
                  {REPORT_REASONS.map((r) => (
                    <button key={r.key} className="btn btn-ghost btn-small" onClick={() => handleReport(r.key)}>
                      {r.label}
                    </button>
                  ))}
                </>
              ) : (
                <button className="btn btn-ghost btn-small" onClick={() => setShowReport(true)}>
                  Report
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="bet-card-body">
        {post.tag &&
          (() => {
            const TagIcon = POST_TAG_ICON[iconForTag(post.tag)]
            return (
              <span className="chip chip--pill chip--md chip--filled-accent post-tag-chip post-tag-chip-readonly icon-row">
                {TagIcon && <TagIcon width={13} height={13} />} {labelForTag(post.tag)}
              </span>
            )
          })()}
        {post.caption && <p className="bet-card-caption">"{post.caption}"</p>}
        {photoSrc && <img src={photoSrc} alt="" className="bet-card-photo" loading="lazy" />}
        {videoSrc && <video src={videoSrc} controls className="bet-card-photo" />}

        {selections.length > 0 && (
          <div className="bet-card-ticket">
            {selections.length === 1 &&
              (() => {
                const matchup = parseMatchup(selections[0])
                const winner = resolveMatchupWinner(selections[0], matchup, status)
                return matchup && <MatchupBanner sport={selections[0].sport} {...matchup} winner={winner} />
              })()}

            <div className="bet-card-ticket-header">
              <span className="bet-card-ticket-tag">{post.marketType}</span>
              <span className={`chip chip--pill chip--sm chip--outline bet-status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
            </div>

            {selections.map((selection, i) => {
              const badge = participantBadge(selection, post.sport)
              const liveGame = status === 'open' ? liveByEvent.get(selection.event) : null
              return (
              <div key={i} className={selections.length > 1 ? 'bet-card-leg' : undefined}>
                <div className="selection-event">
                  {selection.event}
                  {liveGame && <LiveScoreTag game={liveGame} />}
                </div>
                <div className="selection-row">
                  <span>{selection.market}</span>
                  <span className="selection-pick">
                    {badge &&
                      (badge.type === 'team' ? (
                        <TeamBadge team={badge.name} sport={badge.sport} size={18} />
                      ) : (
                        <PlayerPhoto name={badge.name} sport={badge.sport} size={18} />
                      ))}
                    {selection.selection}
                  </span>
                </div>
                <div className="selection-odds-row">
                  <span className="selection-odds">{formatOdds(selection.odds, format)}</span>
                  <span className="selection-bookmaker">{selection.bookmaker}</span>
                </div>
              </div>
              )
            })}

            {post.stakeHidden ? (
              <div className="bet-card-stake bet-card-stake-hidden">Stake kept private</div>
            ) : (
              <>
                <div className="chalk-divider chalk-divider--tear bet-card-ticket-divider" />
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
        )}
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
            {summariseReactions(reactions, REACTION_EMOJIS, user.id).map(({ emoji, count, mine }) => {
              const Icon = REACTION_ICON[emoji]
              return (
                <button
                  key={emoji}
                  className={mine ? 'reaction-btn active' : 'reaction-btn'}
                  onClick={() => toggleReaction(emoji)}
                  aria-label={`${mine ? 'Remove' : 'React with'} ${REACTION_LABEL[emoji]}${count > 0 ? ` · ${count}` : ''}`}
                  aria-pressed={mine}
                >
                  <Icon /> {count > 0 && count}
                </button>
              )
            })}
          </div>
        )}

        {variant === 'group' && reactions.length > 0 && (
          <p className="hint reaction-names">
            {summariseReactions(reactions, REACTION_EMOJIS, user.id)
              .filter((s) => s.count > 0)
              .map(({ emoji, userIds }) => {
                const Icon = REACTION_ICON[emoji]
                return (
                  <span key={emoji} className="reaction-names-group">
                    <Icon />{' '}
                    {userIds.map((uid, i) => (
                      <span key={uid ?? i}>
                        <UserLink id={uid} displayName={resolveName(uid)} />
                        {i < userIds.length - 1 && ', '}
                      </span>
                    ))}
                  </span>
                )
              })}
          </p>
        )}

        <div className="bet-card-actions">
          <button
            className="reaction-btn"
            onClick={() => setShowComments((v) => !v)}
            aria-expanded={showComments}
            aria-label={`${showComments ? 'Hide' : 'Show'} comments${comments.length > 0 ? ` · ${comments.length}` : ''}`}
          >
            <CommentIcon /> {comments.length > 0 && comments.length}
          </button>
          {selections.length > 0 && (
            <CopyBetButton post={post} userId={user.id} copyCount={copyCount} onCopied={() => setCopyCount((c) => c + 1)} />
          )}
          {variant === 'group' && isAuthor && status === 'open' && (
            <>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setShowEdit(true)}>
                Edit
              </button>
              {selections.length > 0 && (
                <select className="status-select" defaultValue="open" onChange={handleStatusChange}>
                  <option value="open">Mark result</option>
                  <option value="won">Won</option>
                  {selections.length === 1 && selections[0].eachWay && <option value="placed">Placed (not won)</option>}
                  <option value="lost">Lost</option>
                  <option value="void">Void</option>
                </select>
              )}
            </>
          )}
          {variant === 'group' && (
            <button
              className="btn btn-ghost btn-small icon-row"
              type="button"
              onClick={() => setShowMoreActions((v) => !v)}
              aria-expanded={showMoreActions}
            >
              {showMoreActions ? 'Less' : 'More'}
              <ChevronIcon width={13} height={13} style={showMoreActions ? { transform: 'rotate(180deg)' } : undefined} />
            </button>
          )}
        </div>
        {variant === 'group' && showMoreActions && (
          <div className="bet-card-more-menu">
            {selections.length > 0 && !isAuthor && <BackBetButton post={post} />}
            {selections.length > 0 && <ShareImageButton post={post} />}
            {selections.length > 0 && status === 'won' && <ShareWinButton post={post} />}
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
              <Avatar name={resolveName(c.userId)} photoUrl={resolveAvatar(c.userId)} size={22} />
              <UserLink id={c.userId} displayName={resolveName(c.userId)} className="comment-author" />
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
