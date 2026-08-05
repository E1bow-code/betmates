// localStorage-backed mock backend. Used when Supabase isn't configured
// (no VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) so the app is fully
// clickable in dev before a real project exists. Mirrors the async shape
// of the Supabase-backed functions in dataStore.js - swapping one for the
// other requires no UI changes. NOT for production use: "auth" here is
// unhashed and purely local to the browser.

const DB_KEY = 'betmates.db'
const SESSION_KEY = 'betmates.session'

const EMPTY_DB = {
  users: [],
  groups: [],
  groupMembers: [],
  betPosts: [],
  betCopies: [],
  reactions: [],
  comments: [],
  manualEntries: [],
  friendships: [],
  videoPosts: [],
  videoShares: [],
  follows: [],
  groupMessages: [],
  blocks: [],
  postReports: [],
  directMessages: [],
  oddsAlerts: [],
  followedFixtures: [],
  followedParticipants: []
}

// Merges in any table keys added after a browser's db was first created -
// otherwise an older stored db missing e.g. `friendships` would crash the
// first time a newer function tries to read it.
function readDb() {
  const raw = localStorage.getItem(DB_KEY)
  return raw ? { ...EMPTY_DB, ...JSON.parse(raw) } : { ...EMPTY_DB }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function delay(value) {
  return Promise.resolve(value)
}

// --- Auth -------------------------------------------------------------

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return delay(null)
  return delay(syncSessionOnLoad(JSON.parse(raw)))
}

// Runs on every session load: backfills a friendCode for accounts created
// before the friends feature shipped, and strips out the demo "Jamie"/
// "Alex" seed content (see removeDemoContent) now that it's been removed -
// existing accounts that already got seeded need this cleanup, not just
// new sign-ups skipping it.
function syncSessionOnLoad(user) {
  const db = readDb()
  let changed = removeDemoContent(db)

  if (!user.friendCode) {
    const record = db.users.find((u) => u.id === user.id)
    const friendCode = Math.random().toString(36).slice(2, 8).toUpperCase()
    if (record) record.friendCode = friendCode
    user.friendCode = friendCode
    changed = true
  }

  if (changed) {
    writeDb(db)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  }
  return user
}

// One-time cleanup: removes the "The Lads" demo group, its bet posts/
// reactions/comments, and the bot_jamie/bot_alex accounts + friendships.
// Idempotent and cheap to call on every load - the bot-id check below
// short-circuits once a browser has already been cleaned.
function removeDemoContent(db) {
  const botIds = ['bot_jamie', 'bot_alex']
  if (!db.users.some((u) => botIds.includes(u.id))) return false

  const demoGroup = db.groups.find((g) => g.inviteCode === 'DEMO01')
  if (demoGroup) {
    const demoBetIds = db.betPosts.filter((b) => b.groupId === demoGroup.id).map((b) => b.id)
    db.betPosts = db.betPosts.filter((b) => b.groupId !== demoGroup.id)
    db.reactions = db.reactions.filter((r) => !demoBetIds.includes(r.betId))
    db.comments = db.comments.filter((c) => !demoBetIds.includes(c.betId))
    db.groupMembers = db.groupMembers.filter((m) => m.groupId !== demoGroup.id)
    db.groups = db.groups.filter((g) => g.id !== demoGroup.id)
  }
  db.friendships = db.friendships.filter((f) => !botIds.includes(f.userA) && !botIds.includes(f.userB))
  db.users = db.users.filter((u) => !botIds.includes(u.id))
  return true
}

