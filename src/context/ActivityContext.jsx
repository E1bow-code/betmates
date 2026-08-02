import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'

// Powers the little dot on the Social tab: on login, checks whether
// anything in the user's groups or the public feed is newer than the
// last time they actually looked at the Social tab (a per-user
// localStorage timestamp, not synced anywhere - purely a "have I looked
// at this on THIS device" marker, same spirit as an unread badge). No
// push/realtime infra - just one check on load, cleared on visit.

const ActivityContext = createContext(null)
const STORAGE_PREFIX = 'betmates:lastSeenSocial:'

export function ActivityProvider({ userId, children }) {
  const [hasNewActivity, setHasNewActivity] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([dataStore.listFeedForUser(userId), dataStore.listPublicFeed()])
      .then(([feed, publicFeed]) => {
        if (cancelled) return
        const newest = [...feed, ...publicFeed].reduce((max, p) => (p.createdAt > max ? p.createdAt : max), '')
        const lastSeen = localStorage.getItem(STORAGE_PREFIX + userId) ?? ''
        if (newest && newest > lastSeen) setHasNewActivity(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  const markSeen = useCallback(() => {
    if (!userId) return
    localStorage.setItem(STORAGE_PREFIX + userId, new Date().toISOString())
    setHasNewActivity(false)
  }, [userId])

  return <ActivityContext.Provider value={{ hasNewActivity, markSeen }}>{children}</ActivityContext.Provider>
}

export function useActivity() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider')
  return ctx
}
