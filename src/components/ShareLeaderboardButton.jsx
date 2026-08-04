import { useState } from 'react'
import { shareLeaderboardImage } from '../lib/shareImage.js'

export default function ShareLeaderboardButton({ name, rank, profit, winRate, roi, windowLabel }) {
  const [status, setStatus] = useState('idle')

  async function handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    setStatus('working')
    try {
      const result = await shareLeaderboardImage({ name, rank, profit, winRate, roi, windowLabel })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-ghost btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : 'Share'}
    </button>
  )
}
