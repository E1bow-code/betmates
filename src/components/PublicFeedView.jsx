import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeTrendingPicks } from '../utils/trending.js'
import BetCard from './BetCard.jsx'
import VideoCard from './VideoCard.jsx'
import EmptyState from './EmptyState.jsx'
import SportIcon from './icons/SportIcons.jsx'

// The public feed - anyone's "post to everyone" picks, regardless of group
// membership - interleaved with the viewer's Tips (video_posts, strictly
// friend-scoped by RLS - see schema.sql, no public tier exists for them).
// Shared between HomePage (the new front door) and SocialFeedPage's Feed
// segment so both render the same thing instead of each fetching and
// rendering it independently. Owns its own fetch; exposes refresh() via
// ref for callers using PullToRefresh (SocialFeedPage) or a manual
// "load more"/record-a-tip trigger (HomePage's post-then-land flow).
//
// `filter='following'` (from HomePage's segmented pill row) narrows the
// bet-post half down to people the signed-in user follows, fetched once
// here rather than the per-card lookup BetCard.jsx already does for its
// own Follow-button state - two independent uses of the same
// dataStore.listFollowing call, not a shared cache. Tips have no
// "following" relation (only friendship, already a small curated set), so
// they render on both All and Following regardless of this toggle.
const PublicFeedView = forwardRef(function PublicFeedView({ filter = 'all' }, ref) {
  const { user } = useAuth()
  const [publicFeed, setPublicFeed] = useState(null)
  const [tipsFeed, setTipsFeed] = useState(null)
  const [followedIds, setFollowedIds] = useState(null)

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

  const trendingPicks = useMemo(() => (publicFeed ? computeTrendingPicks(publicFeed) : []), [publicFeed])

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
      {filter === 'all' && (
        <p className="hint">
          Everyone's picks - tap a price on the Odds tab and choose "Post to everyone" to add yours. Posting to a group
          instead keeps it just between you and your mates.
        </p>
      )}

      {filter === 'all' && trendingPicks.length > 0 && (
        <div className="account-section">
          <h2 className="market-title">🔥 Trending this week</h2>
          <div className="trending-row">
            {trendingPicks.map((pick, i) => (
              <div key={pick.key} className="trending-chip">
                <span className="trending-chip-rank">{i + 1}</span>
                <SportIcon sport={pick.sport} size={18} />
                <div>
                  <div className="trending-chip-pick">{pick.selection}</div>
                  <div className="trending-chip-meta">
                    {pick.event} · {pick.count} backing this
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {combinedFeed === null && <div className="loading">Catching up on the feed…</div>}
      {combinedFeed && !combinedFeed.length && (
        <EmptyState
          icon="📣"
          title="Nothing here yet"
          subtitle={filter === 'following' ? "Follow a few people to see their picks here." : 'Be the first to post a pick for everyone to see.'}
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
