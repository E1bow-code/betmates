import { useState } from 'react'
import { shareWinImage } from '../lib/shareImage.js'
import { groupInviteUrl } from '../lib/share.js'
import * as dataStore from '../lib/dataStore.js'

// "Share this win" - renders the celebratory PNG (see renderWinImage) and
// fires the share sheet. When the winning post belongs to a group, we resolve
// the group so the card carries its name + invite code and the share text
// carries the tappable /join link - turning a win into an invite. Manual
// entries have no groupId, so they share a group-less win card just fine.
export default function ShareWinButton({ post }) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    setStatus('working')
    try {
      let groupName
      let inviteCode
      let url
      if (post.groupId) {
        const group = await dataStore.getGroup(post.groupId).catch(() => null)
        if (group) {
          groupName = group.name
          inviteCode = group.inviteCode
          url = group.inviteCode ? groupInviteUrl(group.inviteCode) : undefined
        }
      }
      const result = await shareWinImage(post, { groupName, inviteCode, url })
      setStatus(result === 'downloaded' ? 'downloaded' : 'shared')
    } catch {
      setStatus('idle')
    } finally {
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button className="btn btn-ghost btn-small" onClick={handleClick} disabled={status === 'working'}>
      {status === 'working' ? 'Rendering…' : status === 'downloaded' ? 'Saved!' : status === 'shared' ? 'Shared!' : '🎉 Share win'}
    </button>
  )
}
