import { useEffect, useMemo, useState } from 'react'
import { computeGroupRecap } from '../utils/groupRecap.js'
import { fetchGroupCoachTake } from '../api/coachClient.js'
import { SparkIcon } from './icons/Icons.jsx'

// "Coach on the group's week" - an AI narrative layer on top of the numeric
// GroupRecapCard, same relationship CoachTake.jsx has to Insights' numeric
// stats. Renders nothing at all until it has something to say, so an
// unconfigured backend or a quiet week is simply invisible rather than an
// empty box. Recomputes the same recap GroupRecapCard already shows (pure,
// no I/O) rather than requiring the parent to lift and share it.
export default function GroupCoachTake({ posts, memberNames }) {
  const [state, setState] = useState({ status: 'loading' })

  const recap = useMemo(() => computeGroupRecap(posts, memberNames), [posts, memberNames])
  // Key the paid Coach call on the recap's CONTENT, not the posts array's
  // identity. GroupFeedPage rebuilds `posts` on every refresh - pull-to-refresh
  // AND each realtime feed insert - but the recap only changes when the week's
  // settled bets do, so identity-keying re-issued this paid Claude call on
  // every refresh even when the take would be byte-identical. "Free API tiers
  // are the constraint" (CLAUDE.md). The recap embeds no timestamp, so its JSON
  // is a stable content signature.
  const recapKey = recap ? JSON.stringify(recap) : null

  useEffect(() => {
    if (!recap) {
      setState({ status: 'skip' })
      return
    }
    let live = true
    fetchGroupCoachTake(recap).then((res) => {
      if (!live) return
      if (res.configured && res.take) setState({ status: 'ready', take: res.take })
      else setState({ status: 'skip' })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapKey])

  if (state.status !== 'ready') return null

  return (
    <div className="coach-card">
      <div className="coach-card-head">
        <span className="coach-card-badge">
          <SparkIcon width={16} height={16} />
        </span>
        <h2 className="coach-card-title">Coach on the group's week</h2>
      </div>
      <p className="coach-card-body">{state.take}</p>
      <p className="coach-card-foot">A read on the group's numbers — never a tip.</p>
    </div>
  )
}
