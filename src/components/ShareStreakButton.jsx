import { useState } from 'react'
import { shareStreakImage } from '../lib/shareImage.js'

// "Share streak" - renders the win-streak flex card (renderStreakImage) and
// fires the share sheet. Shown from the Tracker when the current run is a win
// streak worth shouting about; the count comes from computeStreak.
export default function ShareStreakButton({ name, count }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    setStatus('working')
    try {
      const result = await shareStreakImage({ name, count })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-ghost btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : '🔥 Share streak'}
    </button>
  )
}
