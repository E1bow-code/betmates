import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as dataStore from '../lib/dataStore.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import Leaderboard from '../components/Leaderboard.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function GroupFeedPage() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [posts, setPosts] = useState(null)
  const [items, setItems] = useState(null) // bets + shared videos, merged and sorted
  const [memberNames, setMemberNames] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.getGroup(id), dataStore.listBetPosts(id), dataStore.listGroupMembers(id), dataStore.listSharedInGroup(id)])
      .then(([g, betPosts, members, videos]) => {
        setGroup(g)
        setPosts(betPosts)
        setMemberNames(Object.fromEntries(members.map((m) => [m.id, m.displayName])))
        const merged = [
          ...betPosts.map((p) => ({ kind: 'bet', sortAt: p.createdAt, data: p })),
          ...videos.map((v) => ({ kind: 'video', sortAt: v.sharedAt, data: v }))
        ].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt))
        setItems(merged)
      })
      .catch((err) => setError(err.message))
  }, [id])

  return (
    <div>
      <div className="topbar">
        <Link to="/groups" className="back">
          &larr; Social
        </Link>
        <h1>{group?.name ?? 'Group'}</h1>
        {group && <div className="race-header-meta">Invite code: {group.inviteCode}</div>}
      </div>

      {error && <div className="error">Hmm, couldn't load this group: {error}</div>}
      {!error && items === null && <div className="loading">Catching up on the feed…</div>}
      {posts && posts.length > 0 && <Leaderboard posts={posts} memberNames={memberNames} />}
      {items && !items.length && (
        <EmptyState
          icon="💬"
          title="Nothing posted here yet"
          subtitle="Head to the Odds tab and tap a price to get things started."
        />
      )}

      {items && items.length > 0 && (
        <div className="bet-feed">
          {items.map((item) =>
            item.kind === 'bet' ? (
              <BetCard key={`bet-${item.data.id}`} post={item.data} memberNames={memberNames} />
            ) : (
              <VideoCard key={`video-${item.data.id}-${item.data.sharedAt}`} post={item.data} />
            )
          )}
        </div>
      )}
    </div>
  )
}
