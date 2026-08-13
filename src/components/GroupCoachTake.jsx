import { useEffect, useState } from 'react'
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

  useEffect(() => {
    let live = true
    const recap = computeGroupRecap(posts, memberNames)
    if (!recap) {
      setState({ status: 'skip' })
      return
    }
    fetchGroupCoachTake(recap).then((res) => {
      if (!live) return
      if (res.configured && res.take) setState({ status: 'ready', take: res.take })
      else setState({ status: 'skip' })
    })
    return () => {
      live = false
    }
  }, [posts, memberNames])

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
