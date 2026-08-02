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
    bookmakerPrefs: row.bookmaker_prefs || [],
    notificationPrefs: row.notification_prefs || { betPosted: true, betSettled: true, oddsMoved: false },
    acceptedTermsAt: row.accepted_terms_at,
    createdAt: row.created_at
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

// --- Auth -------------------------------------------------------------

export async function getSession() {
  if (!isSupabaseConfigured) return local.getSession()
  const { data } = await supabase.auth.getSession()
  const authUser = data.session?.user
  if (!authUser) return null
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
  return mapProfile(profile)
}

export async function signUp({ email, password, displayName, dob }) {
  if (!isSupabaseConfigured) return local.signUp({ email, displayName, dob })

  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
  if (age < 18) throw new Error('You must be 18 or older to use BetMates.')

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  const authUser = data.user
  if (!authUser) throw new Error('Sign-up failed - check your inbox to confirm your email, then sign in.')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authUser.id,
      email,
      display_name: displayName,
      date_of_birth: dob,
      accepted_terms_at: new Date().toISOString()
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

export async function updateBetStatus(betId, status) {
  if (!isSupabaseConfigured) return local.updateBetStatus(betId, status)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('bet_posts')
    .update({ status, settled_at: settledAt })
    .eq('id', betId)
    .select()
    .single()
  if (error) throw error
  return mapBetPost(data)
}

export async function listBetPostsByUser(userId) {
  if (!isSupabaseConfigured) return local.listBetPostsByUser(userId)
  const { data, error } = await supabase.from('bet_posts').select('*').eq('user_id', userId)
  if (error) throw error
  return data.map(mapBetPost)
}

// --- Public feed & follows ---------------------------------------------

export async function listPublicFeed() {
  if (!isSupabaseConfigured) return local.listPublicFeed()
  const { data, error } = await supabase
    .from('bet_posts')
    .select('*, profiles(display_name)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({ ...mapBetPost(row), authorName: row.profiles?.display_name ?? 'Someone' }))
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
  return data
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
  return data
}

export async function updateManualEntryStatus(entryId, status) {
  if (!isSupabaseConfigured) return local.updateManualEntryStatus(entryId, status)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('manual_entries')
    .update({ status, settled_at: settledAt })
    .eq('id', entryId)
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Account -----------------------------------------------------------

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
