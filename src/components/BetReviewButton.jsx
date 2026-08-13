import { useState } from 'react'
import { fetchBetReview } from '../api/coachClient.js'
import { SparkIcon } from './icons/Icons.jsx'

// "Ask Coach" - an on-request AI reaction to ONE settled Tracker bet (the
// pick, the price, the result). Unlike CoachTake.jsx's silent "render
// nothing if there's nothing to say" (a passive card that just doesn't
// appear), this is triggered by an explicit click, so it always ends in a
// visible state - the take, or a quiet "nothing to add" - rather than doing
// nothing, which would read as a broken button.
export default function BetReviewButton({ entry }) {
  const [state, setState] = useState({ status: 'idle' })

  async function handleClick() {
    if (state.status === 'ready' || state.status === 'empty') {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    const res = await fetchBetReview({
      selections: entry.selections,
      stake: entry.stake,
      potentialReturn: entry.potentialReturn,
      status: entry.status
    })
    if (res.configured && res.take) setState({ status: 'ready', take: res.take })
    else setState({ status: 'empty' })
  }

  return (
    <div className="bet-review">
      <button className="btn btn-ghost btn-small icon-row" onClick={handleClick} disabled={state.status === 'loading'}>
        {state.status === 'loading' ? (
          'Asking…'
        ) : state.status === 'ready' || state.status === 'empty' ? (
          'Hide Coach'
        ) : (
          <>
            <SparkIcon width={14} height={14} /> Ask Coach
          </>
        )}
      </button>
      {state.status === 'ready' && <p className="bet-review-take">{state.take}</p>}
      {state.status === 'empty' && <p className="bet-review-empty">Coach has nothing to add on this one.</p>}
    </div>
  )
}