export function signUp({ email, displayName, dob, referredByCode }) {
  const age = ageFromDob(dob)
  if (age < 18) return Promise.reject(new Error('You must be 18 or older to use BetMates.'))

  const db = readDb()
  if (db.users.some((u) => u.email === email)) {
    return Promise.reject(new Error('An account with that email already exists.'))
  }
  const referrer = referredByCode ? db.users.find((u) => u.friendCode === referredByCode.trim().toUpperCase()) : null
  const user = {
    id: uid('user'),
    email,
    displayName,
    dob,
    bookmakerPrefs: [],
    notificationPrefs: { betPosted: true, betSettled: true, oddsMoved: false, kickoffReminders: false },
    friendCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    acceptedTermsAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isAdmin: false,
    avatarUrl: null,
    stakeLimitAmount: null,
    stakeLimitPeriod: null,
    referredBy: referrer?.id ?? null
  }
  db.users.push(user)
  writeDb(db)
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return delay(user)
}

export function signIn({ email }) {
  const db = readDb()
  const user = db.users.find((u) => u.email === email)
  if (!user) return Promise.reject(new Error('No account found for that email.'))
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return delay(user)
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
  return delay(null)
}

// Mirrors netlify/functions/delete-account.js: groups this user created
// get handed to their longest-standing other member, or deleted outright
// if they were the only one in it, before the user's own rows are removed.
export function deleteAccount(userId) {
  const db = readDb()

  for (const group of db.groups.filter((g) => g.createdBy === userId)) {
    const others = db.groupMembers
      .filter((m) => m.groupId === group.id && m.userId !== userId)
      .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    if (others.length) {
      group.createdBy = others[0].userId
    } else {
      const betIds = db.betPosts.filter((b) => b.groupId === group.id).map((b) => b.id)
      db.betPosts = db.betPosts.filter((b) => b.groupId !== group.id)
      db.reactions = db.reactions.filter((r) => !betIds.includes(r.betId))
      db.comments = db.comments.filter((c) => !betIds.includes(c.betId))
      db.groupMessages = db.groupMessages.filter((m) => m.groupId !== group.id)
      db.groupMembers = db.groupMembers.filter((m) => m.groupId !== group.id)
      db.groups = db.groups.filter((g) => g.id !== group.id)
    }
  }

  const ownBetIds = db.betPosts.filter((b) => b.userId === userId).map((b) => b.id)
  db.groupMembers = db.groupMembers.filter((m) => m.userId !== userId)
  db.betPosts = db.betPosts.filter((b) => b.userId !== userId)
  db.betCopies = db.betCopies.filter((c) => c.copyingUserId !== userId && !ownBetIds.includes(c.originalBetId))
  db.reactions = db.reactions.filter((r) => r.userId !== userId && !ownBetIds.includes(r.betId))
  db.comments = db.comments.filter((c) => c.userId !== userId && !ownBetIds.includes(c.betId))
  db.manualEntries = db.manualEntries.filter((e) => e.userId !== userId)
  db.friendships = db.friendships.filter((f) => f.userA !== userId && f.userB !== userId)
  db.follows = db.follows.filter((f) => f.followerId !== userId && f.followingId !== userId)
  db.videoPosts = db.videoPosts.filter((v) => v.authorId !== userId)
  db.videoShares = db.videoShares.filter((s) => s.sharedByUserId !== userId)
  db.groupMessages = db.groupMessages.filter((m) => m.userId !== userId)
  db.blocks = db.blocks.filter((b) => b.blockerId !== userId && b.blockedId !== userId)
  db.postReports = db.postReports.filter((r) => r.reporterId !== userId)
  db.users = db.users.filter((u) => u.id !== userId)

  writeDb(db)
  localStorage.removeItem(SESSION_KEY)
  return delay(true)
}

