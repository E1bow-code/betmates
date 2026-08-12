import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import ChallengeSection from './ChallengeSection.jsx'

// Compares two people using only bets both of them could actually see -
// their shared groups' posts plus the public feed - not either person's
// private tracker entries, since those were never visible to the other
// person to begin with and wouldn't be a fair "you vs them" either way.
// Keeps the raw filtered post arrays in state (not just their all-time
// stats) so ChallengeSection below can re-window them itself for a
// time-boxed challenge, rather than fetching everything a second time.

export default function HeadToHeadSheet({ friend, onClose }) {
  const { user } = useAuth()
  const [posts, setPosts] = useState(null)
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)

  useEffect(() => {
    Promise.all([dataStore.listFeedForUser(user.id), dataStore.listPublicFeed()]).then(([feed, publicFeed]) => {
      const visible = [...feed, ...publicFeed].filter((p) => !p.stakeHidden)
      const mine = visible.filter((p) => p.userId === user.id)
      const theirs = visible.filter((p) => p.userId === friend.id)
      setPosts({ mine, theirs })
    })
  }, [user.id, friend.id])

  const rows = posts && { mine: computeStats(posts.mine), theirs: computeStats(posts.theirs) }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">You vs {friend.displayName}</h2>
        <p className="hint">Only counts bets you'd both actually see - shared groups and the public feed.</p>

        {!rows && <div className="loading">Adding it up…</div>}

        {rows && (
          <>
            <div className="h2h-grid">
              <div className="h2h-col">
                <div className="h2h-name">You</div>
                <H2HStats stats={rows.mine} />
              </div>
              <div className="h2h-col">
                <div className="h2h-name">{friend.displayName}</div>
                <H2HStats stats={rows.theirs} />
              </div>
            </div>

            <ChallengeSection user={user} friend={friend} myPosts={posts.mine} theirPosts={posts.theirs} />
          </>
        )}

        <button className="btn btn-ghost" onClick={requestClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function H2HStats({ stats }) {
  if (!stats.settledCount) {
    return <div className="h2h-empty">Nothing settled yet</div>
  }
  return (
    <>
      <div className={`h2h-stat ${stats.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
        {stats.profit >= 0 ? '+' : ''}£{stats.profit.toFixed(2)}
      </div>
      <div className="h2h-stat-label">P&L</div>
      <div className="h2h-meta">{stats.winRate === null ? '-' : `${stats.winRate}% win rate`}</div>
      <div className="h2h-meta">{stats.roi === null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}% ROI`}</div>
      <div className="h2h-meta">{stats.settledCount} settled</div>
    </>
  )
}
