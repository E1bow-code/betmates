// @ts-check
// localStorage-backed mock backend. Used when Supabase isn't configured
// (no VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) so the app is fully
// clickable in dev before a real project exists. Mirrors the async shape
// of the Supabase-backed functions in dataStore.js - swapping one for the
// other requires no UI changes. NOT for production use: "auth" here is
// unhashed and purely local to the browser.

// Records stored here use the same camelCase field names dataStore.js's
// map* functions produce (this file *is* the shape the UI expects, not a
// raw row to be mapped) - so its typedefs are reused directly rather than
// redeclaring near-identical ones here.
/** @typedef {import('./dataStore.js').Profile} Profile */
/** @typedef {import('./dataStore.js').Group} Group */
/** @typedef {import('./dataStore.js').BetPost} BetPost */
/** @typedef {import('./dataStore.js').ManualEntry} ManualEntry */
/** @typedef {import('./dataStore.js').GroupMessage} GroupMessage */
/** @typedef {import('./dataStore.js').FixtureChatMessage} FixtureChatMessage */
/** @typedef {import('./dataStore.js').DirectMessage} DirectMessage */
/** @typedef {import('./dataStore.js').OddsAlert} OddsAlert */
/** @typedef {import('./dataStore.js').Predictor} Predictor */
/** @typedef {import('./dataStore.js').PredictorEntry} PredictorEntry */
/** @typedef {import('./dataStore.js').ErrorLog} ErrorLog */
/**
 * @typedef {object} Db
 * @property {(Profile & {referredBy: string|null})[]} users
 * @property {Group[]} groups
 * @property {{groupId: string, userId: string, joinedAt: string}[]} groupMembers
 * @property {BetPost[]} betPosts
 * @property {{id: string, originalBetId: string, copyingUserId: string, createdAt: string}[]} betCopies
 * @property {{id: string, betId: string, userId: string, emoji: string, createdAt: string}[]} reactions
 * @property {{id: string, betId: string, userId: string, body: string, createdAt: string}[]} comments
 * @property {ManualEntry[]} manualEntries
 * @property {{id: string, userA: string, userB: string, createdAt: string}[]} friendships
 * @property {{id: string, authorId: string, videoKey: string, durationSec: number, caption: string, tag: string|null, createdAt: string}[]} videoPosts
 * @property {{id: string, videoId: string, sharedByUserId: string, targetType: string, targetId: string, createdAt: string}[]} videoShares
 * @property {{id: string, followerId: string, followingId: string, createdAt: string}[]} follows
 * @property {GroupMessage[]} groupMessages
 * @property {{id: string, blockerId: string, blockedId: string, createdAt: string}[]} blocks
 * @property {{id: string, postId: string, reporterId: string, reason: string, createdAt: string}[]} postReports
 * @property {DirectMessage[]} directMessages
 * @property {(OddsAlert & {userId: string})[]} oddsAlerts
 * @property {{id: string, userId: string, sport: string, eventId: string, eventLabel: string, kickoff: string, createdAt: string}[]} followedFixtures
 * @property {{id: string, userId: string, sport: string, name: string, createdAt: string}[]} followedParticipants
 * @property {FixtureChatMessage[]} fixtureChatMessages
 * @property {Predictor[]} predictors
 * @property {PredictorEntry[]} predictorEntries
 * @property {ErrorLog[]} errorLogs
 */

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
  followedParticipants: [],
  fixtureChatMessages: [],
  predictors: [],
  predictorEntries: [],
  errorLogs: []
}

// Merges in any table keys added after a browser's db was first created -
// otherwise an older stored db missing e.g. `friendships` would crash the
// first time a newer function tries to read it.
/** @returns {Db} */
function readDb() {
  const raw = localStorage.getItem(DB_KEY)
  return raw ? { ...EMPTY_DB, ...JSON.parse(raw) } : { ...EMPTY_DB }
}

/** @param {Db} db */
function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

/** @param {string} prefix @returns {string} */
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** @template T @param {T} value @returns {Promise<T>} */
function delay(value) {
  return Promise.resolve(value)
}

// --- Auth -------------------------------------------------------------

/** @returns {Promise<Profile|null>} */
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
/** @param {Profile} user @returns {Profile} */
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
/** @param {Db} db @returns {boolean} */
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

