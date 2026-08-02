import { useState } from 'react'
import { shareBetSlipImage } from '../lib/shareImage.js'

export default function ShareImageButton({ post }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    setStatus('working')
    try {
      const result = await shareBetSlipImage(post)
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-ghost btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : 'Share image'}
    </button>
  )
}
