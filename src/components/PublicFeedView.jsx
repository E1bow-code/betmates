import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeTrendingPicks } from '../utils/trending.js'
import BetCard from './BetCard.jsx'
import EmptyState from './EmptyState.jsx'
import SportIcon from './icons/SportIcons.jsx'

// The public feed - anyone's "post to everyone" picks, regardless of group
// membership. Shared between HomePage (the new front door) and
// SocialFeedPage's Feed segment so both render the same thing instead of
// each fetching and rendering it independently. Owns its own fetch; exposes
// refresh() via ref for callers using PullToRefresh (SocialFeedPage) or a
// manual "load more" trigger (HomePage's post-then-land flow).
//
// `filter='following'` (from HomePage's segmented pill row) narrows the
// same fetched feed down to people the signed-in user follows, fetched
// once here rather than the per-card lookup BetCard.jsx already does for
// its own Follow-button state - two independent uses of the same
// dataStore.listFollowing call, not a shared cache.
const PublicFeedView = forwardRef(function PublicFeedView({ filter = 'all' }, ref) {
  const { user } = useAuth()
  const [publicFeed, setPublicFeed] = useState(null)
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
    return dataStore.listPublicFeed(user.id).then(setPublicFeed)
  }

  useImperativeHandle(ref, () => ({ refresh: load }))

  const trendingPicks = useMemo(() => (publicFeed ? computeTrendingPicks(publicFeed) : []), [publicFeed])

  const visibleFeed = useMemo(() => {
    if (!publicFeed || filter !== 'following') return publicFeed
    if (!followedIds) return null
    return publicFeed.filter((p) => followedIds.includes(p.userId))
  }, [publicFeed, filter, followedIds])

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

      {visibleFeed === null && <div className="loading">Catching up on the feed…</div>}
      {visibleFeed && !visibleFeed.length && (
        <EmptyState
          icon="📣"
          title="Nothing here yet"
          subtitle={filter === 'following' ? "Follow a few people to see their picks here." : 'Be the first to post a pick for everyone to see.'}
        />
      )}

      {visibleFeed && visibleFeed.length > 0 && (
        <div className="bet-feed">
          {visibleFeed.map((post) => (
            <BetCard key={post.id} post={post} variant="public" onBlocked={handleBlocked} onChanged={load} />
          ))}
        </div>
      )}
    </>
  )
})

export default PublicFeedView
