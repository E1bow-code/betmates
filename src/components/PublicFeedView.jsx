import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import BetCard from './BetCard.jsx'
import VideoCard from './VideoCard.jsx'
import EmptyState from './EmptyState.jsx'
import { MegaphoneIcon } from './icons/Icons.jsx'

// The public feed - anyone's "post to everyone" picks, regardless of group
// membership - interleaved with the viewer's Tips (video_posts, strictly
// friend-scoped by RLS - see schema.sql, no public tier exists for them).
// Shared between HomePage (the front door) and, previously, SocialFeedPage's
// Feed segment (removed - HomePage already owned this, see
// src/pages/GroupsHomePage.jsx's header comment) so both rendered the same
// thing instead of each fetching and rendering it independently. Owns its
// own fetch; exposes refresh() via ref for callers using a manual
// "load more"/record-a-tip trigger (HomePage's post-then-land flow).
//
// `filter='following'` (from HomePage's segmented pill row) narrows the
// bet-post half down to people the signed-in user follows, fetched once
// here rather than the per-card lookup BetCard.jsx already does for its
// own Follow-button state - two independent uses of the same
// dataStore.listFollowing call, not a shared cache. Tips have no
// "following" relation (only friendship, already a small curated set), so
// they render on both All and Following regardless of this toggle.
//
// The "Trending this week" chip row that used to sit above the feed here
// moved to src/pages/ExplorePage.jsx (computeTrendingPicks unchanged) - it's
// a discovery/ranking signal, not feed content, and was competing with the
// feed itself for the first thing a returning visitor sees.
// Repeat visitors don't need "here's how posting works" every single time -
// shown once, same localStorage-flag pattern as MoreMenu.jsx's expand-state
// memory, so the feed itself is reached without static instructional copy
// in front of it on every visit.
const HINT_SEEN_KEY = 'betmates:publicFeedHintSeen'

const PublicFeedView = forwardRef(function PublicFeedView({ filter = 'all' }, ref) {
  const { user } = useAuth()
  const [publicFeed, setPublicFeed] = useState(null)
  const [tipsFeed, setTipsFeed] = useState(null)
  const [followedIds, setFollowedIds] = useState(null)
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    load()
  }, [user.id])

  useEffect(() => {
    if (filter !== 'following') return
    dataStore
      .listFollowing(user.id)
      .then(setFollowedIds)
      .catch(() => setFollowedIds([]))
  }, [filter, user.id])

  function load() {
    return Promise.all([
      dataStore.listPublicFeed(user.id).then(setPublicFeed),
      dataStore
        .listTipsFeed(user.id)
        .then(setTipsFeed)
        .catch(() => setTipsFeed([]))
    ])
  }

  useImperativeHandle(ref, () => ({ refresh: load }))

  function dismissHint() {
    try {
      localStorage.setItem(HINT_SEEN_KEY, '1')
    } catch {
      // ignore
    }
    setShowHint(false)
  }

  const visibleFeed = useMemo(() => {
    if (!publicFeed || filter !== 'following') return publicFeed
    if (!followedIds) return null
    return publicFeed.filter((p) => followedIds.includes(p.userId))
  }, [publicFeed, filter, followedIds])

  // Bet posts (already narrowed by the All/Following toggle above) and
  // Tips (always included - see header comment) tagged with a `kind`
  // discriminator so the render below can branch per item, interleaved by
  // actual recency rather than one content type just tacking onto the end.
  const combinedFeed = useMemo(() => {
    if (visibleFeed === null || tipsFeed === null) return null
    const bets = visibleFeed.map((post) => ({ ...post, kind: 'bet', sortAt: post.createdAt }))
    const tips = tipsFeed.map((tip) => ({ ...tip, kind: 'tip', sortAt: tip.sharedAt ?? tip.createdAt }))
    return [...bets, ...tips].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt))
  }, [visibleFeed, tipsFeed])

  function handleBlocked(blockedUserId) {
    setPublicFeed((pf) => (pf ? pf.filter((p) => p.userId !== blockedUserId) : pf))
  }

  return (
    <>
      {filter === 'all' && showHint && (
        <p className="hint hint-with-action">
          <span>
            Everyone's picks - tap a price on the Odds tab and choose "Post to everyone" to add yours. Posting to a group
            instead keeps it just between you and your mates.
          </span>
          <button className="btn btn-ghost btn-small" onClick={dismissHint}>
            Got it
          </button>
        </p>
      )}

      {combinedFeed === null && <div className="loading">Catching up on the feed…</div>}
      {combinedFeed && !combinedFeed.length && (
        <EmptyState
          icon={<MegaphoneIcon width={26} height={26} />}
          title="Nothing here yet"
          subtitle={filter === 'following' ? "Follow a few people to see their picks here." : 'Be the first to post a pick for everyone to see.'}
          // The Following tab told people to follow someone but gave them no way
          // to do it - a dead-end for anyone who hasn't yet. Point them at the
          // tipster board (same place the getting-started "follow a mate" step
          // goes) so the empty state is a next step, not a full stop.
          action={
            filter === 'following' ? (
              <Link to="/explore" className="btn btn-primary btn-small">
                Find people to follow
              </Link>
            ) : null
          }
        />
      )}

      {combinedFeed && combinedFeed.length > 0 && (
        <div className="bet-feed">
          {combinedFeed.map((item) =>
            item.kind === 'tip' ? (
              <VideoCard key={item.id} post={item} />
            ) : (
              <BetCard key={item.id} post={item} variant="public" onBlocked={handleBlocked} onChanged={load} />
            )
          )}
        </div>
      )}
    </>
  )
})

export default PublicFeedView