/**
 * @param {{email: string, displayName: string, dob: string, referredByCode?: string|null}} params
 * @returns {Promise<Profile>}
 */
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
    limitBuddyId: null,
    referredBy: referrer?.id ?? null
  }
  db.users.push(user)
  writeDb(db)
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return delay(user)
}

/** @param {{email: string}} params @returns {Promise<Profile>} */
export function signIn({ email }) {
  const db = readDb()
  const user = db.users.find((u) => u.email === email)
  if (!user) return Promise.reject(new Error('No account found for that email.'))
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return delay(user)
}

/** @returns {Promise<null>} */
export function signOut() {
  localStorage.removeItem(SESSION_KEY)
  return delay(null)
}

// Mirrors netlify/functions/delete-account.js: groups this user created
// get handed to their longest-standing other member, or deleted outright
// if they were the only one in it, before the user's own rows are removed.
/** @param {string} userId @returns {Promise<true>} */
export function deleteAccount(userId) {
  const db = readDb()

  for (const group of db.groups.filter((g) => g.createdBy === userId)) {
    const others = db.groupMembers
      .filter((m) => m.groupId === group.id && m.userId !== userId)
      .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
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

/** @param {string} dob @returns {number} */
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

/** @param {string} userId @returns {Promise<Group[]>} */
export function listMyGroups(userId) {
  const db = readDb()
  const groupIds = db.groupMembers.filter((m) => m.userId === userId).map((m) => m.groupId)
  return delay(db.groups.filter((g) => groupIds.includes(g.id)))
}

/** @param {string} groupId @returns {Promise<Group|null>} */
export function getGroup(groupId) {
  const db = readDb()
  return delay(db.groups.find((g) => g.id === groupId) || null)
}

/** @param {string} name @param {string} userId @returns {Promise<Group>} */
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

/** @param {string} code @param {string} userId @returns {Promise<Group>} */
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

/** @param {string} groupId @returns {Promise<{id: string, displayName: string}[]>} */
export function listGroupMembers(groupId) {
  const db = readDb()
  const memberIds = db.groupMembers.filter((m) => m.groupId === groupId).map((m) => m.userId)
  return delay(
    db.users.filter((u) => memberIds.includes(u.id)).map((u) => ({ id: u.id, displayName: u.displayName }))
  )
}

/** @param {string} groupId @param {string} userId @returns {Promise<true>} */
export function leaveGroup(groupId, userId) {
  const db = readDb()
  db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === groupId && m.userId === userId))
  writeDb(db)
  return delay(true)
}

/** @param {string} groupId @param {string} name @returns {Promise<Group|null>} */
export function renameGroup(groupId, name) {
  const db = readDb()
  const group = db.groups.find((g) => g.id === groupId)
  if (group) {
    group.name = name
    writeDb(db)
  }
  return delay(group || null)
}

/** @param {string} groupId @param {string} memberId @param {string} requesterId @returns {Promise<true>} */
export function removeGroupMember(groupId, memberId, requesterId) {
  const db = readDb()
  const group = db.groups.find((g) => g.id === groupId)
  if (!group || group.createdBy !== requesterId) return Promise.reject(new Error('Only the group creator can remove members.'))
  db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === groupId && m.userId === memberId))
  writeDb(db)
  return delay(true)
}

// --- Group chat -------------------------------------------------------