function ageFromDob(dob) {
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

// --- Groups -------------------------------------------------------------

export function listMyGroups(userId) {
  const db = readDb()
  const groupIds = db.groupMembers.filter((m) => m.userId === userId).map((m) => m.groupId)
  return delay(db.groups.filter((g) => groupIds.includes(g.id)))
}

export function getGroup(groupId) {
  const db = readDb()
  return delay(db.groups.find((g) => g.id === groupId) || null)
}

export function createGroup(name, userId) {
  const db = readDb()
  const group = {
    id: uid('group'),
    name,
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdBy: userId,
    createdAt: new Date().toISOString()
  }
  db.groups.push(group)
  db.groupMembers.push({ groupId: group.id, userId, joinedAt: group.createdAt })
  writeDb(db)
  return delay(group)
}

export function joinGroupByCode(code, userId) {
  const db = readDb()
  const group = db.groups.find((g) => g.inviteCode.toUpperCase() === code.trim().toUpperCase())
  if (!group) return Promise.reject(new Error('No group found with that invite code.'))
  const already = db.groupMembers.some((m) => m.groupId === group.id && m.userId === userId)
  if (!already) {
    db.groupMembers.push({ groupId: group.id, userId, joinedAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(group)
}

export function listGroupMembers(groupId) {
  const db = readDb()
  const memberIds = db.groupMembers.filter((m) => m.groupId === groupId).map((m) => m.userId)
  return delay(
    db.users.filter((u) => memberIds.includes(u.id)).map((u) => ({ id: u.id, displayName: u.displayName }))
  )
}

export function leaveGroup(groupId, userId) {
  const db = readDb()
  db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === groupId && m.userId === userId))
  writeDb(db)
  return delay(true)
}

export function renameGroup(groupId, name) {
  const db = readDb()
  const group = db.groups.find((g) => g.id === groupId)
  if (group) {
    group.name = name
    writeDb(db)
  }
  return delay(group || null)
}

export function removeGroupMember(groupId, memberId, requesterId) {
  const db = readDb()
  const group = db.groups.find((g) => g.id === groupId)
  if (!group || group.createdBy !== requesterId) return Promise.reject(new Error('Only the group creator can remove members.'))
  db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === groupId && m.userId === memberId))
  writeDb(db)
  return delay(true)
}

// --- Group chat -------------------------------------------------------

export function listGroupMessages(groupId) {
  const db = readDb()
  return delay(db.groupMessages.filter((m) => m.groupId === groupId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
}

export function sendGroupMessage(groupId, userId, body) {
  const db = readDb()
  const message = { id: uid('msg'), groupId, userId, body, createdAt: new Date().toISOString() }
  db.groupMessages.push(message)
  writeDb(db)
  return delay(message)
}

// --- Direct messages ---------------------------------------------------

export function getProfileById(userId) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  return delay(user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null } : null)
}

export function listDirectMessages(userId, friendId) {
  const db = readDb()
  return delay(
    db.directMessages
      .filter((m) => (m.senderId === userId && m.recipientId === friendId) || (m.senderId === friendId && m.recipientId === userId))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  )
}

export function sendDirectMessage(userId, friendId, body) {
  const db = readDb()
  const message = { id: uid('dm'), senderId: userId, recipientId: friendId, body, createdAt: new Date().toISOString() }
  db.directMessages.push(message)
  writeDb(db)
  return delay(message)
}

export function listConversations(userId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, { displayName: u.displayName, avatarUrl: u.avatarUrl ?? null }]))
  const sorted = [...db.directMessages]
    .filter((m) => m.senderId === userId || m.recipientId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const byFriend = new Map()
  for (const m of sorted) {
    const friendId = m.senderId === userId ? m.recipientId : m.senderId
    if (!byFriend.has(friendId)) {
      byFriend.set(friendId, { friendId, lastBody: m.body, lastAt: m.createdAt, lastFromFriend: m.senderId === friendId })
    }
  }
  return delay(
    [...byFriend.values()]
      .map((c) => ({ ...c, friendName: names[c.friendId]?.displayName ?? 'Someone', friendAvatarUrl: names[c.friendId]?.avatarUrl ?? null }))
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
  )
}

// --- Bet posts ------------------------------------------------------------

