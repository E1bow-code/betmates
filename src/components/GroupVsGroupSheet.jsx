import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import UserLink from './UserLink.jsx'
import { MedalIcon } from './icons/Icons.jsx'
import { backdropDismissProps } from '../lib/sheetDismiss.js'

// Compares two of the user's own groups head-to-head - same aggregate math
// as Leaderboard.jsx (scoped to one group's members) and HeadToHeadSheet.jsx
// (scoped to two people), just summed across every member of each group
// instead. Unlike HeadToHeadSheet's shared-groups visibility filtering,
// every post listBetPosts(groupId) returns is already something a fellow
// member can see, so there's no extra filtering needed here beyond the
// existing hidden-stake rule every other leaderboard already applies.

export default function GroupVsGroupSheet({ groups, onClose }) {
  const [groupAId, setGroupAId] = useState(groups[0].id)
  const [groupBId, setGroupBId] = useState(groups.find((g) => g.id !== groups[0].id)?.id ?? groups[0].id)
  const [totals, setTotals] = useState(null)
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)

  useEffect(() => {
    if (groupAId === groupBId) return
    setTotals(null)
    Promise.all([loadGroupTotals(groupAId), loadGroupTotals(groupBId)]).then(([a, b]) => setTotals({ a, b }))
  }, [groupAId, groupBId])

  async function loadGroupTotals(groupId) {
    const [posts, members] = await Promise.all([dataStore.listBetPosts(groupId), dataStore.listGroupMembers(groupId)])
    const names = Object.fromEntries(members.map((m) => [m.id, m.displayName]))
    const visible = posts.filter((p) => !p.stakeHidden)
    const stats = computeStats(visible)
    const topBettor = topByProfit(visible, names)
    return { stats, topBettor }
  }

  function topByProfit(posts, names) {
    const byUser = new Map()
    for (const post of posts) {
      if (!byUser.has(post.userId)) byUser.set(post.userId, [])
      byUser.get(post.userId).push(post)
    }
    const ranked = [...byUser.entries()]
      .map(([userId, userPosts]) => ({ userId, name: names[userId] ?? 'Someone', ...computeStats(userPosts) }))
      .filter((row) => row.settledCount > 0 && row.profit > 0)
      .sort((a, b) => b.profit - a.profit)
    return ranked[0] ?? null
  }

  const groupA = groups.find((g) => g.id === groupAId)
  const groupB = groups.find((g) => g.id === groupBId)
  const samePick = groupAId === groupBId

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} {...backdropDismissProps(requestClose)}>
      <div className={`sheet${closing ? ' closing' : ''}`}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Group vs. group</h2>
        <p className="hint">Combined P&amp;L across every settled bet in each group - hidden-stake bets don't count.</p>

        <div className="inline-form">
          <select value={groupAId} onChange={(e) => setGroupAId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <span className="friend-chip-vs">vs</span>
          <select value={groupBId} onChange={(e) => setGroupBId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {samePick && <p className="hint">Pick two different groups to compare.</p>}
        {!samePick && !totals && <div className="loading">Adding it up…</div>}

        {!samePick && totals && (
          <div className="h2h-grid">
            <div className="h2h-col">
              <div className="h2h-name">{groupA.name}</div>
              <GroupTotals totals={totals.a} />
            </div>
            <div className="h2h-col">
              <div className="h2h-name">{groupB.name}</div>
              <GroupTotals totals={totals.b} />
            </div>
          </div>
        )}

        <button className="btn btn-ghost" onClick={requestClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function GroupTotals({ totals }) {
  const { stats, topBettor } = totals
  if (!stats.settledCount) {
    return <div className="h2h-empty">Nothing settled yet</div>
  }
  return (
    <>
      <div className={`h2h-stat ${stats.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
        {stats.profit >= 0 ? '+' : ''}£{stats.profit.toFixed(2)}
      </div>
      <div className="h2h-stat-label">Combined P&amp;L</div>
      <div className="h2h-meta">{stats.winRate === null ? '-' : `${stats.winRate}% win rate`}</div>
      <div className="h2h-meta">{stats.roi === null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}% ROI`}</div>
      <div className="h2h-meta">{stats.settledCount} settled</div>
      {topBettor && (
        <div className="h2h-meta icon-row">
          <MedalIcon width={14} height={14} /> <UserLink id={topBettor.userId} displayName={topBettor.name} /> +£{topBettor.profit.toFixed(2)}
        </div>
      )}
    </>
  )
}
