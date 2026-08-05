import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { useAuth } from '../context/AuthContext.jsx'

// A standing "always show me this team/player" preference - distinct from
// FollowButton (which follows one specific upcoming fixture). Surfaced as
// the "My teams only" filter on OddsListPage. Deliberately just a plain
// star icon with no label, since it sits inline next to a team/player name
// on detail pages rather than in its own row.
export default function FollowParticipantButton({ sport, name }) {
  const { user } = useAuth()
  const [following, setFollowing] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    dataStore.listFollowedParticipants(user.id).then((list) => {
      if (!cancelled) setFollowing(list.some((p) => p.sport === sport && p.name === name))
    })
    return () => {
      cancelled = true
    }
  }, [user.id, sport, name])

  async function toggle() {
    setBusy(true)
    try {
      if (following) {
        await dataStore.unfollowParticipant(user.id, sport, name)
        setFollowing(false)
      } else {
        await dataStore.followParticipant(user.id, sport, name)
        setFollowing(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (following === null) return null

  return (
    <button
      className={following ? 'follow-participant-btn active' : 'follow-participant-btn'}
      onClick={toggle}
      disabled={busy}
      type="button"
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
      title={following ? `Following ${name}` : `Follow ${name}`}
    >
      {following ? '★' : '☆'}
    </button>
  )
}
