// Single seam between the UI and wherever group/bet/tracker data lives.
// Same swappable-adapter idea as src/api/oddsClient.js: every function
// here has a Supabase-backed implementation (used once VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY are set - see supabase/schema.sql for the tables)
// and a localStorage-backed fallback (src/lib/localBackend.js) so the app
// is fully usable before a Supabase project exists. No UI code should ever
// import supabaseClient.js or localBackend.js directly.

import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import * as local from './localBackend.js'

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    dob: row.date_of_birth,
    friendCode: row.friend_code,
    bookmakerPrefs: row.bookmaker_prefs || [],
    notificationPrefs: row.notification_prefs || { betPosted: true, betSettled: true, oddsMoved: false },
    acceptedTermsAt: row.accepted_terms_at,
    createdAt: row.created_at,
    isAdmin: row.is_admin || false,
    avatarUrl: row.avatar_url || null,
    stakeLimitAmount: row.stake_limit_amount ?? null,
    stakeLimitPeriod: row.stake_limit_period ?? null
  }
}

function mapGroup(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapBetPost(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    sport: row.sport,
    marketType: row.market_type,
    selections: row.selections,
    stake: row.stake,
    stakeHidden: row.stake_hidden,
    potentialReturn: row.potential_return,
    visibility: row.visibility ?? 'group',
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at
  }
}

function mapManualEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    sport: row.sport,
    marketType: row.market_type,
    selections: row.selections,
    stake: row.stake,
    potentialReturn: row.potential_return,
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at
  }
}

// --- Auth -------------------------------------------------------------

export async function getSession() {
  if (!isSupabaseConfigured) return local.getSession()
  const { data } = await supabase.auth.getSession()
  const authUser = data.session?.user
  if (!authUser) return null
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
  return mapProfile(profile)
}

export async function signUp({ email, password, displayName, dob, referredByCode }) {
  if (!isSupabaseConfigured) return local.signUp({ email, displayName, dob, referredByCode })

  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
  if (age < 18) throw new Error('You must be 18 or older to use BetMates.')

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  const authUser = data.user
  if (!authUser) throw new Error('Sign-up failed - check your inbox to confirm your email, then sign in.')

  // A bad/stale referral code should never block sign-up - look it up
  // best-effort and just leave referred_by null if it doesn't resolve.
  let referredBy = null
  if (referredByCode) {
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id')
      .eq('friend_code', referredByCode.trim().toUpperCase())
      .maybeSingle()
    referredBy = referrer?.id ?? null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authUser.id,
      email,
      display_name: displayName,
      date_of_birth: dob,
      accepted_terms_at: new Date().toISOString(),
      referred_by: referredBy
    })
    .select()
    .single()
  if (profileError) throw profileError
  return mapProfile(profile)
}

export async function signIn({ email, password }) {
  if (!isSupabaseConfigured) return local.signIn({ email })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
  return mapProfile(profile)
}

export async function signOut() {
  if (!isSupabaseConfigured) return local.signOut()
  await supabase.auth.signOut()
}

// Local (no-Supabase) mode has no real email delivery to send a reset link
// through, so this is Supabase-only - callers should check
// isSupabaseConfigured themselves if they want a different message there.
export async function requestPasswordReset(email) {
  if (!isSupabaseConfigured) throw new Error('Password reset needs a connected Supabase project.')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured) throw new Error('Password reset needs a connected Supabase project.')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// The PASSWORD_RECOVERY event (not a URL check - see AuthContext.jsx) is
// the only race-free way to catch a recovery link: Supabase's client
// detects and strips the recovery token from the URL as part of its own
// init, which can happen before the app's first render ever sees it, but
// listeners registered here still receive the event regardless of that
// timing. No-op in local mode, matching requestPasswordReset's own guard.
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {}
  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event) => callback(event))
  return () => subscription.unsubscribe()
}

// Permanently deletes the account (see netlify/functions/delete-account.js
// for what actually gets removed/reassigned). Signs the session out
// locally on success since the user row it belonged to no longer exists.
export async function deleteAccount(userId) {
  if (!isSupabaseConfigured) return local.deleteAccount(userId)
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('No active session.')
  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessToken })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(body.error || 'Failed to delete account.')
  await supabase.auth.signOut()
  return true
}

