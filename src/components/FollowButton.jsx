import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAsyncAction } from '../lib/useAsyncAction.js'

// Kickoff reminder + result notification for a fixture with no bet
// attached - separate from the odds-target alert bell (that's about a
// price; this is about the fixture itself). See followFixture in
// dataStore.js, and alert-checks.js on the sending side.
export default function FollowButton({ sport, eventId, eventLabel, kickoff }) {
  const { user } = useAuth()
  const [following, setFollowing] = useState(null)
  const [busy, setBusy] = useState(false)
  const runAsync = useAsyncAction()

  useEffect(() => {
    let cancelled = false
    dataStore.isFollowingFixture(user.id, sport, eventId).then((v) => {
      if (!cancelled) setFollowing(v)
    })
    return () => {
      cancelled = true
    }
  }, [user.id, sport, eventId])

  async function toggle() {
    setBusy(true)
    const ok = await runAsync(
      () =>
        following
          ? dataStore.unfollowFixture(user.id, sport, eventId)
          : dataStore.followFixture(user.id, { sport, eventId, eventLabel, kickoff }),
      `Couldn't ${following ? 'unfollow' : 'follow'} - try again`
    )
    setBusy(false)
    if (ok) setFollowing((f) => !f)
  }

  if (following === null) return null

  return (
    <button className="btn btn-ghost btn-small follow-fixture-btn" onClick={toggle} disabled={busy} type="button">
      {following ? '★ Following' : '☆ Follow'}
    </button>
  )
}
