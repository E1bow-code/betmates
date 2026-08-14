import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { computeStreak } from '../utils/trackerStats.js'

// Powers three things off one shared fetch: the little dot on the Social tab
// (newest post vs. a per-device "last looked" timestamp), the in-app
// notification centre (Alerts tab, a merged feed of "someone posted a bet"
// + "your bet got settled"), and a win-streak badge on the nav's Social
// icon (see BottomNav.jsx) - all built entirely from data the app already
// fetches here, no new table. The notification centre and streak are still
// one check on load, cleared on visit (streak just reflects current state,
// no "seen" concept) - but hasNewActivity and hasUnseenMessages are now
// ALSO pushed live via Supabase Realtime (dataStore.subscribeFeedActivity /
// subscribeInboxMessages, both INSERT-only postgres_changes subscriptions -
// see src/lib/dataStore.js), so those two flags can flip true while the app
// is open, not just on the next mount.

const ActivityContext = createContext(null)
const SOCIAL_SEEN_PREFIX = 'betmates:lastSeenSocial:'
const NOTIFS_SEEN_PREFIX = 'betmates:lastSeenNotifs:'
const MESSAGES_SEEN_PREFIX = 'betmates:lastSeenMessages:'
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
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false)
  const [streak, setStreak] = useState({ type: null, count: 0 })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      dataStore.listFeedForUser(userId),
      dataStore.listPublicFeed(),
      dataStore.listBetPostsByUser(userId),
      dataStore.listManualEntries(userId)
    ])
      .then(async ([feed, publicFeed, ownPosts, ownManual]) => {
        if (cancelled) return

        const ownPostById = new Map(ownPosts.map((p) => [p.id, p]))
        const comments = await dataStore.listRecentCommentsOnPosts([...ownPostById.keys()], userId).catch(() => [])
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
            userId: post.userId,
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
        for (const comment of comments) {
          if (!withinWindow(comment.createdAt)) continue
          const post = ownPostById.get(comment.betId)
          merged.push({
            id: `commented-${comment.id}`,
            kind: 'commented',
            at: comment.createdAt,
            userId: comment.userId,
            name: comment.name,
            body: comment.body,
            event: post?.selections?.[0]?.event ?? 'a bet',
            groupId: post?.groupId
          })
        }
        merged.sort((a, b) => new Date(b.at) - new Date(a.at))
        setNotifications(merged)

        const notifsLastSeen = localStorage.getItem(NOTIFS_SEEN_PREFIX + userId) ?? ''
        if (merged.length && merged[0].at > notifsLastSeen) setHasUnseenNotifications(true)

        setStreak(computeStreak([...ownPosts, ...ownManual]))
      })
      .catch(() => setNotifications([]))
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    dataStore
      .listConversations(userId)
      .then((conversations) => {
        if (cancelled) return
        const messagesLastSeen = localStorage.getItem(MESSAGES_SEEN_PREFIX + userId) ?? ''
        const unread = conversations.some((c) => c.lastFromFriend && c.lastAt > messagesLastSeen)
        setHasUnseenMessages(unread)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    return dataStore.subscribeFeedActivity(() => setHasNewActivity(true))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    return dataStore.subscribeInboxMessages(userId, (message) => {
      if (message.senderId !== userId) setHasUnseenMessages(true)
    })
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

  const markMessagesSeen = useCallback(() => {
    if (!userId) return
    localStorage.setItem(MESSAGES_SEEN_PREFIX + userId, new Date().toISOString())
    setHasUnseenMessages(false)
  }, [userId])

  return (
    <ActivityContext.Provider
      value={{
        hasNewActivity,
        markSeen,
        notifications,
        hasUnseenNotifications,
        markNotificationsSeen,
        hasUnseenMessages,
        markMessagesSeen,
        streak
      }}
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