// --- Groups ---------------------------------------------------------------

export async function listMyGroups(userId) {
  if (!isSupabaseConfigured) return local.listMyGroups(userId)
  const { data, error } = await supabase
    .from('group_members')
    .select('groups(*)')
    .eq('user_id', userId)
  if (error) throw error
  return data.map((row) => mapGroup(row.groups))
}

export async function getGroup(groupId) {
  if (!isSupabaseConfigured) return local.getGroup(groupId)
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single()
  if (error) throw error
  return mapGroup(data)
}

export async function createGroup(name, userId) {
  if (!isSupabaseConfigured) return local.createGroup(name, userId)
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name, invite_code: inviteCode, created_by: userId })
    .select()
    .single()
  if (error) throw error
  const { error: memberError } = await supabase.from('group_members').insert({ group_id: group.id, user_id: userId })
  if (memberError) throw memberError
  return mapGroup(group)
}

export async function joinGroupByCode(code, userId) {
  if (!isSupabaseConfigured) return local.joinGroupByCode(code, userId)
  const { data: group, error } = await supabase
    .from('groups')
    .select('*')
    .ilike('invite_code', code.trim())
    .single()
  if (error || !group) throw new Error('No group found with that invite code.')
  await supabase.from('group_members').upsert({ group_id: group.id, user_id: userId })
  return mapGroup(group)
}

export async function listGroupMembers(groupId) {
  if (!isSupabaseConfigured) return local.listGroupMembers(groupId)
  const { data, error } = await supabase
    .from('group_members')
    .select('profiles(id, display_name)')
    .eq('group_id', groupId)
  if (error) throw error
  return data.map((row) => ({ id: row.profiles.id, displayName: row.profiles.display_name }))
}

export async function leaveGroup(groupId, userId) {
  if (!isSupabaseConfigured) return local.leaveGroup(groupId, userId)
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
  return true
}

// Both of these are gated to the group's creator by RLS on the Supabase
// side (see "creator renames their group" / "creator removes a member" in
// schema.sql) - the local backend has no RLS, so it re-checks createdBy
// itself to match that behavior.
export async function renameGroup(groupId, name) {
  if (!isSupabaseConfigured) return local.renameGroup(groupId, name)
  const { data, error } = await supabase.from('groups').update({ name }).eq('id', groupId).select().single()
  if (error) throw error
  return mapGroup(data)
}

export async function removeGroupMember(groupId, memberId, requesterId) {
  if (!isSupabaseConfigured) return local.removeGroupMember(groupId, memberId, requesterId)
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId)
  if (error) throw error
  return true
}

// --- Group chat ---------------------------------------------------------
// Plain free-text messages in a group, separate from bet_comments (which
// are threaded under one specific bet post). Names aren't embedded here -
// callers already have a memberNames lookup from listGroupMembers.

function mapGroupMessage(row) {
  return { id: row.id, groupId: row.group_id, userId: row.user_id, body: row.body, createdAt: row.created_at }
}

export async function listGroupMessages(groupId) {
  if (!isSupabaseConfigured) return local.listGroupMessages(groupId)
  const { data, error } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapGroupMessage)
}

export async function sendGroupMessage(groupId, userId, body) {
  if (!isSupabaseConfigured) return local.sendGroupMessage(groupId, userId, body)
  const { data, error } = await supabase.from('group_messages').insert({ group_id: groupId, user_id: userId, body }).select().single()
  if (error) throw error
  return mapGroupMessage(data)
}

// --- Direct messages -----------------------------------------------------
// 1:1 chat between two friends, separate from group_messages (scoped to a
// group) and bet_comments (threaded under one bet post).

function mapDirectMessage(row) {
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at }
}

export async function getProfileById(userId) {
  if (!isSupabaseConfigured) return local.getProfileById(userId)
  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url } : null
}

export async function listDirectMessages(userId, friendId) {
  if (!isSupabaseConfigured) return local.listDirectMessages(userId, friendId)
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapDirectMessage)
}

export async function sendDirectMessage(userId, friendId, body) {
  if (!isSupabaseConfigured) return local.sendDirectMessage(userId, friendId, body)
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: userId, recipient_id: friendId, body })
    .select()
    .single()
  if (error) throw error
  return mapDirectMessage(data)
}

