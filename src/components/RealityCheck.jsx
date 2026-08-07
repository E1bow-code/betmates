import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRealityCheckMins, REALITY_CHECK_EVENT } from '../lib/realityCheck.js'

// Periodic "you've been here a while" prompt, shown every N minutes when the
// user has opted into a reality-check interval in Account (off by default).
// Reuses the onboarding modal's styling. Mounted once in the authed shell.
export default function RealityCheck() {
  // Re-read the preference live so toggling it in Account takes effect without
  // a reload (setRealityCheckMins dispatches REALITY_CHECK_EVENT).
  const [mins, setMins] = useState(getRealityCheckMins)
  const [elapsed, setElapsed] = useState(0)
  const [open, setOpen] = useState(false)
  const sinceRef = useRef(Date.now())

  useEffect(() => {
    const sync = () => setMins(getRealityCheckMins())
    window.addEventListener(REALITY_CHECK_EVENT, sync)
    return () => window.removeEventListener(REALITY_CHECK_EVENT, sync)
  }, [])

  useEffect(() => {
    // Changing the interval (or turning it off) restarts the clock, so a
    // fresh choice always waits the full interval before its first prompt.
    sinceRef.current = Date.now()
    setOpen(false)
    if (!mins) return
    const id = setInterval(() => {
      const mElapsed = Math.floor((Date.now() - sinceRef.current) / 60000)
      if (mElapsed >= mins) {
        setElapsed(mElapsed)
        setOpen(true)
      }
    }, 20000)
    return () => clearInterval(id)
  }, [mins])

  if (!open) return null

  function keepGoing() {
    sinceRef.current = Date.now() // next prompt is another full interval away
    setOpen(false)
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-icon">⏱️</div>
        <h2 className="onboarding-title">Reality check</h2>
        <p className="onboarding-body">
          You’ve been on BetMates for about {elapsed} minute{elapsed === 1 ? '' : 's'}. A good moment to take a breath — remember
          BetMates is for comparing odds and keeping score, not chasing losses.
        </p>
        <div className="onboarding-actions">
          <Link className="btn btn-ghost" to="/account" onClick={keepGoing}>
            Safer gambling
          </Link>
          <button className="btn btn-primary" onClick={keepGoing}>
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}
