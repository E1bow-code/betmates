import { useState } from 'react'
import { shareBadBeatImage } from '../lib/shareImage.js'

// "Share the agony" - renders the bad-beat PNG (renderBadBeatImage) for a
// one-leg-away multi and fires the share sheet. Near-misses are as shareable
// as wins, so this is the loss-side counterpart to ShareWinButton. Group-less
// (a bad beat isn't reliably group-scoped), so it takes just the beat.
export default function ShareBadBeatButton({ beat }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    setStatus('working')
    try {
      const result = await shareBadBeatImage(beat)
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-ghost btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : '😩 Share the agony'}
    </button>
  )
}
