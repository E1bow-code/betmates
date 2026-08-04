import { useState } from 'react'
import { shareRecapImage } from '../lib/shareImage.js'

export default function ShareRecapButton({ rows, periodLabel }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    setStatus('working')
    try {
      const result = await shareRecapImage({ rows, periodLabel })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-secondary btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : 'Share recap'}
    </button>
  )
}
