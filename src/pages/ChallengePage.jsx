import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import HeadToHeadSheet from '../components/HeadToHeadSheet.jsx'

// The landing page for a shared "challenge a mate" link (src/lib/share.js's
// challengeUrl) - lands a signed-in visitor straight on the head-to-head/
// challenge view with the sender pre-selected, rather than making them go
// find that friend in the UI themselves. Unlike PublicProfilePage.jsx this
// requires being signed in AND already friends (HeadToHeadSheet's stats
// come from shared-groups-plus-public-feed posts, so there's no useful
// logged-out version of this page). A visitor who isn't yet friends with
// the sender gets a one-tap "Add as friend" instead of a dead end - the
// same growth-loop shape as a group invite link, just for a 1:1 contact.
export default function ChallengePage() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState('loading') // loading | own-code | not-found | not-friends | friend
  const [friend, setFriend] = useState(null)
  const [adding, setAdding] = useState(false)
  const runAsync = useAsyncAction()

  useEffect(() => {
    let cancelled = false
    dataStore.getProfileByFriendCode(code).then(async (target) => {
      if (cancelled) return
      if (!target) return setState('not-found')
      if (target.id === user.id) return setState('own-code')
      const friends = await dataStore.listFriends(user.id)
      if (cancelled) return
      if (friends.some((f) => f.id === target.id)) {
        setFriend(target)
        setState('friend')
      } else {
        setFriend(target)
        setState('not-friends')
      }
    })
    return () => {
      cancelled = true
    }
  }, [code, user.id])

  async function handleAddFriend() {
    setAdding(true)
    await runAsync(async () => {
      const added = await dataStore.addFriendByCode(code, user.id)
      setFriend(added)
      setState('friend')
    }, "Couldn't add them as a friend - try again")
    setAdding(false)
  }

  if (state === 'friend' && friend) {
    return <HeadToHeadSheet friend={friend} onClose={() => navigate('/groups')} />
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">BetMates</h1>
        {state === 'loading' && <p className="hint">Loading…</p>}
        {state === 'not-found' && <p className="hint">No one found with that code - the link might be out of date.</p>}
        {state === 'own-code' && <p className="hint">That's your own challenge link - share it with a friend instead.</p>}
        {state === 'not-friends' && friend && (
          <>
            <p className="hint">You'll need to be friends with {friend.displayName} first to compare records and challenge them.</p>
            <button className="btn btn-primary" onClick={handleAddFriend} disabled={adding}>
              {adding ? 'Adding…' : `Add ${friend.displayName} as a friend`}
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('/groups')}>
          Back to BetMates
        </button>
      </div>
    </div>
  )
}
