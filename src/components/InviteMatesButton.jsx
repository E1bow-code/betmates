import { useState } from 'react'
import { shareInviteImage } from '../lib/shareImage.js'
import { referralUrl } from '../lib/share.js'

// Shares a branded invite card (image + the referral join link) via the native
// share sheet, falling back to a download. Sits alongside the plain "share
// link" option - the image is the one that actually gets tapped when it lands
// in a WhatsApp group. The link it carries is the user's own referral URL, so
// anyone who joins through it counts toward their referral rewards.
export default function InviteMatesButton({ name, friendCode, label = 'Share invite card', className = 'btn btn-secondary btn-small' }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    if (!friendCode) return
    setStatus('working')
    try {
      const result = await shareInviteImage({ name, code: friendCode, url: referralUrl(friendCode) })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className={className} onClick={handleClick} disabled={status === 'working' || !friendCode}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : label}
    </button>
  )
}