// One row per conversation (the latest message with each person you've
// exchanged messages with), not every message - the inbox is a list of
// threads, not a merged timeline. Rows come back newest-message-first, and
// since a Map keeps only the first entry per friendId, that's automatically
// each conversation's most recent message.
export async function listConversations(userId) {
  if (!isSupabaseConfigured) return local.listConversations(userId)
  const { data, error } = await supabase
    .from('direct_messages')
    .select('sender_id, recipient_id, body, created_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (error) throw error

  const byFriend = new Map()
  for (const m of data) {
    const friendId = m.sender_id === userId ? m.recipient_id : m.sender_id
    if (!byFriend.has(friendId)) {
      byFriend.set(friendId, { friendId, lastBody: m.body, lastAt: m.created_at, lastFromFriend: m.sender_id === friendId })
    }
  }
  const friendIds = [...byFriend.keys()]
  if (!friendIds.length) return []

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', friendIds)
  if (profilesError) throw profilesError
  const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  return friendIds
    .map((id) => ({
      ...byFriend.get(id),
      friendName: byId[id]?.display_name ?? 'Someone',
      friendAvatarUrl: byId[id]?.avatar_url ?? null
    }))
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
}

// --- Bet posts --------------------------------------------------------

export async function listBetPosts(groupId) {
  if (!isSupabaseConfigured) return local.listBetPosts(groupId)
  const { data, error } = await supabase
    .from('bet_posts')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapBetPost)
}

export async function createBetPost(post) {
  if (!isSupabaseConfigured) return local.createBetPost(post)
  const { data, error } = await supabase
    .from('bet_posts')
    .insert({
      group_id: post.groupId,
      user_id: post.userId,
      sport: post.sport,
      market_type: post.marketType,
      selections: post.selections,
      stake: post.stake,
      stake_hidden: post.stakeHidden,
      potential_return: post.potentialReturn,
      visibility: post.visibility ?? 'group'
    })
    .select()
    .single()
  if (error) throw error
  return mapBetPost(data)
}

export async function updateBetStatus(betId, status, potentialReturnOverride) {
  if (!isSupabaseConfigured) return local.updateBetStatus(betId, status, potentialReturnOverride)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  const update = { status, settled_at: settledAt }
  if (potentialReturnOverride !== undefined) update.potential_return = potentialReturnOverride
  const { data, error } = await supabase
    .from('bet_posts')
    .update(update)
    .eq('id', betId)
    .select()
    .single()
  if (error) throw error
  return mapBetPost(data)
}

// Corrects a mis-typed stake (and stakeHidden) on a bet the author hasn't
// settled yet - RLS additionally enforces status = 'open' server-side (see
// supabase/schema.sql), this check is the client-side half so the button
// simply isn't offered once a bet is settled.
export async function updateBetPost(betId, { stake, stakeHidden, potentialReturn }) {
  if (!isSupabaseConfigured) return local.updateBetPost(betId, { stake, stakeHidden, potentialReturn })
  const { data, error } = await supabase
    .from('bet_posts')
    .update({ stake, stake_hidden: stakeHidden, potential_return: potentialReturn })
    .eq('id', betId)
    .select()
    .single()
  if (error) throw error
  return mapBetPost(data)
}

// RLS only allows this while the bet is still open (see schema.sql) - a
// blocked delete returns zero rows rather than an error, so this checks
// for that explicitly instead of reporting success on a no-op.
export async function deleteBetPost(betId) {
  if (!isSupabaseConfigured) return local.deleteBetPost(betId)
  const { data, error } = await supabase.from('bet_posts').delete().eq('id', betId).select()
  if (error) throw error
  if (!data?.length) throw new Error("Couldn't delete this bet - it may already be settled.")
  return true
}

export async function listBetPostsByUser(userId) {
  if (!isSupabaseConfigured) return local.listBetPostsByUser(userId)
  const { data, error } = await supabase.from('bet_posts').select('*').eq('user_id', userId)
  if (error) throw error
  return data.map(mapBetPost)
}

// --- Public feed & follows ---------------------------------------------