export function listBetPosts(groupId) {
  const db = readDb()
  return delay(
    db.betPosts
      .filter((b) => b.groupId === groupId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  )
}

export function createBetPost(post) {
  const db = readDb()
  const record = {
    id: uid('bet'),
    status: 'open',
    createdAt: new Date().toISOString(),
    settledAt: null,
    ...post
  }
  db.betPosts.push(record)
  writeDb(db)
  return delay(record)
}

export function updateBetStatus(betId, status) {
  const db = readDb()
  const post = db.betPosts.find((b) => b.id === betId)
  if (!post) return Promise.reject(new Error('Bet not found.'))
  post.status = status
  post.settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  writeDb(db)
  return delay(post)
}

export function listBetPostsByUser(userId) {
  const db = readDb()
  return delay(db.betPosts.filter((b) => b.userId === userId))
}

// Public timeline: bet_posts with visibility 'public', postable by anyone
// regardless of group membership (see BetBuilderSheet's "Post publicly").
// Author names are resolved against every user, not just group members,
// since a public post can come from - and be seen by - anyone.
export function listPublicFeed(viewerId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  const blockedIds = viewerId ? db.blocks.filter((b) => b.blockerId === viewerId).map((b) => b.blockedId) : []
  return delay(
    db.betPosts
      .filter((b) => b.visibility === 'public' && !blockedIds.includes(b.userId))
      .map((b) => ({ ...b, authorName: names[b.userId] ?? 'Someone' }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  )
}

// --- Reactions & comments ------------------------------------------------

export function toggleReaction(betId, userId, emoji) {
  const db = readDb()
  const idx = db.reactions.findIndex((r) => r.betId === betId && r.userId === userId && r.emoji === emoji)
  if (idx >= 0) {
    db.reactions.splice(idx, 1)
  } else {
    db.reactions.push({ id: uid('reaction'), betId, userId, emoji, createdAt: new Date().toISOString() })
  }
  writeDb(db)
  return delay(db.reactions.filter((r) => r.betId === betId))
}

export function listReactions(betId) {
  const db = readDb()
  return delay(db.reactions.filter((r) => r.betId === betId))
}

export function addComment(betId, userId, body) {
  const db = readDb()
  const comment = { id: uid('comment'), betId, userId, body, createdAt: new Date().toISOString() }
  db.comments.push(comment)
  writeDb(db)
  return delay(comment)
}

export function listComments(betId) {
  const db = readDb()
  return delay(db.comments.filter((c) => c.betId === betId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
}

// --- Bet copies (engagement tracking) -------------------------------------

export function recordBetCopy(originalBetId, copyingUserId) {
  const db = readDb()
  const copy = { id: uid('copy'), originalBetId, copyingUserId, createdAt: new Date().toISOString() }
  db.betCopies.push(copy)
  writeDb(db)
  return delay(copy)
}

// --- Tracker ---------------------------------------------------------------

export function listManualEntries(userId) {
  const db = readDb()
  return delay(db.manualEntries.filter((e) => e.userId === userId))
}

export function addManualEntry(entry) {
  const db = readDb()
  const record = { id: uid('manual'), createdAt: new Date().toISOString(), status: 'open', settledAt: null, ...entry }
  db.manualEntries.push(record)
  writeDb(db)
  return delay(record)
}

export function updateManualEntryStatus(entryId, status, potentialReturnOverride) {
  const db = readDb()
  const entry = db.manualEntries.find((e) => e.id === entryId)
  if (!entry) return Promise.reject(new Error('Entry not found.'))
  entry.status = status
  entry.settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  if (potentialReturnOverride !== undefined) entry.potentialReturn = potentialReturnOverride
  writeDb(db)
  return delay(entry)
}

// --- Account -----------------------------------------------------------

export function updateDisplayName(userId, displayName) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  if (user) {
    user.displayName = displayName
    writeDb(db)
  }
  const session = localStorage.getItem(SESSION_KEY)
  if (session) {
    const sessionUser = JSON.parse(session)
    if (sessionUser.id === userId) {
      sessionUser.displayName = displayName
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    }
  }
  return delay(displayName)
}

export function updateBookmakerPrefs(userId, prefs) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  if (user) {
    user.bookmakerPrefs = prefs
    writeDb(db)
  }
  const session = localStorage.getItem(SESSION_KEY)
  if (session) {
    const sessionUser = JSON.parse(session)
    if (sessionUser.id === userId) {
      sessionUser.bookmakerPrefs = prefs
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    }
  }
  return delay(prefs)
}

export function updateNotificationPrefs(userId, prefs) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  if (user) {
    user.notificationPrefs = prefs
    writeDb(db)
  }
  const session = localStorage.getItem(SESSION_KEY)
  if (session) {
    const sessionUser = JSON.parse(session)
    if (sessionUser.id === userId) {
      sessionUser.notificationPrefs = prefs
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    }
  }
  return delay(prefs)
}

export function updateStakeLimit(userId, { amount, period }) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  if (user) {
    user.stakeLimitAmount = amount
    user.stakeLimitPeriod = period
    writeDb(db)
  }
  const session = localStorage.getItem(SESSION_KEY)
  if (session) {
    const sessionUser = JSON.parse(session)
    if (sessionUser.id === userId) {
      sessionUser.stakeLimitAmount = amount
      sessionUser.stakeLimitPeriod = period
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    }
  }
  return delay({ amount, period })
}

// No real object storage in local mode - reads the file as a data URL and
// stores that directly, which is fine at avatar-sized files but would bloat
// localStorage fast at any real size. Fine for dev-mode clicking around;
// the Supabase-backed uploadAvatar in dataStore.js is what production uses.
export function uploadAvatar(userId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      const db = readDb()
      const user = db.users.find((u) => u.id === userId)
      if (user) {
        user.avatarUrl = url
        writeDb(db)
      }
      const session = localStorage.getItem(SESSION_KEY)
      if (session) {
        const sessionUser = JSON.parse(session)
        if (sessionUser.id === userId) {
          sessionUser.avatarUrl = url
          localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
        }
      }
      resolve(url)
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

export function countReferrals(userId) {
  const db = readDb()
  return delay(db.users.filter((u) => u.referredBy === userId).length)
}

// --- Push subscriptions -------------------------------------------------
// No server to send a push from in local mode - the real subscribe/permission
// flow in src/lib/push.js still runs, this just has nowhere to persist it.

export function savePushSubscription() {
  return delay(null)
}

export function deletePushSubscription() {
  return delay(null)
}

// --- Odds target alerts -------------------------------------------------
// No scheduled function runs against localStorage, so these save/list/
// delete like anything else but never actually fire - matches the app's
// usual "fully clickable without a real backend" rule even though the
// checking half of the feature has nowhere to run here.

export function createOddsAlert(userId, alert) {
  const db = readDb()
  const record = { id: uid('alert'), userId, createdAt: new Date().toISOString(), triggeredAt: null, ...alert }
  db.oddsAlerts.push(record)
  writeDb(db)
  return delay(record)
}

export function listMyOddsAlerts(userId) {
  const db = readDb()
  return delay(db.oddsAlerts.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
}

export function deleteOddsAlert(alertId) {
  const db = readDb()
  db.oddsAlerts = db.oddsAlerts.filter((a) => a.id !== alertId)
  writeDb(db)
  return delay(null)
}

export function followFixture(userId, follow) {
  const db = readDb()
  const key = (f) => `${f.userId}|${f.sport}|${f.eventId}`
  db.followedFixtures = db.followedFixtures.filter((f) => key(f) !== `${userId}|${follow.sport}|${follow.eventId}`)
  db.followedFixtures.push({ id: uid('follow'), userId, ...follow, createdAt: new Date().toISOString() })
  writeDb(db)
  return delay(null)
}

export function unfollowFixture(userId, sport, eventId) {
  const db = readDb()
  db.followedFixtures = db.followedFixtures.filter((f) => !(f.userId === userId && f.sport === sport && f.eventId === eventId))
  writeDb(db)
  return delay(null)
}

export function isFollowingFixture(userId, sport, eventId) {
  const db = readDb()
  return delay(db.followedFixtures.some((f) => f.userId === userId && f.sport === sport && f.eventId === eventId))
}

// --- Followed teams/players ---------------------------------------------

export function followParticipant(userId, sport, name) {
  const db = readDb()
  db.followedParticipants = db.followedParticipants.filter((p) => !(p.userId === userId && p.sport === sport && p.name === name))
  db.followedParticipants.push({ id: uid('followp'), userId, sport, name, createdAt: new Date().toISOString() })
  writeDb(db)
  return delay(null)
}

export function unfollowParticipant(userId, sport, name) {
  const db = readDb()
  db.followedParticipants = db.followedParticipants.filter((p) => !(p.userId === userId && p.sport === sport && p.name === name))
  writeDb(db)
  return delay(null)
}

export function listFollowedParticipants(userId) {
  const db = readDb()
  return delay(db.followedParticipants.filter((p) => p.userId === userId).map((p) => ({ sport: p.sport, name: p.name })))
}

// --- Friends ----------------------------------------------------------
// Adding by code connects instantly (no request/accept step), matching
// the same low-friction pattern as group invite codes.

export function addFriendByCode(code, userId) {
  const db = readDb()
  const target = db.users.find((u) => u.friendCode === code.trim().toUpperCase())
  if (!target) return Promise.reject(new Error('No one found with that code.'))
  if (target.id === userId) return Promise.reject(new Error("That's your own code."))
  const already = db.friendships.some(
    (f) => (f.userA === userId && f.userB === target.id) || (f.userA === target.id && f.userB === userId)
  )
  if (already) return Promise.reject(new Error(`You and ${target.displayName} are already friends.`))
  db.friendships.push({ id: uid('friend'), userA: userId, userB: target.id, createdAt: new Date().toISOString() })
  writeDb(db)
  return delay({ id: target.id, displayName: target.displayName })
}

export function listFriends(userId) {
  const db = readDb()
  const friendIds = db.friendships
    .filter((f) => f.userA === userId || f.userB === userId)
    .map((f) => (f.userA === userId ? f.userB : f.userA))
  return delay(db.users.filter((u) => friendIds.includes(u.id)).map((u) => ({ id: u.id, displayName: u.displayName })))
}

// --- Video tips ----------------------------------------------------------

export function createVideoPost({ authorId, videoKey, durationSec, caption, tag }) {
  const db = readDb()
  const post = {
    id: uid('video'),
    authorId,
    videoKey,
    durationSec,
    caption,
    tag: tag || null,
    createdAt: new Date().toISOString()
  }
  db.videoPosts.push(post)
  writeDb(db)
  return delay(post)
}

export async function listFriendsFeed(userId) {
  const db = readDb()
  const friends = await listFriends(userId)
  const authorIds = new Set([userId, ...friends.map((f) => f.id)])
  const names = Object.fromEntries(db.users.filter((u) => authorIds.has(u.id)).map((u) => [u.id, u.displayName]))
  return db.videoPosts
    .filter((v) => authorIds.has(v.authorId))
    .map((v) => ({ ...v, authorName: names[v.authorId] ?? 'Someone' }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function shareVideo(videoId, sharedByUserId, target) {
  const db = readDb()
  const video = db.videoPosts.find((v) => v.id === videoId)
  if (!video) return Promise.reject(new Error('Video not found.'))
  const share = {
    id: uid('share'),
    videoId,
    sharedByUserId,
    targetType: target.type,
    targetId: target.id,
    createdAt: new Date().toISOString()
  }
  db.videoShares.push(share)
  writeDb(db)
  return delay(share)
}

function resolveShares(db, shares) {
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  return shares
    .map((share) => {
      const video = db.videoPosts.find((v) => v.id === share.videoId)
      if (!video) return null
      return {
        ...video,
        authorName: names[video.authorId] ?? 'Someone',
        sharedByName: names[share.sharedByUserId] ?? 'Someone',
        sharedAt: share.createdAt
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.sharedAt) - new Date(a.sharedAt))
}

export function listSharedWithMe(userId) {
  const db = readDb()
  const shares = db.videoShares.filter((s) => s.targetType === 'friend' && s.targetId === userId)
  return delay(resolveShares(db, shares))
}

export function listSharedInGroup(groupId) {
  const db = readDb()
  const shares = db.videoShares.filter((s) => s.targetType === 'group' && s.targetId === groupId)
  return delay(resolveShares(db, shares))
}

// --- Follows ---------------------------------------------------------------
// One-way, unlike friendships: following someone doesn't require them to
// follow back, matching the public-feed "follow whoever's picks you like"
// model rather than the mutual-connect model friends/groups use.

export function followUser(userId, targetId) {
  const db = readDb()
  if (targetId === userId) return Promise.reject(new Error("You can't follow yourself."))
  const already = db.follows.some((f) => f.followerId === userId && f.followingId === targetId)
  if (!already) {
    db.follows.push({ id: uid('follow'), followerId: userId, followingId: targetId, createdAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(true)
}

export function unfollowUser(userId, targetId) {
  const db = readDb()
  db.follows = db.follows.filter((f) => !(f.followerId === userId && f.followingId === targetId))
  writeDb(db)
  return delay(true)
}

export function listFollowing(userId) {
  const db = readDb()
  const ids = db.follows.filter((f) => f.followerId === userId).map((f) => f.followingId)
  return delay(ids)
}

// --- Blocks & reports ----------------------------------------------------

export function blockUser(userId, blockedId) {
  const db = readDb()
  if (!db.blocks.some((b) => b.blockerId === userId && b.blockedId === blockedId)) {
    db.blocks.push({ id: uid('block'), blockerId: userId, blockedId, createdAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(true)
}

export function unblockUser(userId, blockedId) {
  const db = readDb()
  db.blocks = db.blocks.filter((b) => !(b.blockerId === userId && b.blockedId === blockedId))
  writeDb(db)
  return delay(true)
}

export function listBlockedUserIds(userId) {
  const db = readDb()
  return delay(db.blocks.filter((b) => b.blockerId === userId).map((b) => b.blockedId))
}

export function listBlockedUsers(userId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  return delay(
    db.blocks.filter((b) => b.blockerId === userId).map((b) => ({ id: b.blockedId, displayName: names[b.blockedId] ?? 'Someone' }))
  )
}

export function reportPost(postId, reporterId, reason) {
  const db = readDb()
  if (!db.postReports.some((r) => r.postId === postId && r.reporterId === reporterId)) {
    db.postReports.push({ id: uid('report'), postId, reporterId, reason, createdAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(true)
}

// --- Report moderation ---------------------------------------------------

export function listAllReports() {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  return delay(
    db.postReports
      .map((r) => {
        const post = db.betPosts.find((p) => p.id === r.postId)
        if (!post) return null
        return {
          id: r.id,
          reason: r.reason,
          createdAt: r.createdAt,
          reporterName: names[r.reporterId] ?? 'Someone',
          postId: r.postId,
          post: {
            id: post.id,
            authorName: names[post.userId] ?? 'Someone',
            event: post.selections?.[0]?.event ?? 'Bet',
            stake: post.stake,
            status: post.status
          }
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  )
}

export function dismissReportsForPost(postId) {
  const db = readDb()
  db.postReports = db.postReports.filter((r) => r.postId !== postId)
  writeDb(db)
  return delay(true)
}

export function removePost(postId) {
  const db = readDb()
  db.betPosts = db.betPosts.filter((p) => p.id !== postId)
  db.reactions = db.reactions.filter((r) => r.betId !== postId)
  db.comments = db.comments.filter((c) => c.betId !== postId)
  db.postReports = db.postReports.filter((r) => r.postId !== postId)
  writeDb(db)
  return delay(true)
}
