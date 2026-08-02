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
  groupMessages: []
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

export function signUp({ email, displayName, dob }) {
  const age = ageFromDob(dob)
  if (age < 18) return Promise.reject(new Error('You must be 18 or older to use BetMates.'))

  const db = readDb()
  if (db.users.some((u) => u.email === email)) {
    return Promise.reject(new Error('An account with that email already exists.'))
  }
  const user = {
    id: uid('user'),
    email,
    displayName,
    dob,
    bookmakerPrefs: [],
    notificationPrefs: { betPosted: true, betSettled: true, oddsMoved: false },
    friendCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    acceptedTermsAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
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
export function listPublicFeed() {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  return delay(
    db.betPosts
      .filter((b) => b.visibility === 'public')
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

export function updateManualEntryStatus(entryId, status) {
  const db = readDb()
  const entry = db.manualEntries.find((e) => e.id === entryId)
  if (!entry) return Promise.reject(new Error('Entry not found.'))
  entry.status = status
  entry.settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  writeDb(db)
  return delay(entry)
}

// --- Account -----------------------------------------------------------

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

// --- Push subscriptions -------------------------------------------------
// No server to send a push from in local mode - the real subscribe/permission
// flow in src/lib/push.js still runs, this just has nowhere to persist it.

export function savePushSubscription() {
  return delay(null)
}

export function deletePushSubscription() {
  return delay(null)
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
