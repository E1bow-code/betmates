import { useState } from 'react'
import { shareChallengeInviteImage } from '../lib/shareImage.js'
import { challengeUrl } from '../lib/share.js'

// "Challenge a mate to beat this" - fires off a gauntlet card (the sender's
// headline record + a challenge deep-link) via the native share sheet. The
// link is the sender's own challengeUrl, so whoever opens it lands on
// ChallengePage: add the sender as a friend (if not already) and drop straight
// into the head-to-head. Top-of-funnel twin of ChallengeSection's result share.
export default function ChallengeMateButton({ name, friendCode, statLabel, statValue, className = 'btn btn-secondary btn-small' }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    if (!friendCode) return
    setStatus('working')
    try {
      const result = await shareChallengeInviteImage({ name, statLabel, statValue, code: friendCode, url: challengeUrl(friendCode) })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className={className} onClick={handleClick} disabled={status === 'working' || !friendCode}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : '⚔️ Challenge a mate'}
    </button>
  )
}