// viewerId is optional (public profile pages can call this logged out),
// but when it's there, anyone the viewer has blocked is filtered out
// client-side - simpler than a subquery in the select, and this list is
// small enough per-user that it's not worth the query complexity.
export async function listPublicFeed(viewerId) {
  if (!isSupabaseConfigured) return local.listPublicFeed(viewerId)
  const { data, error } = await supabase
    .from('bet_posts')
    .select('*, profiles(display_name)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
  if (error) throw error
  const posts = data.map((row) => ({ ...mapBetPost(row), authorName: row.profiles?.display_name ?? 'Someone' }))
  if (!viewerId) return posts
  const blockedIds = await listBlockedUserIds(viewerId)
  return blockedIds.length ? posts.filter((p) => !blockedIds.includes(p.userId)) : posts
}

export async function followUser(userId, targetId) {
  if (!isSupabaseConfigured) return local.followUser(userId, targetId)
  const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
  if (error && error.code !== '23505') throw error // 23505 = already following, ignore
  return true
}

export async function unfollowUser(userId, targetId) {
  if (!isSupabaseConfigured) return local.unfollowUser(userId, targetId)
  const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
  if (error) throw error
  return true
}

export async function listFollowing(userId) {
  if (!isSupabaseConfigured) return local.listFollowing(userId)
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
  if (error) throw error
  return data.map((row) => row.following_id)
}

// --- Blocks & reports ----------------------------------------------------
// Public-feed-only (see BetCard.jsx variant='public') - group posts aren't
// blockable since a group is already people you chose to be around.

export async function blockUser(userId, blockedId) {
  if (!isSupabaseConfigured) return local.blockUser(userId, blockedId)
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: blockedId })
  if (error && error.code !== '23505') throw error // already blocked, ignore
  return true
}

export async function unblockUser(userId, blockedId) {
  if (!isSupabaseConfigured) return local.unblockUser(userId, blockedId)
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId)
  if (error) throw error
  return true
}

async function listBlockedUserIds(userId) {
  if (!isSupabaseConfigured) return local.listBlockedUserIds(userId)
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
  if (error) throw error
  return data.map((row) => row.blocked_id)
}

export async function listBlockedUsers(userId) {
  if (!isSupabaseConfigured) return local.listBlockedUsers(userId)
  // blocks has two FKs into profiles (blocker_id, blocked_id) - the join
  // target has to be named explicitly or PostgREST can't tell which one
  // "profiles(...)" means and errors with "more than one relationship found".
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, profiles!blocks_blocked_id_fkey(display_name)')
    .eq('blocker_id', userId)
  if (error) throw error
  return data.map((row) => ({ id: row.blocked_id, displayName: row.profiles?.display_name ?? 'Someone' }))
}

export async function reportPost(postId, reporterId, reason) {
  if (!isSupabaseConfigured) return local.reportPost(postId, reporterId, reason)
  const { error } = await supabase.from('post_reports').insert({ post_id: postId, reporter_id: reporterId, reason })
  if (error && error.code !== '23505') throw error // already reported this post, ignore
  return true
}

// --- Report moderation ---------------------------------------------------
// Admin-only (see AdminReportsPage.jsx) - enforced both client-side (the
// route redirects a non-admin away) and by the "admins read/dismiss/remove"
// RLS policies in schema.sql, which is the real gate.

