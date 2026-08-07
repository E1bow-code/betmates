import { useEffect, useState } from 'react'
import { buildCoachSummary } from '../utils/coachSummary.js'
import { fetchCoachTake } from '../api/coachClient.js'
import { shareCoachImage } from '../lib/shareImage.js'
import { useAuth } from '../context/AuthContext.jsx'

// "Coach's take" - a short, AI-written read on the user's own record. Renders
// nothing at all until it has something to say, so an unconfigured backend
// (no ANTHROPIC_API_KEY) or a too-thin history is simply invisible rather than
// an empty box. The heavy lifting - and the never-tip framing - lives in
// netlify/functions/coach.js; this just asks and displays.
export default function CoachTake({ entries }) {
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'loading' })
  const [shareStatus, setShareStatus] = useState('idle')

  async function handleShare() {
    setShareStatus('working')
    try {
      const result = await shareCoachImage({ take: state.take, name: user?.displayName })
      setShareStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setShareStatus('idle')
    } finally {
      setTimeout(() => setShareStatus('idle'), 2000)
    }
  }

  useEffect(() => {
    let live = true
    const summary = buildCoachSummary(entries)
    // Match the function's own gate so we don't fire a request that can only
    // come back empty.
    if (!(summary.settled >= 2)) {
      setState({ status: 'skip' })
      return
    }
    fetchCoachTake(summary).then((res) => {
      if (!live) return
      if (res.configured && res.take) setState({ status: 'ready', take: res.take })
      else setState({ status: 'skip' })
    })
    return () => {
      live = false
    }
  }, [entries])

  if (state.status !== 'ready') return null

  return (
    <div className="coach-card">
      <div className="coach-card-head">
        <span className="coach-card-badge">🧠</span>
        <h2 className="coach-card-title">Coach's take</h2>
      </div>
      <p className="coach-card-body">{state.take}</p>
      <div className="coach-card-actions">
        <p className="coach-card-foot">A read on your own record — never a tip.</p>
        <button className="btn btn-secondary btn-small" onClick={handleShare} disabled={shareStatus === 'working'}>
          {shareStatus === 'working' ? 'Rendering…' : shareStatus === 'downloaded' ? 'Saved!' : shareStatus === 'shared' ? 'Shared!' : 'Share'}
        </button>
      </div>
    </div>
  )
}
