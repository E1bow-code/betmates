import { useEffect, useState } from 'react'
import * as dataStore from './dataStore.js'

// "How many people (visible to you - your groups + the public feed) have
// backed each side" for one fixture/fight/event - social proof, not a new
// backend aggregate: just tallies legs off the same feeds the Leaderboard
// already reads (see SocialFeedPage.jsx), matched by the exact event
// string every leg already carries. Mixes every market's picks into one
// tally since a single fixture rarely has name collisions across markets
// (Home/Away team names vs "Over 2.5" vs "Yes"/"No"), and callers only ever
// look up counts for one specific outcome at a time anyway.
export function useBacking(eventName, userId) {
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    if (!eventName || !userId) return
    let cancelled = false
    Promise.all([dataStore.listFeedForUser(userId), dataStore.listPublicFeed()]).then(([feed, pub]) => {
      if (!cancelled) setPosts([...feed, ...pub])
    })
    return () => {
      cancelled = true
    }
  }, [eventName, userId])

  if (!posts) return null

  const counts = new Map()
  let total = 0
  for (const post of posts) {
    for (const leg of post.selections) {
      if (leg.event !== eventName) continue
      counts.set(leg.selection, (counts.get(leg.selection) ?? 0) + 1)
      total++
    }
  }
  return { counts, total }
}