export async function listAllReports() {
  if (!isSupabaseConfigured) return local.listAllReports()
  const { data, error } = await supabase
    .from('post_reports')
    .select(
      'id, reason, created_at, post_id, reporter:profiles!post_reports_reporter_id_fkey(display_name), post:bet_posts(id, user_id, selections, stake, status, author:profiles!bet_posts_user_id_fkey(display_name))'
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
    .filter((row) => row.post) // the post's own delete policy cascades its reports away too, but guard anyway
    .map((row) => ({
      id: row.id,
      reason: row.reason,
      createdAt: row.created_at,
      reporterName: row.reporter?.display_name ?? 'Someone',
      postId: row.post_id,
      post: {
        id: row.post.id,
        authorName: row.post.author?.display_name ?? 'Someone',
        event: row.post.selections?.[0]?.event ?? 'Bet',
        stake: row.post.stake,
        status: row.post.status
      }
    }))
}

export async function dismissReportsForPost(postId) {
  if (!isSupabaseConfigured) return local.dismissReportsForPost(postId)
  const { error } = await supabase.from('post_reports').delete().eq('post_id', postId)
  if (error) throw error
  return true
}

export async function removePost(postId) {
  if (!isSupabaseConfigured) return local.removePost(postId)
  const { error } = await supabase.from('bet_posts').delete().eq('id', postId)
  if (error) throw error
  return true
}

// --- Reactions & comments ------------------------------------------------

export async function toggleReaction(betId, userId, emoji) {
  if (!isSupabaseConfigured) return local.toggleReaction(betId, userId, emoji)
  const { data: existing } = await supabase
    .from('bet_reactions')
    .select('id')
    .eq('bet_id', betId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (existing) {
    await supabase.from('bet_reactions').delete().eq('id', existing.id)
  } else {
    await supabase.from('bet_reactions').insert({ bet_id: betId, user_id: userId, emoji })
  }
  const { data } = await supabase.from('bet_reactions').select('*').eq('bet_id', betId)
  return data
}

export async function listReactions(betId) {
  if (!isSupabaseConfigured) return local.listReactions(betId)
  const { data, error } = await supabase.from('bet_reactions').select('*').eq('bet_id', betId)
  if (error) throw error
  return data
}

export async function addComment(betId, userId, body) {
  if (!isSupabaseConfigured) return local.addComment(betId, userId, body)
  const { data, error } = await supabase
    .from('bet_comments')
    .insert({ bet_id: betId, user_id: userId, body })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listComments(betId) {
  if (!isSupabaseConfigured) return local.listComments(betId)
  const { data, error } = await supabase
    .from('bet_comments')
    .select('*')
    .eq('bet_id', betId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// --- Bet copies (engagement tracking) -------------------------------------

export async function recordBetCopy(originalBetId, copyingUserId) {
  if (!isSupabaseConfigured) return local.recordBetCopy(originalBetId, copyingUserId)
  const { error } = await supabase
    .from('bet_copies')
    .insert({ original_bet_id: originalBetId, copying_user_id: copyingUserId })
  if (error) throw error
}

// --- Tracker (manual entries, separate from group bet_posts) --------------

export async function listManualEntries(userId) {
  if (!isSupabaseConfigured) return local.listManualEntries(userId)
  const { data, error } = await supabase.from('manual_entries').select('*').eq('user_id', userId)
  if (error) throw error
  return data.map(mapManualEntry)
}

export async function addManualEntry(entry) {
  if (!isSupabaseConfigured) return local.addManualEntry(entry)
  const { data, error } = await supabase
    .from('manual_entries')
    .insert({
      user_id: entry.userId,
      sport: entry.sport,
      market_type: entry.marketType,
      selections: entry.selections,
      stake: entry.stake,
      potential_return: entry.potentialReturn
    })
    .select()
    .single()
  if (error) throw error
  return mapManualEntry(data)
}

// potentialReturnOverride is only passed for an each-way "placed, didn't
// win" result (see TrackerPage) - the amount actually returned there is
// the place-part payout, not the optimistic full-win figure stored when
// the bet was logged, so it needs correcting alongside the status.
export async function updateManualEntryStatus(entryId, status, potentialReturnOverride) {
  if (!isSupabaseConfigured) return local.updateManualEntryStatus(entryId, status, potentialReturnOverride)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  const update = { status, settled_at: settledAt }
  if (potentialReturnOverride !== undefined) update.potential_return = potentialReturnOverride
  const { data, error } = await supabase
    .from('manual_entries')
    .update(update)
    .eq('id', entryId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Corrects a mis-typed stake on a private entry that's still open - same
// status = 'open' restriction as updateBetPost above, enforced by RLS too.
export async function updateManualEntry(entryId, { stake, potentialReturn }) {
  if (!isSupabaseConfigured) return local.updateManualEntry(entryId, { stake, potentialReturn })
  const { data, error } = await supabase
    .from('manual_entries')
    .update({ stake, potential_return: potentialReturn })
    .eq('id', entryId)
    .select()
    .single()
  if (error) throw error
  return mapManualEntry(data)
}

// See deleteBetPost's comment - a blocked delete returns zero rows, not an
// error, so that's checked for explicitly here too.
export async function deleteManualEntry(entryId) {
  if (!isSupabaseConfigured) return local.deleteManualEntry(entryId)
  const { data, error } = await supabase.from('manual_entries').delete().eq('id', entryId).select()
  if (error) throw error
  if (!data?.length) throw new Error("Couldn't delete this entry - it may already be settled.")
  return true
}

// --- Account -----------------------------------------------------------

export async function updateDisplayName(userId, displayName) {
  if (!isSupabaseConfigured) return local.updateDisplayName(userId, displayName)
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId)
  if (error) throw error
  return displayName
}

export async function updateBookmakerPrefs(userId, prefs) {
  if (!isSupabaseConfigured) return local.updateBookmakerPrefs(userId, prefs)
  const { error } = await supabase.from('profiles').update({ bookmaker_prefs: prefs }).eq('id', userId)
  if (error) throw error
  return prefs
}

export async function updateNotificationPrefs(userId, prefs) {
  if (!isSupabaseConfigured) return local.updateNotificationPrefs(userId, prefs)
  const { error } = await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', userId)
  if (error) throw error
  return prefs
}

// amount/period both null clears the limit (the "off" state).
export async function updateStakeLimit(userId, { amount, period }) {
  if (!isSupabaseConfigured) return local.updateStakeLimit(userId, { amount, period })
  const { error } = await supabase
    .from('profiles')
    .update({ stake_limit_amount: amount, stake_limit_period: period })
    .eq('id', userId)
  if (error) throw error
  return { amount, period }
}

// Path is prefixed with the uploader's own user id - the storage RLS
// policies (see schema.sql) check exactly that prefix, so anything else
// would be rejected before it ever reached here. upsert:true means
// re-uploading (changing your photo) overwrites the same object instead of
// accumulating orphaned files.
export async function uploadAvatar(userId, file) {
  if (!isSupabaseConfigured) return local.uploadAvatar(userId, file)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (uploadError) throw uploadError
  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}` // cache-bust so a re-upload shows immediately
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (updateError) throw updateError
  return url
}

export async function countReferrals(userId) {
  if (!isSupabaseConfigured) return local.countReferrals(userId)
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', userId)
  if (error) throw error
  return count ?? 0
}

// --- Push subscriptions -------------------------------------------------
// One row per browser/device (see supabase/schema.sql's push_subscriptions
// table). Local mode has no server to send a push from, so it's a no-op
// there - src/lib/push.js still runs the real browser subscribe/permission
// flow either way, this just skips persisting it.

export async function savePushSubscription(userId, subscription) {
  if (!isSupabaseConfigured) return local.savePushSubscription(userId, subscription)
  const json = subscription.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function deletePushSubscription(endpoint) {
  if (!isSupabaseConfigured) return local.deletePushSubscription(endpoint)
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// --- Odds target alerts ---------------------------------------------------
// Checked server-side by netlify/functions/check-odds-alerts.js, which has
// no equivalent in local mode (no scheduled functions run against
// localStorage) - alerts still save/list/delete locally so the flow stays
// fully clickable, they just never actually fire there.

function mapOddsAlert(row) {
  return {
    id: row.id,
    sport: row.sport,
    eventId: row.event_id,
    eventLabel: row.event_label,
    kickoff: row.kickoff,
    marketLabel: row.market_label,
    selectionLabel: row.selection_label,
    targetDecimal: Number(row.target_decimal),
    createdAt: row.created_at,
    triggeredAt: row.triggered_at
  }
}

export async function createOddsAlert(userId, alert) {
  if (!isSupabaseConfigured) return local.createOddsAlert(userId, alert)
  const { data, error } = await supabase
    .from('odds_alerts')
    .insert({
      user_id: userId,
      sport: alert.sport,
      event_id: alert.eventId,
      event_label: alert.eventLabel,
      kickoff: alert.kickoff,
      market_key: alert.marketKey,
      market_label: alert.marketLabel,
      outcome_name: alert.outcomeName,
      selection_label: alert.selectionLabel,
      target_decimal: alert.targetDecimal
    })
    .select()
    .single()
  if (error) throw error
  return mapOddsAlert(data)
}

export async function listMyOddsAlerts(userId) {
  if (!isSupabaseConfigured) return local.listMyOddsAlerts(userId)
  const { data, error } = await supabase
    .from('odds_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapOddsAlert)
}

export async function deleteOddsAlert(alertId) {
  if (!isSupabaseConfigured) return local.deleteOddsAlert(alertId)
  const { error } = await supabase.from('odds_alerts').delete().eq('id', alertId)
  if (error) throw error
}

// --- Followed fixtures -----------------------------------------------------
// Kickoff reminders and result notifications for a fixture the user is just
// interested in, no bet required - see kickoff-reminders.js and
// check-followed-results.js. No scheduled functions run against
// localStorage, so follows still save/list/unfollow there but never
// actually notify (same limitation as odds alerts in local mode).

export async function followFixture(userId, follow) {
  if (!isSupabaseConfigured) return local.followFixture(userId, follow)
  const { error } = await supabase.from('followed_fixtures').upsert(
    {
      user_id: userId,
      sport: follow.sport,
      event_id: follow.eventId,
      event_label: follow.eventLabel,
      kickoff: follow.kickoff
    },
    { onConflict: 'user_id,sport,event_id' }
  )
  if (error) throw error
}

export async function unfollowFixture(userId, sport, eventId) {
  if (!isSupabaseConfigured) return local.unfollowFixture(userId, sport, eventId)
  const { error } = await supabase.from('followed_fixtures').delete().eq('user_id', userId).eq('sport', sport).eq('event_id', eventId)
  if (error) throw error
}

export async function isFollowingFixture(userId, sport, eventId) {
  if (!isSupabaseConfigured) return local.isFollowingFixture(userId, sport, eventId)
  const { data, error } = await supabase
    .from('followed_fixtures')
    .select('id')
    .eq('user_id', userId)
    .eq('sport', sport)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// --- Followed teams/players (standing preference, not per-fixture) --------
// Distinct from followFixture above: that's "notify me about this ONE
// upcoming game", this is "always show me this team/player wherever they
// show up" - surfaced as the "My teams only" filter on OddsListPage.
export async function followParticipant(userId, sport, name) {
  if (!isSupabaseConfigured) return local.followParticipant(userId, sport, name)
  const { error } = await supabase
    .from('followed_participants')
    .upsert({ user_id: userId, sport, participant_name: name }, { onConflict: 'user_id,sport,participant_name' })
  if (error) throw error
}

export async function unfollowParticipant(userId, sport, name) {
  if (!isSupabaseConfigured) return local.unfollowParticipant(userId, sport, name)
  const { error } = await supabase
    .from('followed_participants')
    .delete()
    .eq('user_id', userId)
    .eq('sport', sport)
    .eq('participant_name', name)
  if (error) throw error
}

export async function listFollowedParticipants(userId) {
  if (!isSupabaseConfigured) return local.listFollowedParticipants(userId)
  const { data, error } = await supabase.from('followed_participants').select('sport,participant_name').eq('user_id', userId)
  if (error) throw error
  return data.map((r) => ({ sport: r.sport, name: r.participant_name }))
}

// --- Aggregated social feed ------------------------------------------------
// Composed from the primitives above (not backend-specific) so it works
// unchanged on both the local mock and Supabase: pulls every group the
// user is in, merges each group's bet posts into one timeline tagged with
// the group name and a userId->displayName lookup for rendering.

export async function listFeedForUser(userId) {
  const groups = await listMyGroups(userId)
  const perGroup = await Promise.all(
    groups.map(async (group) => {
      const [posts, members] = await Promise.all([listBetPosts(group.id), listGroupMembers(group.id)])
      const memberNames = Object.fromEntries(members.map((m) => [m.id, m.displayName]))
      return posts.map((post) => ({ ...post, groupName: group.name, memberNames }))
    })
  )
  return perGroup.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

// --- Friends & video tips ---------------------------------------------------
// Metadata (who's friends with whom, captions, tags, shares) syncs through
// Supabase like everything else once configured. Video BYTES don't - they
// live in IndexedDB via src/lib/videoStore.js, so a clip recorded on one
// device still won't play on another even with Supabase wired up (see the
// note in supabase/schema.sql). Swapping that in later means changing
// videoStore.js's save/get/delete trio to hit Supabase Storage instead.

export async function addFriendByCode(code, userId) {
  if (!isSupabaseConfigured) return local.addFriendByCode(code, userId)
  const { data: target, error: lookupError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('friend_code', code.trim().toUpperCase())
    .maybeSingle()
  if (lookupError) throw lookupError
  if (!target) throw new Error('No one found with that code.')
  if (target.id === userId) throw new Error("That's your own code.")

  const { data: existing } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(user_a.eq.${userId},user_b.eq.${target.id}),and(user_a.eq.${target.id},user_b.eq.${userId})`)
    .maybeSingle()
  if (existing) throw new Error(`You and ${target.display_name} are already friends.`)

  const { error } = await supabase.from('friendships').insert({ user_a: userId, user_b: target.id })
  if (error) throw error
  return { id: target.id, displayName: target.display_name }
}

export async function listFriends(userId) {
  if (!isSupabaseConfigured) return local.listFriends(userId)
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b, a:profiles!friendships_user_a_fkey(id, display_name), b:profiles!friendships_user_b_fkey(id, display_name)')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
  if (error) throw error
  return data.map((row) => {
    const other = row.user_a === userId ? row.b : row.a
    return { id: other.id, displayName: other.display_name }
  })
}

export async function createVideoPost({ authorId, videoKey, durationSec, caption, tag }) {
  if (!isSupabaseConfigured) return local.createVideoPost({ authorId, videoKey, durationSec, caption, tag })
  const { data, error } = await supabase
    .from('video_posts')
    .insert({ author_id: authorId, storage_key: videoKey, duration_sec: durationSec, caption, tag })
    .select()
    .single()
  if (error) throw error
  return { id: data.id, authorId: data.author_id, videoKey: data.storage_key, durationSec: data.duration_sec, caption: data.caption, tag: data.tag, createdAt: data.created_at }
}

export async function listFriendsFeed(userId) {
  if (!isSupabaseConfigured) return local.listFriendsFeed(userId)
  const friends = await listFriends(userId)
  const authorIds = [userId, ...friends.map((f) => f.id)]
  const { data, error } = await supabase
    .from('video_posts')
    .select('*, profiles(display_name)')
    .in('author_id', authorIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    videoKey: row.storage_key,
    durationSec: row.duration_sec,
    caption: row.caption,
    tag: row.tag,
    createdAt: row.created_at,
    authorName: row.profiles?.display_name ?? 'Someone'
  }))
}

export async function shareVideo(videoId, sharedByUserId, target) {
  if (!isSupabaseConfigured) return local.shareVideo(videoId, sharedByUserId, target)
  const { error } = await supabase
    .from('video_shares')
    .insert({ video_id: videoId, shared_by_user_id: sharedByUserId, target_type: target.type, target_id: target.id })
  if (error) throw error
}

function mapSharedVideoRow(row) {
  return {
    id: row.video_posts.id,
    authorId: row.video_posts.author_id,
    videoKey: row.video_posts.storage_key,
    durationSec: row.video_posts.duration_sec,
    caption: row.video_posts.caption,
    tag: row.video_posts.tag,
    createdAt: row.video_posts.created_at,
    authorName: row.video_posts.profiles?.display_name ?? 'Someone',
    sharedByName: row.sharer?.display_name ?? 'Someone',
    sharedAt: row.created_at
  }
}

export async function listSharedWithMe(userId) {
  if (!isSupabaseConfigured) return local.listSharedWithMe(userId)
  const { data, error } = await supabase
    .from('video_shares')
    .select('created_at, video_posts(*, profiles(display_name)), sharer:profiles!video_shares_shared_by_user_id_fkey(display_name)')
    .eq('target_type', 'friend')
    .eq('target_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapSharedVideoRow)
}

export async function listSharedInGroup(groupId) {
  if (!isSupabaseConfigured) return local.listSharedInGroup(groupId)
  const { data, error } = await supabase
    .from('video_shares')
    .select('created_at, video_posts(*, profiles(display_name)), sharer:profiles!video_shares_shared_by_user_id_fkey(display_name)')
    .eq('target_type', 'group')
    .eq('target_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapSharedVideoRow)
}