/** @param {string} groupId @returns {Promise<GroupMessage[]>} */
export function listGroupMessages(groupId) {
  const db = readDb()
  return delay(db.groupMessages.filter((m) => m.groupId === groupId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
}

/** @param {string} groupId @param {string} userId @param {string} body @returns {Promise<GroupMessage>} */
export function sendGroupMessage(groupId, userId, body) {
  const db = readDb()
  const message = { id: uid('msg'), groupId, userId, body, createdAt: new Date().toISOString() }
  db.groupMessages.push(message)
  writeDb(db)
  return delay(message)
}

// --- Fixture (match-day) chat --------------------------------------------

/** @param {string} sport @param {string} eventId @returns {Promise<FixtureChatMessage[]>} */
export function listFixtureChatMessages(sport, eventId) {
  const db = readDb()
  return delay(
    db.fixtureChatMessages
      .filter((m) => m.sport === sport && m.eventId === eventId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  )
}

/**
 * @param {string} sport @param {string} eventId @param {string} userId
 * @param {string} displayName @param {string} body
 * @returns {Promise<FixtureChatMessage>}
 */
export function sendFixtureChatMessage(sport, eventId, userId, displayName, body) {
  const db = readDb()
  const message = { id: uid('fchat'), sport, eventId, userId, authorName: displayName, body, createdAt: new Date().toISOString() }
  db.fixtureChatMessages.push(message)
  writeDb(db)
  return delay(message)
}

// --- Table predictor -----------------------------------------------------

/** @param {string} groupId @returns {Promise<Predictor|null>} */
export function getPredictor(groupId) {
  const db = readDb()
  const rows = db.predictors
    .filter((p) => p.groupId === groupId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return delay(rows[0] ?? null)
}

/**
 * @param {string} groupId @param {string} userId @param {string} competition @param {string[]} participants
 * @returns {Promise<Predictor>}
 */
export function createPredictor(groupId, userId, competition, participants) {
  const db = readDb()
  const predictor = {
    id: uid('predictor'),
    groupId,
    competition,
    participants,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    currentStandings: null,
    standingsUpdatedBy: null,
    standingsUpdatedAt: null
  }
  db.predictors.push(predictor)
  writeDb(db)
  return delay(predictor)
}

/** @param {string} predictorId @param {string} userId @param {string[]} standings @returns {Promise<Predictor|null>} */
export function updateStandings(predictorId, userId, standings) {
  const db = readDb()
  const predictor = db.predictors.find((p) => p.id === predictorId)
  if (predictor) {
    predictor.currentStandings = standings
    predictor.standingsUpdatedBy = userId
    predictor.standingsUpdatedAt = new Date().toISOString()
    writeDb(db)
  }
  return delay(predictor)
}

/** @param {string} predictorId @returns {Promise<PredictorEntry[]>} */
export function listPredictorEntries(predictorId) {
  const db = readDb()
  return delay(db.predictorEntries.filter((e) => e.predictorId === predictorId))
}

/** @param {string} predictorId @param {string} userId @param {string[]} predictedOrder @returns {Promise<PredictorEntry>} */
export function submitPredictorEntry(predictorId, userId, predictedOrder) {
  const db = readDb()
  let entry = db.predictorEntries.find((e) => e.predictorId === predictorId && e.userId === userId)
  const now = new Date().toISOString()
  if (entry) {
    entry.predictedOrder = predictedOrder
    entry.updatedAt = now
  } else {
    entry = { id: uid('predEntry'), predictorId, userId, predictedOrder, createdAt: now, updatedAt: now }
    db.predictorEntries.push(entry)
  }
  writeDb(db)
  return delay(entry)
}

// --- Direct messages ---------------------------------------------------

/** @param {string} userId @returns {Promise<{id: string, displayName: string, avatarUrl: string|null}|null>} */
export function getProfileById(userId) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  return delay(user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null } : null)
}

/** @param {string} userId @param {string} friendId @returns {Promise<DirectMessage[]>} */
export function listDirectMessages(userId, friendId) {
  const db = readDb()
  return delay(
    db.directMessages
      .filter((m) => (m.senderId === userId && m.recipientId === friendId) || (m.senderId === friendId && m.recipientId === userId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  )
}

/** @param {string} userId @param {string} friendId @param {string} body @returns {Promise<DirectMessage>} */
export function sendDirectMessage(userId, friendId, body) {
  const db = readDb()
  const message = { id: uid('dm'), senderId: userId, recipientId: friendId, body, createdAt: new Date().toISOString() }
  db.directMessages.push(message)
  writeDb(db)
  return delay(message)
}

/**
 * @param {string} userId
 * @returns {Promise<{friendId: string, lastBody: string, lastAt: string, lastFromFriend: boolean, friendName: string, friendAvatarUrl: string|null}[]>}
 */
export function listConversations(userId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, { displayName: u.displayName, avatarUrl: u.avatarUrl ?? null }]))
  const sorted = [...db.directMessages]
    .filter((m) => m.senderId === userId || m.recipientId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  /** @type {Map<string, {friendId: string, lastBody: string, lastAt: string, lastFromFriend: boolean}>} */
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
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
  )
}

// --- Bet posts ------------------------------------------------------------

/** @param {string} groupId @returns {Promise<BetPost[]>} */
export function listBetPosts(groupId) {
  const db = readDb()
  return delay(
    db.betPosts
      .filter((b) => b.groupId === groupId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
}

/**
 * @param {{groupId: string|null, userId: string, sport: string, marketType: string, selections: any[], stake: number|null, stakeHidden?: boolean, potentialReturn: number|null, visibility?: 'group'|'public'}} post
 * @returns {Promise<BetPost>}
 */
export function createBetPost(post) {
  const db = readDb()
  /** @type {BetPost} */
  const record = {
    id: uid('bet'),
    status: 'open',
    createdAt: new Date().toISOString(),
    settledAt: null,
    outcomes: null,
    stakeHidden: false,
    visibility: 'group',
    ...post
  }
  db.betPosts.push(record)
  writeDb(db)
  return delay(record)
}

/**
 * @param {string} betId @param {'open'|'won'|'lost'|'void'} status
 * @param {number} [potentialReturnOverride] @param {any[]} [outcomes]
 * @returns {Promise<BetPost>}
 */
export function updateBetStatus(betId, status, potentialReturnOverride, outcomes) {
  const db = readDb()
  const post = db.betPosts.find((b) => b.id === betId)
  if (!post) return Promise.reject(new Error('Bet not found.'))
  post.status = status
  post.settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  if (potentialReturnOverride !== undefined) post.potentialReturn = potentialReturnOverride
  if (outcomes !== undefined) post.outcomes = outcomes
  writeDb(db)
  return delay(post)
}

/** @param {string} userId @returns {Promise<BetPost[]>} */
export function listBetPostsByUser(userId) {
  const db = readDb()
  return delay(db.betPosts.filter((b) => b.userId === userId))
}

// Mirrors dataStore.js's Supabase version, including the status === 'open'
// restriction (enforced there by RLS) - kept here too so the no-backend
// path behaves the same way, not just whatever the UI happens to allow.
/**
 * @param {string} betId
 * @param {{stake: number|null, stakeHidden?: boolean, potentialReturn: number|null}} params
 * @returns {Promise<BetPost>}
 */
export function updateBetPost(betId, { stake, stakeHidden, potentialReturn }) {
  const db = readDb()
  const post = db.betPosts.find((b) => b.id === betId)
  if (!post) return Promise.reject(new Error('Bet not found.'))
  if (post.status !== 'open') return Promise.reject(new Error("Couldn't update this bet - it may already be settled."))
  post.stake = stake
  post.stakeHidden = stakeHidden
  post.potentialReturn = potentialReturn
  writeDb(db)
  return delay(post)
}

/** @param {string} betId @returns {Promise<true>} */
export function deleteBetPost(betId) {
  const db = readDb()
  const post = db.betPosts.find((b) => b.id === betId)
  if (!post) return Promise.reject(new Error('Bet not found.'))
  if (post.status !== 'open') return Promise.reject(new Error("Couldn't delete this bet - it may already be settled."))
  db.betPosts = db.betPosts.filter((b) => b.id !== betId)
  db.reactions = db.reactions.filter((r) => r.betId !== betId)
  db.comments = db.comments.filter((c) => c.betId !== betId)
  writeDb(db)
  return delay(true)
}

// Public timeline: bet_posts with visibility 'public', postable by anyone
// regardless of group membership (see BetBuilderSheet's "Post publicly").
// Author names are resolved against every user, not just group members,
// since a public post can come from - and be seen by - anyone.
/** @param {string} [viewerId] @returns {Promise<(BetPost & {authorName: string, authorCode: string|null})[]>} */
export function listPublicFeed(viewerId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  const codes = Object.fromEntries(db.users.map((u) => [u.id, u.friendCode ?? null]))
  const blockedIds = viewerId ? db.blocks.filter((b) => b.blockerId === viewerId).map((b) => b.blockedId) : []
  return delay(
    db.betPosts
      .filter((b) => b.visibility === 'public' && !blockedIds.includes(b.userId))
      .map((b) => ({ ...b, authorName: names[b.userId] ?? 'Someone', authorCode: codes[b.userId] ?? null }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
}

// --- Reactions & comments ------------------------------------------------

/** @param {string} betId @param {string} userId @param {string} emoji @returns {Promise<any[]>} */
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

/** @param {string} betId @returns {Promise<any[]>} */
export function listReactions(betId) {
  const db = readDb()
  return delay(db.reactions.filter((r) => r.betId === betId))
}

/** @param {string} betId @param {string} userId @param {string} body @returns {Promise<any>} */
export function addComment(betId, userId, body) {
  const db = readDb()
  const comment = { id: uid('comment'), betId, userId, body, createdAt: new Date().toISOString() }
  db.comments.push(comment)
  writeDb(db)
  return delay(comment)
}

/** @param {string} betId @returns {Promise<any[]>} */
export function listComments(betId) {
  const db = readDb()
  return delay(db.comments.filter((c) => c.betId === betId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
}

// --- Bet copies (engagement tracking) -------------------------------------

/** @param {string} originalBetId @param {string} copyingUserId @returns {Promise<any>} */
export function recordBetCopy(originalBetId, copyingUserId) {
  const db = readDb()
  const copy = { id: uid('copy'), originalBetId, copyingUserId, createdAt: new Date().toISOString() }
  db.betCopies.push(copy)
  writeDb(db)
  return delay(copy)
}

/** @param {string} betId @returns {Promise<any[]>} */
export function listBetCopies(betId) {
  const db = readDb()
  return delay(db.betCopies.filter((c) => c.originalBetId === betId))
}

// --- Tracker ---------------------------------------------------------------

/** @param {string} userId @returns {Promise<ManualEntry[]>} */
export function listManualEntries(userId) {
  const db = readDb()
  return delay(db.manualEntries.filter((e) => e.userId === userId))
}

/**
 * @param {{userId: string, sport: string, marketType: string, selections: any[], stake: number|null, potentialReturn: number|null}} entry
 * @returns {Promise<ManualEntry>}
 */
export function addManualEntry(entry) {
  const db = readDb()
  /** @type {ManualEntry} */
  const record = { id: uid('manual'), createdAt: new Date().toISOString(), status: 'open', settledAt: null, outcomes: null, ...entry }
  db.manualEntries.push(record)
  writeDb(db)
  return delay(record)
}

/**
 * @param {string} entryId @param {'open'|'won'|'lost'|'void'} status
 * @param {number} [potentialReturnOverride] @param {any[]} [outcomes]
 * @returns {Promise<ManualEntry>}
 */
export function updateManualEntryStatus(entryId, status, potentialReturnOverride, outcomes) {
  const db = readDb()
  const entry = db.manualEntries.find((e) => e.id === entryId)
  if (!entry) return Promise.reject(new Error('Entry not found.'))
  entry.status = status
  entry.settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  if (potentialReturnOverride !== undefined) entry.potentialReturn = potentialReturnOverride
  if (outcomes !== undefined) entry.outcomes = outcomes
  writeDb(db)
  return delay(entry)
}

/** @param {string} entryId @param {{stake: number|null, potentialReturn: number|null}} params @returns {Promise<ManualEntry>} */
export function updateManualEntry(entryId, { stake, potentialReturn }) {
  const db = readDb()
  const entry = db.manualEntries.find((e) => e.id === entryId)
  if (!entry) return Promise.reject(new Error('Entry not found.'))
  if (entry.status !== 'open') return Promise.reject(new Error("Couldn't update this entry - it may already be settled."))
  entry.stake = stake
  entry.potentialReturn = potentialReturn
  writeDb(db)
  return delay(entry)
}

/** @param {string} entryId @returns {Promise<true>} */
export function deleteManualEntry(entryId) {
  const db = readDb()
  const entry = db.manualEntries.find((e) => e.id === entryId)
  if (!entry) return Promise.reject(new Error('Entry not found.'))
  if (entry.status !== 'open') return Promise.reject(new Error("Couldn't delete this entry - it may already be settled."))
  db.manualEntries = db.manualEntries.filter((e) => e.id !== entryId)
  writeDb(db)
  return delay(true)
}

// --- Account -----------------------------------------------------------

/** @param {string} userId @param {string} displayName @returns {Promise<string>} */
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

/** @param {string} userId @param {string[]} prefs @returns {Promise<string[]>} */
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

/** @param {string} userId @param {Profile['notificationPrefs']} prefs @returns {Promise<Profile['notificationPrefs']>} */
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

/**
 * @param {string} userId @param {{amount: number|null, period: string|null}} params
 * @returns {Promise<{amount: number|null, period: string|null}>}
 */
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

/** @param {string} userId @param {string|null} buddyId @returns {Promise<string|null>} */
export function updateLimitBuddy(userId, buddyId) {
  const db = readDb()
  const user = db.users.find((u) => u.id === userId)
  if (user) {
    user.limitBuddyId = buddyId
    writeDb(db)
  }
  const session = localStorage.getItem(SESSION_KEY)
  if (session) {
    const sessionUser = JSON.parse(session)
    if (sessionUser.id === userId) {
      sessionUser.limitBuddyId = buddyId
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    }
  }
  return delay(buddyId)
}

// No real object storage in local mode - reads the file as a data URL and
// stores that directly, which is fine at avatar-sized files but would bloat
// localStorage fast at any real size. Fine for dev-mode clicking around;
// the Supabase-backed uploadAvatar in dataStore.js is what production uses.
/** @param {string} userId @param {File} file @returns {Promise<string>} */
export function uploadAvatar(userId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL always yields a string result (the other FileReader
      // read modes are what can produce an ArrayBuffer) - the DOM lib's
      // .result type covers every read method generically, not just this one.
      const url = /** @type {string} */ (reader.result)
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

/** @param {string} userId @returns {Promise<number>} */
export function countReferrals(userId) {
  const db = readDb()
  return delay(db.users.filter((u) => u.referredBy === userId).length)
}

// --- Push subscriptions -------------------------------------------------
// No server to send a push from in local mode - the real subscribe/permission
// flow in src/lib/push.js still runs, this just has nowhere to persist it.

/** @param {string} _userId @param {PushSubscription} _subscription @returns {Promise<null>} */
export function savePushSubscription(_userId, _subscription) {
  return delay(null)
}

/** @param {string} _endpoint @returns {Promise<null>} */
export function deletePushSubscription(_endpoint) {
  return delay(null)
}

// --- Odds target alerts -------------------------------------------------
// No scheduled function runs against localStorage, so these save/list/
// delete like anything else but never actually fire - matches the app's
// usual "fully clickable without a real backend" rule even though the
// checking half of the feature has nowhere to run here.

/**
 * @param {string} userId
 * @param {{sport: string, eventId: string, eventLabel: string, kickoff: string, marketKey?: string, marketLabel: string, outcomeName?: string, selectionLabel: string, targetDecimal: number}} alert
 * @returns {Promise<OddsAlert & {userId: string}>}
 */
export function createOddsAlert(userId, alert) {
  const db = readDb()
  const record = { id: uid('alert'), userId, createdAt: new Date().toISOString(), triggeredAt: null, ...alert }
  db.oddsAlerts.push(record)
  writeDb(db)
  return delay(record)
}

/** @param {string} userId @returns {Promise<(OddsAlert & {userId: string})[]>} */
export function listMyOddsAlerts(userId) {
  const db = readDb()
  return delay(db.oddsAlerts.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
}

/** @param {string} alertId @returns {Promise<null>} */
export function deleteOddsAlert(alertId) {
  const db = readDb()
  db.oddsAlerts = db.oddsAlerts.filter((a) => a.id !== alertId)
  writeDb(db)
  return delay(null)
}

/** @param {string} userId @param {{sport: string, eventId: string, eventLabel: string, kickoff: string}} follow @returns {Promise<null>} */
export function followFixture(userId, follow) {
  const db = readDb()
  /** @param {{userId: string, sport: string, eventId: string}} f */
  const key = (f) => `${f.userId}|${f.sport}|${f.eventId}`
  db.followedFixtures = db.followedFixtures.filter((f) => key(f) !== `${userId}|${follow.sport}|${follow.eventId}`)
  db.followedFixtures.push({ id: uid('follow'), userId, ...follow, createdAt: new Date().toISOString() })
  writeDb(db)
  return delay(null)
}

/** @param {string} userId @param {string} sport @param {string} eventId @returns {Promise<null>} */
export function unfollowFixture(userId, sport, eventId) {
  const db = readDb()
  db.followedFixtures = db.followedFixtures.filter((f) => !(f.userId === userId && f.sport === sport && f.eventId === eventId))
  writeDb(db)
  return delay(null)
}

/** @param {string} userId @param {string} sport @param {string} eventId @returns {Promise<boolean>} */
export function isFollowingFixture(userId, sport, eventId) {
  const db = readDb()
  return delay(db.followedFixtures.some((f) => f.userId === userId && f.sport === sport && f.eventId === eventId))
}

// --- Followed teams/players ---------------------------------------------

/** @param {string} userId @param {string} sport @param {string} name @returns {Promise<null>} */
export function followParticipant(userId, sport, name) {
  const db = readDb()
  db.followedParticipants = db.followedParticipants.filter((p) => !(p.userId === userId && p.sport === sport && p.name === name))
  db.followedParticipants.push({ id: uid('followp'), userId, sport, name, createdAt: new Date().toISOString() })
  writeDb(db)
  return delay(null)
}

/** @param {string} userId @param {string} sport @param {string} name @returns {Promise<null>} */
export function unfollowParticipant(userId, sport, name) {
  const db = readDb()
  db.followedParticipants = db.followedParticipants.filter((p) => !(p.userId === userId && p.sport === sport && p.name === name))
  writeDb(db)
  return delay(null)
}

/** @param {string} userId @returns {Promise<{sport: string, name: string}[]>} */
export function listFollowedParticipants(userId) {
  const db = readDb()
  return delay(db.followedParticipants.filter((p) => p.userId === userId).map((p) => ({ sport: p.sport, name: p.name })))
}

// --- Friends ----------------------------------------------------------
// Adding by code connects instantly (no request/accept step), matching
// the same low-friction pattern as group invite codes.

/** @param {string} code @param {string} userId @returns {Promise<{id: string, displayName: string}>} */
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

/** @param {string} userId @returns {Promise<{id: string, displayName: string}[]>} */
export function listFriends(userId) {
  const db = readDb()
  const friendIds = db.friendships
    .filter((f) => f.userA === userId || f.userB === userId)
    .map((f) => (f.userA === userId ? f.userB : f.userA))
  return delay(db.users.filter((u) => friendIds.includes(u.id)).map((u) => ({ id: u.id, displayName: u.displayName })))
}

// --- Video tips ----------------------------------------------------------

/**
 * @param {{authorId: string, videoKey: string, durationSec: number, caption: string, tag?: string}} params
 * @returns {Promise<{id: string, authorId: string, videoKey: string, durationSec: number, caption: string, tag: string|null, createdAt: string}>}
 */
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

/**
 * @param {string} userId
 * @returns {Promise<{id: string, authorId: string, videoKey: string, durationSec: number, caption: string, tag: string|null, createdAt: string, authorName: string}[]>}
 */
export async function listFriendsFeed(userId) {
  const db = readDb()
  const friends = await listFriends(userId)
  const authorIds = new Set([userId, ...friends.map((f) => f.id)])
  const names = Object.fromEntries(db.users.filter((u) => authorIds.has(u.id)).map((u) => [u.id, u.displayName]))
  return db.videoPosts
    .filter((v) => authorIds.has(v.authorId))
    .map((v) => ({ ...v, authorName: names[v.authorId] ?? 'Someone' }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** @param {string} videoId @param {string} sharedByUserId @param {{type: string, id: string}} target @returns {Promise<any>} */
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

/** @param {Db} db @param {Db['videoShares']} shares */
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
    .sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime())
}

/** @param {string} userId @returns {Promise<ReturnType<typeof resolveShares>>} */
export function listSharedWithMe(userId) {
  const db = readDb()
  const shares = db.videoShares.filter((s) => s.targetType === 'friend' && s.targetId === userId)
  return delay(resolveShares(db, shares))
}

/** @param {string} groupId @returns {Promise<ReturnType<typeof resolveShares>>} */
export function listSharedInGroup(groupId) {
  const db = readDb()
  const shares = db.videoShares.filter((s) => s.targetType === 'group' && s.targetId === groupId)
  return delay(resolveShares(db, shares))
}

// --- Follows ---------------------------------------------------------------
// One-way, unlike friendships: following someone doesn't require them to
// follow back, matching the public-feed "follow whoever's picks you like"
// model rather than the mutual-connect model friends/groups use.

/** @param {string} userId @param {string} targetId @returns {Promise<true>} */
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

/** @param {string} userId @param {string} targetId @returns {Promise<true>} */
export function unfollowUser(userId, targetId) {
  const db = readDb()
  db.follows = db.follows.filter((f) => !(f.followerId === userId && f.followingId === targetId))
  writeDb(db)
  return delay(true)
}

/** @param {string} userId @returns {Promise<string[]>} */
export function listFollowing(userId) {
  const db = readDb()
  const ids = db.follows.filter((f) => f.followerId === userId).map((f) => f.followingId)
  return delay(ids)
}

// --- Blocks & reports ----------------------------------------------------

/** @param {string} userId @param {string} blockedId @returns {Promise<true>} */
export function blockUser(userId, blockedId) {
  const db = readDb()
  if (!db.blocks.some((b) => b.blockerId === userId && b.blockedId === blockedId)) {
    db.blocks.push({ id: uid('block'), blockerId: userId, blockedId, createdAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(true)
}

/** @param {string} userId @param {string} blockedId @returns {Promise<true>} */
export function unblockUser(userId, blockedId) {
  const db = readDb()
  db.blocks = db.blocks.filter((b) => !(b.blockerId === userId && b.blockedId === blockedId))
  writeDb(db)
  return delay(true)
}

/** @param {string} userId @returns {Promise<string[]>} */
export function listBlockedUserIds(userId) {
  const db = readDb()
  return delay(db.blocks.filter((b) => b.blockerId === userId).map((b) => b.blockedId))
}

/** @param {string} userId @returns {Promise<{id: string, displayName: string}[]>} */
export function listBlockedUsers(userId) {
  const db = readDb()
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.displayName]))
  return delay(
    db.blocks.filter((b) => b.blockerId === userId).map((b) => ({ id: b.blockedId, displayName: names[b.blockedId] ?? 'Someone' }))
  )
}

/** @param {string} postId @param {string} reporterId @param {string} reason @returns {Promise<true>} */
export function reportPost(postId, reporterId, reason) {
  const db = readDb()
  if (!db.postReports.some((r) => r.postId === postId && r.reporterId === reporterId)) {
    db.postReports.push({ id: uid('report'), postId, reporterId, reason, createdAt: new Date().toISOString() })
    writeDb(db)
  }
  return delay(true)
}

// --- Report moderation ---------------------------------------------------

/**
 * @returns {Promise<{id: string, reason: string, createdAt: string, reporterName: string, postId: string, post: {id: string, authorName: string, event: string, stake: number|null, status: string}}[]>}
 */
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
      .filter((r) => r !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
}

/** @param {string} postId @returns {Promise<true>} */
export function dismissReportsForPost(postId) {
  const db = readDb()
  db.postReports = db.postReports.filter((r) => r.postId !== postId)
  writeDb(db)
  return delay(true)
}

/** @param {string} postId @returns {Promise<true>} */
export function removePost(postId) {
  const db = readDb()
  db.betPosts = db.betPosts.filter((p) => p.id !== postId)
  db.reactions = db.reactions.filter((r) => r.betId !== postId)
  db.comments = db.comments.filter((c) => c.betId !== postId)
  db.postReports = db.postReports.filter((r) => r.postId !== postId)
  writeDb(db)
  return delay(true)
}

// --- Error logs --------------------------------------------------------

/** @param {{message: string, stack?: string|null, route?: string|null}} entry @returns {Promise<void>} */
export function logClientError(entry) {
  const db = readDb()
  const sessionRaw = localStorage.getItem(SESSION_KEY)
  const userId = sessionRaw ? JSON.parse(sessionRaw).id : null
  db.errorLogs.push({
    id: uid('err'),
    message: entry.message.slice(0, 2000),
    stack: entry.stack ? entry.stack.slice(0, 4000) : null,
    route: entry.route ?? null,
    userId,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    createdAt: new Date().toISOString()
  })
  writeDb(db)
  return delay(undefined)
}

/** @returns {Promise<ErrorLog[]>} */
export function listErrorLogs() {
  const db = readDb()
  return delay([...db.errorLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200))
}

/** @param {string} id @returns {Promise<void>} */
export function deleteErrorLog(id) {
  const db = readDb()
  db.errorLogs = db.errorLogs.filter((e) => e.id !== id)
  writeDb(db)
  return delay(undefined)
}
