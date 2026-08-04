import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'

// Powers two things off one shared fetch: the little dot on the Social tab
// (unchanged from before - newest post vs. a per-device "last looked"
// timestamp) and the in-app notification centre (Alerts tab), a merged feed
// of "someone posted a bet" + "your bet got settled" built entirely from
// data the app already fetches elsewhere - no new table, no push
// infrastructure, just composing what's already there. No push/realtime
// either way - one check on load, cleared on visit.

const ActivityContext = createContext(null)
const SOCIAL_SEEN_PREFIX = 'betmates:lastSeenSocial:'
const NOTIFS_SEEN_PREFIX = 'betmates:lastSeenNotifs:'
const WINDOW_DAYS = 14

function withinWindow(dateStr) {
  if (!dateStr) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)
  return new Date(dateStr) >= cutoff
}

export function ActivityProvider({ userId, children }) {
  const [hasNewActivity, setHasNewActivity] = useState(false)
  const [notifications, setNotifications] = useState(null)
  const [hasUnseenNotifications, setHasUnseenNotifications] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      dataStore.listFeedForUser(userId),
      dataStore.listPublicFeed(),
      dataStore.listBetPostsByUser(userId),
      dataStore.listManualEntries(userId)
    ])
      .then(([feed, publicFeed, ownPosts, ownManual]) => {
        if (cancelled) return

        const newest = [...feed, ...publicFeed].reduce((max, p) => (p.createdAt > max ? p.createdAt : max), '')
        const socialLastSeen = localStorage.getItem(SOCIAL_SEEN_PREFIX + userId) ?? ''
        if (newest && newest > socialLastSeen) setHasNewActivity(true)

        const merged = []
        for (const post of [...feed, ...publicFeed]) {
          if (post.userId === userId || !withinWindow(post.createdAt)) continue
          merged.push({
            id: `posted-${post.id}`,
            kind: 'posted',
            at: post.createdAt,
            name: post.memberNames?.[post.userId] ?? post.authorName ?? 'Someone',
            event: post.selections?.[0]?.event ?? 'a bet',
            groupId: post.groupId
          })
        }
        for (const entry of [...ownPosts, ...ownManual]) {
          if (entry.status === 'open' || !withinWindow(entry.settledAt)) continue
          merged.push({
            id: `settled-${entry.id}`,
            kind: 'settled',
            at: entry.settledAt,
            status: entry.status,
            event: entry.selections?.[0]?.event ?? 'a bet'
          })
        }
        merged.sort((a, b) => new Date(b.at) - new Date(a.at))
        setNotifications(merged)

        const notifsLastSeen = localStorage.getItem(NOTIFS_SEEN_PREFIX + userId) ?? ''
        if (merged.length && merged[0].at > notifsLastSeen) setHasUnseenNotifications(true)
      })
      .catch(() => setNotifications([]))
    return () => {
      cancelled = true
    }
  }, [userId])

  const markSeen = useCallback(() => {
    if (!userId) return
    localStorage.setItem(SOCIAL_SEEN_PREFIX + userId, new Date().toISOString())
    setHasNewActivity(false)
  }, [userId])

  const markNotificationsSeen = useCallback(() => {
    if (!userId) return
    localStorage.setItem(NOTIFS_SEEN_PREFIX + userId, new Date().toISOString())
    setHasUnseenNotifications(false)
  }, [userId])

  return (
    <ActivityContext.Provider
      value={{ hasNewActivity, markSeen, notifications, hasUnseenNotifications, markNotificationsSeen }}
    >
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivity() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider')
  return ctx
}
