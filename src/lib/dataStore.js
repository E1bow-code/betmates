// @ts-check
// Single seam between the UI and wherever group/bet/tracker data lives.
// Same swappable-adapter idea as src/api/oddsClient.js: every function
// here has a Supabase-backed implementation (used once VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY are set - see supabase/schema.sql for the tables)
// and a localStorage-backed fallback (src/lib/localBackend.js) so the app
// is fully usable before a Supabase project exists. No UI code should ever
// import supabaseClient.js or localBackend.js directly.

import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import * as local from './localBackend.js'
import { closingLinesFromSnapshots } from '../utils/clv.js'
import { groupCoachSessions } from '../utils/coachSessions.js'
import { freezesGranted, computeStreakTransition } from '../utils/dailyStreak.js'

// Raw Postgrest rows are untyped (no generated Database types - see
// supabase/schema.sql) - these describe the shape each map* function below
// hands back to the UI, which is what every caller actually relies on.
/**
 * @typedef {object} Profile
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {string} dob
 * @property {string} friendCode
 * @property {string[]} bookmakerPrefs
 * @property {{betPosted: boolean, betSettled: boolean, oddsMoved: boolean, [key: string]: boolean}} notificationPrefs
 * @property {string} acceptedTermsAt
 * @property {string} createdAt
 * @property {boolean} isAdmin
 * @property {string|null} avatarUrl
 * @property {number|null} stakeLimitAmount
 * @property {string|null} stakeLimitPeriod
 * @property {string|null} limitBuddyId
 * @property {number|null} bankrollAmount
 * @property {{type: 'flat'|'percent', value: number}|null} stakingRule
 * @property {number} streakCurrentCount
 * @property {string|null} streakLastLoggedDate
 * @property {number} streakFreezesUsed
 * @property {string|null} selfExclusionUntil
 * @property {boolean} isPremium
 * @property {string|null} premiumUntil
 */
/**
 * @typedef {object} Group
 * @property {string} id
 * @property {string} name
 * @property {string} inviteCode
 * @property {string} createdBy
 * @property {string} createdAt
 * @property {boolean} isDiscoverable
 * @property {number} memberCount
 * @property {number|null} priceAmount
 * @property {string} priceCurrency
 * @property {string|null} stripeConnectAccountId
 * @property {boolean} stripeConnectChargesEnabled
 */
/**
 * @typedef {object} BetPost
 * @property {string} id
 * @property {string|null} groupId
 * @property {string} userId
 * @property {string} sport
 * @property {string} marketType
 * @property {any[]} selections
 * @property {number|null} stake
 * @property {boolean} stakeHidden
 * @property {number|null} potentialReturn
 * @property {'group'|'public'} visibility
 * @property {'open'|'won'|'lost'|'void'} status
 * @property {string} createdAt
 * @property {string|null} settledAt
 * @property {any[]|null} outcomes
 * @property {string|null} caption
 * @property {string|null} photoUrl
 * @property {string|null} videoUrl
 * @property {string|null} tag
 * @property {boolean} autoHidden
 */
/**
 * @typedef {object} ManualEntry
 * @property {string} id
 * @property {string} userId
 * @property {string} sport
 * @property {string} marketType
 * @property {any[]} selections
 * @property {number|null} stake
 * @property {number|null} potentialReturn
 * @property {'open'|'won'|'lost'|'void'} status
 * @property {string} createdAt
 * @property {string|null} settledAt
 * @property {any[]|null} outcomes
 */
/**
 * @typedef {object} GroupMessage
 * @property {string} id
 * @property {string} groupId
 * @property {string} userId
 * @property {string} body
 * @property {string} createdAt
 */
/**
 * @typedef {object} FixtureChatMessage
 * @property {string} id
 * @property {string} sport
 * @property {string} eventId
 * @property {string} userId
 * @property {string} authorName
 * @property {string} body
 * @property {string} createdAt
 */
/**
 * @typedef {object} DirectMessage
 * @property {string} id
 * @property {string} senderId
 * @property {string} recipientId
 * @property {string} body
 * @property {string} createdAt
 */
/**
 * @typedef {object} Reaction
 * @property {string} id
 * @property {string} betId
 * @property {string} userId
 * @property {string} emoji
 * @property {string} createdAt
 */
/**
 * @typedef {object} Comment
 * @property {string} id
 * @property {string} betId
 * @property {string} userId
 * @property {string} body
 * @property {string} createdAt
 */
/**
 * @typedef {object} OddsAlert
 * @property {string} id
 * @property {string} sport
 * @property {string} eventId
 * @property {string} eventLabel
 * @property {string} kickoff
 * @property {string} marketLabel
 * @property {string} selectionLabel
 * @property {number} targetDecimal
 * @property {string} createdAt
 * @property {string|null} triggeredAt
 */
/**
 * @typedef {object} Predictor
 * @property {string} id
 * @property {string} groupId
 * @property {string} competition
 * @property {string[]} participants
 * @property {string} createdBy
 * @property {string} createdAt
 * @property {string[]|null} currentStandings
 * @property {string|null} standingsUpdatedBy
 * @property {string|null} standingsUpdatedAt
 */
/**
 * @typedef {object} PredictorEntry
 * @property {string} id
 * @property {string} predictorId
 * @property {string} userId
 * @property {string[]} predictedOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 */
/**
 * @typedef {object} ErrorLog
 * @property {string} id
 * @property {string} message
 * @property {string|null} stack
 * @property {string|null} route
 * @property {string|null} userId
 * @property {string|null} userAgent
 * @property {string} createdAt
 */
/**
 * @typedef {object} AdminAnalytics
 * @property {{totalUsers: number, totalGroups: number, totalBets: number, totalSettled: number, signupsToday: number, signupsThisWeek: number}} overview
 * @property {{date: string, count: number}[]} signupsByDay
 * @property {{date: string, count: number}[]} betsByDay
 * @property {{date: string, count: number}[]} groupsByDay
 * @property {{dau: number, wau: number, mau: number}} activeUsers
 * @property {{current: {userId: string, name: string, count: number}[], longest: {userId: string, name: string, count: number}[]}} topStreaks
 * @property {string} generatedAt
 */

/** @param {any} row @returns {Profile|null} */
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
    stakeLimitPeriod: row.stake_limit_period ?? null,
    limitBuddyId: row.limit_buddy_id ?? null,
    bankrollAmount: row.bankroll_amount ?? null,
    stakingRule: row.staking_rule ?? null,
    streakCurrentCount: row.streak_current_count ?? 0,
    streakLastLoggedDate: row.streak_last_logged_date ?? null,
    streakFreezesUsed: row.streak_freezes_used ?? 0,
    selfExclusionUntil: row.self_exclusion_until ?? null,
    isPremium: row.is_premium ?? false,
    premiumUntil: row.premium_until ?? null
  }
}

/** @param {any} row @returns {Group|null} */
function mapGroup(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    createdAt: row.created_at,
    isDiscoverable: row.is_discoverable ?? false,
    memberCount: row.member_count ?? 0,
    priceAmount: row.price_amount ?? null,
    priceCurrency: row.price_currency ?? 'gbp',
    stripeConnectAccountId: row.stripe_connect_account_id ?? null,
    stripeConnectChargesEnabled: row.stripe_connect_charges_enabled ?? false
  }
}

/** @param {any} row @returns {BetPost} */
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
    settledAt: row.settled_at,
    outcomes: row.outcomes ?? null,
    caption: row.caption ?? null,
    photoUrl: row.photo_url ?? null,
    videoUrl: row.video_url ?? null,
    tag: row.tag ?? null,
    autoHidden: row.auto_hidden ?? false
  }
}

/** @param {any} row @returns {ManualEntry} */
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
    settledAt: row.settled_at,
    outcomes: row.outcomes ?? null
  }
}

// --- Auth -------------------------------------------------------------

/** @returns {Promise<Profile|null>} */
export async function getSession() {
  if (!isSupabaseConfigured) return local.getSession()
  const { data } = await supabase.auth.getSession()
  const authUser = data.session?.user
  if (!authUser) return null
  // maybeSingle, not single: a cached session can outlive its profile row
  // (e.g. the account was deleted from another tab/device while this one
  // still holds a valid, unexpired token) - that's a legitimate "signed
  // out" outcome here, not an error worth a 406 in the console.
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle()
  return mapProfile(profile)
}

// The raw Supabase access token, for the handful of Netlify functions that
// verify the caller's identity themselves (delete-account.js, coachgpt.js's
// free-allowance check, create-checkout-session.js) rather than trusting a
// client-supplied user id. null in local/no-backend mode - there's no real
// session to hand over, and every caller of this already treats a missing
// token as "can't check, so don't gate."
/** @returns {Promise<string|null>} */
export async function getAccessToken() {
  if (!isSupabaseConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * @param {{email: string, password: string, displayName: string, dob: string, referredByCode?: string|null}} params
 * @returns {Promise<Profile|null>}
 */
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

/**
 * @param {{email: string, password: string}} params
 * @returns {Promise<Profile|null>}
 */
export async function signIn({ email, password }) {
  if (!isSupabaseConfigured) return local.signIn({ email })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  // maybeSingle, not single - same reasoning as getSession() above: an
  // auth row can outlive its profiles row (a manual/partial deletion, not
  // just the normal delete-account path, which removes both together).
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  return mapProfile(profile)
}

export async function signOut() {
  if (!isSupabaseConfigured) return local.signOut()
  await supabase.auth.signOut()
}

// Local (no-Supabase) mode has no real email delivery to send a reset link
// through, so this is Supabase-only - callers should check
// isSupabaseConfigured themselves if they want a different message there.
/** @param {string} email */
export async function requestPasswordReset(email) {
  if (!isSupabaseConfigured) throw new Error('Password reset needs a connected Supabase project.')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
  if (error) throw error
}

/** @param {string} newPassword */
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
/** @param {(event: string) => void} callback @returns {() => void} */
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {}
  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event) => callback(event))
  return () => subscription.unsubscribe()
}

// Shared by every subscribeX below (group/fixture chat, direct messages,
// bet posts) - all Realtime access is INSERT-only postgres_changes for now,
// no UPDATE/DELETE. filter is a single `column=eq.value` string, or
// undefined for an unfiltered subscription that relies on the table's RLS
// SELECT policy to scope which rows actually arrive (postgres_changes can't
// express a compound filter like "sender OR recipient" in one string - see
// subscribeDirectMessages/subscribeFixtureChatMessages for why that's
// sometimes the more correct choice, not just a fallback). No local-mode
// counterpart, same as onAuthStateChange above - callers get a no-op
// unsubscribe when Supabase isn't configured.
/**
 * @param {string} table @param {string|undefined} filter
 * @param {(row: any) => any} mapRow @param {(row: any) => void} onInsert
 * @returns {() => void}
 */
function subscribeToInserts(table, filter, mapRow, onInsert) {
  if (!isSupabaseConfigured) return () => {}
  const channel = supabase
    .channel(`${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (payload) => {
      onInsert(mapRow(payload.new))
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Permanently deletes the account (see netlify/functions/delete-account.js
// for what actually gets removed/reassigned). Signs the session out
// locally on success since the user row it belonged to no longer exists.
/** @param {string} userId */
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

// group_members.group_id is a NOT NULL FK, so the joined group always
// resolves - mapGroup's `Group|null` return only covers a missing row,
// which can't happen through this join.
/** @param {string} userId @returns {Promise<Group[]>} */
export async function listMyGroups(userId) {
  if (!isSupabaseConfigured) return local.listMyGroups(userId)
  const { data, error } = await supabase
    .from('group_members')
    .select('groups(*)')
    .eq('user_id', userId)
  if (error) throw error
  return data.map((row) => /** @type {Group} */ (mapGroup(row.groups)))
}

/** @param {string} groupId @returns {Promise<Group|null>} */
export async function getGroup(groupId) {
  if (!isSupabaseConfigured) return local.getGroup(groupId)
  // maybeSingle, not single - a stale/deleted group link is a real, reachable
  // path (GroupFeedPage's `group?.name ?? 'Group'` already renders sanely on
  // null), not a bug worth a raw PostgREST error surfacing verbatim to the
  // user. Matches localBackend.js's getGroup, which already just returns null.
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
  if (error) throw error
  return mapGroup(data)
}

/** @param {string} name @param {string} userId @returns {Promise<Group|null>} */
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

/** @param {string} code @param {string} userId @returns {Promise<Group|null>} */
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

// The lookup half of joinGroupByCode, without the join - lets
// JoinGroupPage preview a group (and its price) before deciding whether
// to auto-join or show a paywall, instead of joining unconditionally.
/** @param {string} code @returns {Promise<Group|null>} */
export async function getGroupByCode(code) {
  if (!isSupabaseConfigured) return local.getGroupByCode(code)
  const { data, error } = await supabase.from('groups').select('*').ilike('invite_code', code.trim()).maybeSingle()
  if (error) throw error
  return mapGroup(data)
}

// Two separate queries rather than one filtered join - PostgREST has no
// clean "not in a subquery" - fetch every discoverable group plus the
// caller's own membership rows, then subtract client-side. Fine at this
// app's scale (nothing in the data layer paginates).
/** @param {string} userId @returns {Promise<Group[]>} */
export async function listDiscoverableGroups(userId) {
  if (!isSupabaseConfigured) return local.listDiscoverableGroups(userId)
  const [{ data: groups, error: groupsError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from('groups').select('*').eq('is_discoverable', true).order('name'),
    supabase.from('group_members').select('group_id').eq('user_id', userId)
  ])
  if (groupsError) throw groupsError
  if (membershipError) throw membershipError
  const joinedIds = new Set((memberships ?? []).map((m) => m.group_id))
  return (groups ?? []).filter((g) => !joinedIds.has(g.id)).map((g) => /** @type {Group} */ (mapGroup(g)))
}

// No invite-code lookup, unlike joinGroupByCode above - the group_members
// insert policy has no invite-code/eligibility check at all ("user joins a
// group as themselves" is just auth.uid() = user_id), the same
// permissiveness joinGroupByCode already relies on. The UI only ever calls
// this with ids surfaced through listDiscoverableGroups.
/** @param {string} groupId @param {string} userId @returns {Promise<Group|null>} */
export async function joinGroupById(groupId, userId) {
  if (!isSupabaseConfigured) return local.joinGroupById(groupId, userId)
  const { data: group, error } = await supabase.from('groups').select('*').eq('id', groupId).single()
  if (error || !group) throw new Error('Group not found.')
  const { error: memberError } = await supabase.from('group_members').upsert({ group_id: groupId, user_id: userId })
  if (memberError) throw memberError
  return mapGroup(group)
}

/** @param {string} groupId @returns {Promise<{id: string, displayName: string, avatarUrl: string|null}[]>} */
export async function listGroupMembers(groupId) {
  if (!isSupabaseConfigured) return local.listGroupMembers(groupId)
  const { data, error } = await supabase
    .from('group_members')
    .select('profiles(id, display_name, referral_count, avatar_url)')
    .eq('group_id', groupId)
  if (error) throw error
  return data.map((row) => {
    const profile = /** @type {{id: string, display_name: string, referral_count: number, avatar_url: string|null}} */ (
      /** @type {unknown} */ (row.profiles)
    )
    return { id: profile.id, displayName: profile.display_name, referralCount: profile.referral_count, avatarUrl: profile.avatar_url ?? null }
  })
}

/** @param {string} groupId @param {string} userId @returns {Promise<true>} */
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
/** @param {string} groupId @param {string} name @returns {Promise<Group|null>} */
export async function renameGroup(groupId, name) {
  if (!isSupabaseConfigured) return local.renameGroup(groupId, name)
  const { data, error } = await supabase.from('groups').update({ name }).eq('id', groupId).select().single()
  if (error) throw error
  return mapGroup(data)
}

/** @param {string} groupId @param {boolean} isDiscoverable @returns {Promise<Group|null>} */
export async function setGroupDiscoverable(groupId, isDiscoverable) {
  if (!isSupabaseConfigured) return local.setGroupDiscoverable(groupId, isDiscoverable)
  const { data, error } = await supabase.from('groups').update({ is_discoverable: isDiscoverable }).eq('id', groupId).select().single()
  if (error) throw error
  return mapGroup(data)
}

// null clears pricing (the group goes back to free-to-join). Plain owner-
// scoped update, already covered by the "creator renames their group" RLS
// policy - only stripe_connect_account_id/charges_enabled need the guard
// trigger, see schema.sql.
/** @param {string} groupId @param {number|null} amountPounds @returns {Promise<Group|null>} */
export async function setGroupPrice(groupId, amountPounds) {
  if (!isSupabaseConfigured) return local.setGroupPrice(groupId, amountPounds)
  const { data, error } = await supabase.from('groups').update({ price_amount: amountPounds }).eq('id', groupId).select().single()
  if (error) throw error
  return mapGroup(data)
}

/** @param {any} row */
function mapGroupSubscription(row) {
  if (!row) return null
  return {
    id: row.id,
    groupId: row.group_id,
    subscriberId: row.subscriber_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at
  }
}

// Whether the signed-in user already has an active (or trialing) paid
// membership for this group - used to skip the paywall on a repeat visit
// to the invite link. Nullable: no row at all is the common case (free
// group, or never subscribed).
/** @param {string} groupId @param {string} userId @returns {Promise<ReturnType<typeof mapGroupSubscription>|null>} */
export async function getGroupSubscription(groupId, userId) {
  if (!isSupabaseConfigured) return local.getGroupSubscription(groupId, userId)
  const { data, error } = await supabase
    .from('group_subscriptions')
    .select('*')
    .eq('group_id', groupId)
    .eq('subscriber_id', userId)
    .maybeSingle()
  if (error) throw error
  return mapGroupSubscription(data)
}

// Owner-only (RLS-scoped) - backs both the earnings-dashboard tiles/list on
// GroupFeedPage.jsx and the CSV export (see csvExport.js's
// groupSubscribersToCsv), so `since` is included even though only the CSV
// currently uses it.
/** @param {string} groupId @returns {Promise<{id: string, displayName: string, status: string, since: string}[]>} */
export async function listGroupSubscribers(groupId) {
  if (!isSupabaseConfigured) return local.listGroupSubscribers(groupId)
  const { data, error } = await supabase
    .from('group_subscriptions')
    .select('*, profiles(display_name)')
    .eq('group_id', groupId)
    .in('status', ['active', 'trialing'])
  if (error) throw error
  return data.map((row) => ({
    id: row.subscriber_id,
    displayName: row.profiles?.display_name ?? 'Someone',
    status: row.status,
    since: row.created_at
  }))
}

/** @param {string} groupId @param {string} memberId @param {string} requesterId @returns {Promise<true>} */
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

/** @param {any} row @returns {GroupMessage} */
function mapGroupMessage(row) {
  return { id: row.id, groupId: row.group_id, userId: row.user_id, body: row.body, createdAt: row.created_at }
}

/** @param {string} groupId @returns {Promise<GroupMessage[]>} */
export async function listGroupMessages(groupId) {
  if (!isSupabaseConfigured) return local.listGroupMessages(groupId)
  const { data, error } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapGroupMessage)
}

/** @param {string} groupId @param {string} userId @param {string} body @returns {Promise<GroupMessage>} */
export async function sendGroupMessage(groupId, userId, body) {
  if (!isSupabaseConfigured) return local.sendGroupMessage(groupId, userId, body)
  const { data, error } = await supabase.from('group_messages').insert({ group_id: groupId, user_id: userId, body }).select().single()
  if (error) throw error
  return mapGroupMessage(data)
}

/** @param {string} groupId @param {(message: GroupMessage) => void} onInsert @returns {() => void} */
export function subscribeGroupMessages(groupId, onInsert) {
  return subscribeToInserts('group_messages', `group_id=eq.${groupId}`, mapGroupMessage, onInsert)
}

// --- Fixture (match-day) chat ---------------------------------------------
// A chat room scoped to one fixture/fight/event rather than a group - see
// supabase/schema.sql's fixture_chat_messages for why display_name is
// denormalized onto the row instead of joined from profiles.

/** @param {any} row @returns {FixtureChatMessage} */
function mapFixtureChatMessage(row) {
  return { id: row.id, sport: row.sport, eventId: row.event_id, userId: row.user_id, authorName: row.display_name, body: row.body, createdAt: row.created_at }
}

/** @param {string} sport @param {string} eventId @returns {Promise<FixtureChatMessage[]>} */
export async function listFixtureChatMessages(sport, eventId) {
  if (!isSupabaseConfigured) return local.listFixtureChatMessages(sport, eventId)
  const { data, error } = await supabase
    .from('fixture_chat_messages')
    .select('*')
    .eq('sport', sport)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapFixtureChatMessage)
}

/**
 * @param {string} sport @param {string} eventId @param {string} userId
 * @param {string} displayName @param {string} body
 * @returns {Promise<FixtureChatMessage>}
 */
export async function sendFixtureChatMessage(sport, eventId, userId, displayName, body) {
  if (!isSupabaseConfigured) return local.sendFixtureChatMessage(sport, eventId, userId, displayName, body)
  const { data, error } = await supabase
    .from('fixture_chat_messages')
    .insert({ sport, event_id: eventId, user_id: userId, display_name: displayName, body })
    .select()
    .single()
  if (error) throw error
  return mapFixtureChatMessage(data)
}

// Filtered by sport server-side - Realtime's postgres_changes filter only
// supports a single column, and there's no generated room_id column to
// filter on the exact (sport, eventId) pair (that'd be the fuller fix), but
// filtering on sport alone still cuts an open fixture-chat panel's traffic
// down from "every fixture's chat, app-wide" to "every fixture chat within
// this one sport" - eventId still has to be checked client-side.
/** @param {string} sport @param {string} eventId @param {(message: FixtureChatMessage) => void} onInsert @returns {() => void} */
export function subscribeFixtureChatMessages(sport, eventId, onInsert) {
  return subscribeToInserts('fixture_chat_messages', `sport=eq.${sport}`, mapFixtureChatMessage, (message) => {
    if (message.eventId === eventId) onInsert(message)
  })
}

// --- Direct messages -----------------------------------------------------
// 1:1 chat between two friends, separate from group_messages (scoped to a
// group) and bet_comments (threaded under one bet post).

/** @param {any} row @returns {DirectMessage} */
function mapDirectMessage(row) {
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at }
}

function mapCoachMessage(row) {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    role: row.role,
    body: row.body,
    grounding: row.grounding ?? null,
    recommendation: row.recommendation ?? null,
    result: row.result ?? null,
    createdAt: row.created_at
  }
}

// sessionId scopes to one conversation - CoachGptPage.jsx's active chat.
// Omit it to fetch every session (only listCoachSessions does this, to
// group history) - not exposed as the page's own default, since loading
// every past conversation into the active view is exactly what "New chat"
// is meant to avoid.
/** @param {string} userId @param {string} [sessionId] @returns {Promise<{id: string, userId: string, sessionId: string, role: 'user'|'assistant', body: string, grounding: object|null, recommendation: object|null, result: string|null, createdAt: string}[]>} */
export async function listCoachMessages(userId, sessionId) {
  if (!isSupabaseConfigured) return local.listCoachMessages(userId, sessionId)
  let query = supabase.from('coach_messages').select('*').eq('user_id', userId)
  if (sessionId) query = query.eq('session_id', sessionId)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(500)
  if (error) throw error
  return data.map(mapCoachMessage)
}

// grounding: real BetSlip legs a "Log this" affordance can pre-fill from -
// see netlify/functions/coachgpt.js's groundFixtureOutcomes/groundRunner.
// Only ever set on an assistant message; always null on a user message.
// recommendation: the one full leg (same shape as grounding's entries)
// CoachGPT's lock_in_recommendation tool named as its lean - null until
// netlify/functions/coach-settle.js resolves `result` on it.
/** @param {{userId: string, sessionId: string, role: 'user'|'assistant', body: string, grounding?: object|null, recommendation?: object|null}} entry */
export async function addCoachMessage({ userId, sessionId, role, body, grounding = null, recommendation = null }) {
  if (!isSupabaseConfigured) return local.addCoachMessage({ userId, sessionId, role, body, grounding, recommendation })
  const { data, error } = await supabase
    .from('coach_messages')
    .insert({ user_id: userId, session_id: sessionId, role, body, grounding, recommendation })
    .select()
    .single()
  if (error) throw error
  return mapCoachMessage(data)
}

// Every past conversation, grouped for CoachGptPage.jsx's history sheet -
// grouping happens client-side in groupCoachSessions() rather than a SQL
// GROUP BY, since the 500-row cap above already keeps this small and it
// lets local mode share the exact same grouping logic.
/** @param {string} userId @returns {Promise<{sessionId: string, title: string, startedAt: string, lastMessageAt: string, messageCount: number}[]>} */
export async function listCoachSessions(userId) {
  return groupCoachSessions(await listCoachMessages(userId))
}

/** @param {string} userId @returns {Promise<{id: string, displayName: string, avatarUrl: string|null}|null>} */
export async function getProfileById(userId) {
  if (!isSupabaseConfigured) return local.getProfileById(userId)
  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url } : null
}

/** @param {string} userId @param {string} friendId @returns {Promise<DirectMessage[]>} */
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

/** @param {string} userId @param {string} friendId @param {string} body @returns {Promise<DirectMessage>} */
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

// Unfiltered - direct_messages' RLS ("auth.uid() = sender_id or recipient_id")
// already scopes delivery to exactly "my own sent+received messages", which
// is the actual security boundary here, not a convenience shortcut. The
// friendId narrowing below is pure UI logic (which open thread to append
// to) - it also means a message the same account sends from a second
// device arrives here correctly, unlike a sender-only filter would.
/** @param {string} userId @param {string} friendId @param {(message: DirectMessage) => void} onInsert @returns {() => void} */
export function subscribeDirectMessages(userId, friendId, onInsert) {
  return subscribeToInserts('direct_messages', undefined, mapDirectMessage, (message) => {
    const isThisThread =
      (message.senderId === friendId && message.recipientId === userId) ||
      (message.senderId === userId && message.recipientId === friendId)
    if (isThisThread) onInsert(message)
  })
}

// Same channel shape as subscribeDirectMessages but without friend
// narrowing - "something arrived for me", used to drive a live inbox/unread
// badge rather than render one specific thread.
/** @param {string} userId @param {(message: DirectMessage) => void} onInsert @returns {() => void} */
export function subscribeInboxMessages(userId, onInsert) {
  return subscribeToInserts('direct_messages', undefined, mapDirectMessage, onInsert)
}

// One row per conversation (the latest message with each person you've
// exchanged messages with), not every message - the inbox is a list of
// threads, not a merged timeline. Rows come back newest-message-first, and
// since a Map keeps only the first entry per friendId, that's automatically
// each conversation's most recent message.
/**
 * @param {string} userId
 * @returns {Promise<{friendId: string, lastBody: string, lastAt: string, lastFromFriend: boolean, friendName: string, friendAvatarUrl: string|null}[]>}
 */
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
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
}

// --- Bet posts --------------------------------------------------------

/** @param {string} groupId @returns {Promise<BetPost[]>} */
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

/** @param {string} groupId @param {(post: BetPost) => void} onInsert @returns {() => void} */
export function subscribeGroupFeed(groupId, onInsert) {
  return subscribeToInserts('bet_posts', `group_id=eq.${groupId}`, mapBetPost, onInsert)
}

// Called (not awaited) from every bet-creation path below - a failure here
// should never hold up or break the bet save it's a side effect of, same
// "never let a secondary effect break the primary action" rule notify.js
// already follows for push sends. Reads the profile's own persisted streak
// state rather than re-deriving it, since a freeze-bridged gap can't be
// recovered from bet history alone - see supabase/schema.sql's comment on
// why streak_current_count/streak_last_logged_date are stored at all.
async function bumpDailyStreak(userId) {
  if (!isSupabaseConfigured) return local.bumpDailyStreak(userId)
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('streak_current_count, streak_last_logged_date, streak_freezes_used, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) return
    const today = new Date().toISOString().slice(0, 10)
    const freezesAvailable = freezesGranted(profile.created_at) - profile.streak_freezes_used
    const transition = computeStreakTransition({
      currentCount: profile.streak_current_count,
      lastLoggedDate: profile.streak_last_logged_date,
      freezesAvailable,
      today
    })
    if (!transition.changed) return
    await supabase
      .from('profiles')
      .update({
        streak_current_count: transition.currentCount,
        streak_last_logged_date: transition.lastLoggedDate,
        streak_freezes_used: profile.streak_freezes_used + (transition.freezeConsumed ? 1 : 0)
      })
      .eq('id', userId)
  } catch {
    // Best-effort - see comment above.
  }
}

/**
 * @param {{groupId: string|null, userId: string, sport: string, marketType: string, selections: any[], stake: number|null, stakeHidden?: boolean, potentialReturn: number|null, visibility?: 'group'|'public', caption?: string|null, photoUrl?: string|null, videoUrl?: string|null, tag?: string|null}} post
 * @returns {Promise<BetPost>}
 */
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
      visibility: post.visibility ?? 'group',
      caption: post.caption ?? null,
      photo_url: post.photoUrl ?? null,
      video_url: post.videoUrl ?? null,
      tag: post.tag ?? null
    })
    .select()
    .single()
  if (error) throw error
  bumpDailyStreak(post.userId)
  return mapBetPost(data)
}

// Path prefixed with the uploader's own user id, same convention as
// uploadAvatar/uploadVideoBlob. Private bucket (see schema.sql) since a
// group pick's photo needs to stay exactly as private as the pick itself -
// the key stored on bet_posts.photo_url is the object path, not a
// resolved URL; getPostPhotoUrl below resolves a short-lived signed URL
// per read, same as getVideoPlaybackUrl.
const PHOTO_EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** @param {string} userId @param {Blob} blob @returns {Promise<string>} */
export async function uploadPostPhoto(userId, blob) {
  if (!isSupabaseConfigured) return local.uploadPostPhoto(userId, blob)
  const ext = PHOTO_EXT_BY_MIME[blob.type] || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('post-photos').upload(path, blob)
  if (error) throw error
  return path
}

/** @param {string} photoKey @returns {Promise<string|null>} */
export async function getPostPhotoUrl(photoKey) {
  if (!isSupabaseConfigured) return local.getPostPhotoUrl(photoKey)
  const { data, error } = await supabase.storage.from('post-photos').createSignedUrl(photoKey, 3600)
  if (error) return null
  return data.signedUrl
}

// Same shape as uploadPostPhoto/getPostPhotoUrl above, a separate
// post-videos bucket rather than the `videos` bucket used for the Tips
// feed - see schema.sql's comment on why bet_posts video needs the
// group/public visibility check instead of that bucket's friend-scoped one.
/** @param {string} userId @param {Blob} blob @returns {Promise<string>} */
export async function uploadPostVideo(userId, blob) {
  if (!isSupabaseConfigured) return local.uploadPostVideo(userId, blob)
  const ext = VIDEO_EXT_BY_MIME[blob.type] || 'webm'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('post-videos').upload(path, blob)
  if (error) throw error
  return path
}

/** @param {string} videoKey @returns {Promise<string|null>} */
export async function getPostVideoUrl(videoKey) {
  if (!isSupabaseConfigured) return local.getPostVideoUrl(videoKey)
  const { data, error } = await supabase.storage.from('post-videos').createSignedUrl(videoKey, 3600)
  if (error) return null
  return data.signedUrl
}

/**
 * @param {string} betId @param {'open'|'won'|'lost'|'void'} status
 * @param {number} [potentialReturnOverride] @param {any[]} [outcomes]
 * @returns {Promise<BetPost>}
 */
export async function updateBetStatus(betId, status, potentialReturnOverride, outcomes) {
  if (!isSupabaseConfigured) return local.updateBetStatus(betId, status, potentialReturnOverride, outcomes)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  /** @type {{status: string, settled_at: string|null, potential_return?: number, outcomes?: any[]}} */
  const update = { status, settled_at: settledAt }
  if (potentialReturnOverride !== undefined) update.potential_return = potentialReturnOverride
  if (outcomes !== undefined) update.outcomes = outcomes
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
/**
 * @param {string} betId
 * @param {{stake: number|null, stakeHidden?: boolean, potentialReturn: number|null}} params
 * @returns {Promise<BetPost>}
 */
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
/** @param {string} betId @returns {Promise<true>} */
export async function deleteBetPost(betId) {
  if (!isSupabaseConfigured) return local.deleteBetPost(betId)
  const { data, error } = await supabase.from('bet_posts').delete().eq('id', betId).select()
  if (error) throw error
  if (!data?.length) throw new Error("Couldn't delete this bet - it may already be settled.")
  return true
}

/** @param {string} userId @returns {Promise<BetPost[]>} */
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
/** @param {string} [viewerId] @returns {Promise<(BetPost & {authorName: string, authorCode: string|null, authorAvatarUrl: string|null})[]>} */
export async function listPublicFeed(viewerId) {
  if (!isSupabaseConfigured) return local.listPublicFeed(viewerId)
  const { data, error } = await supabase
    .from('bet_posts')
    .select('*, profiles(display_name, friend_code, avatar_url)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
  if (error) throw error
  const posts = data.map((row) => ({
    ...mapBetPost(row),
    authorName: row.profiles?.display_name ?? 'Someone',
    authorCode: row.profiles?.friend_code ?? null,
    authorAvatarUrl: row.profiles?.avatar_url ?? null
  }))
  if (!viewerId) return posts
  const blockedIds = await listBlockedUserIds(viewerId)
  return blockedIds.length ? posts.filter((p) => !blockedIds.includes(p.userId)) : posts
}

// Unfiltered - bet_posts' RLS (member-of-group OR visibility='public') is
// exactly the set ActivityContext already unions from listFeedForUser +
// listPublicFeed, so one channel covers "a post I can now see just
// appeared" with no per-group channel enumeration.
/** @param {(post: BetPost) => void} onInsert @returns {() => void} */
export function subscribeFeedActivity(onInsert) {
  return subscribeToInserts('bet_posts', undefined, mapBetPost, onInsert)
}

/** @param {string} userId @param {string} targetId @returns {Promise<true>} */
export async function followUser(userId, targetId) {
  if (!isSupabaseConfigured) return local.followUser(userId, targetId)
  const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
  if (error && error.code !== '23505') throw error // 23505 = already following, ignore
  return true
}

/** @param {string} userId @param {string} targetId @returns {Promise<true>} */
export async function unfollowUser(userId, targetId) {
  if (!isSupabaseConfigured) return local.unfollowUser(userId, targetId)
  const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
  if (error) throw error
  return true
}

/** @param {string} userId @returns {Promise<string[]>} */
export async function listFollowing(userId) {
  if (!isSupabaseConfigured) return local.listFollowing(userId)
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
  if (error) throw error
  return data.map((row) => row.following_id)
}

// Count only, not the follower list itself - used to show "N followers" as
// a pitch stat (GoProSheet, JoinGroupPage's paywall) without pulling every
// follower's id down just to take .length client-side.
/** @param {string} userId @returns {Promise<number>} */
export async function getFollowerCount(userId) {
  if (!isSupabaseConfigured) return local.getFollowerCount(userId)
  const { count, error } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId)
  if (error) throw error
  return count ?? 0
}

// --- Blocks & reports ----------------------------------------------------
// Public-feed-only (see BetCard.jsx variant='public') - group posts aren't
// blockable since a group is already people you chose to be around.

/** @param {string} userId @param {string} blockedId @returns {Promise<true>} */
export async function blockUser(userId, blockedId) {
  if (!isSupabaseConfigured) return local.blockUser(userId, blockedId)
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: blockedId })
  if (error && error.code !== '23505') throw error // already blocked, ignore
  return true
}

/** @param {string} userId @param {string} blockedId @returns {Promise<true>} */
export async function unblockUser(userId, blockedId) {
  if (!isSupabaseConfigured) return local.unblockUser(userId, blockedId)
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId)
  if (error) throw error
  return true
}

/** @param {string} userId @returns {Promise<string[]>} */
async function listBlockedUserIds(userId) {
  if (!isSupabaseConfigured) return local.listBlockedUserIds(userId)
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
  if (error) throw error
  return data.map((row) => row.blocked_id)
}

/** @param {string} userId @returns {Promise<{id: string, displayName: string}[]>} */
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
  return data.map((row) => {
    const profile = /** @type {{display_name: string}|null} */ (/** @type {unknown} */ (row.profiles))
    return { id: row.blocked_id, displayName: profile?.display_name ?? 'Someone' }
  })
}

/** @param {string} postId @param {string} reporterId @param {string} reason @returns {Promise<true>} */
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

/**
 * @typedef {object} PostReport
 * @property {string} id
 * @property {string} reason
 * @property {string} createdAt
 * @property {string} reporterName
 * @property {string} postId
 * @property {{id: string, userId: string, authorName: string, event: string, stake: number|null, status: string}} post
 */
/** @returns {Promise<PostReport[]>} */
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
    .map((row) => {
      const reporter = /** @type {{display_name: string}|null} */ (/** @type {unknown} */ (row.reporter))
      const post = /** @type {{id: string, user_id: string, selections: any[], stake: number|null, status: string, author: {display_name: string}|null}} */ (
        /** @type {unknown} */ (row.post)
      )
      return {
        id: row.id,
        reason: row.reason,
        createdAt: row.created_at,
        reporterName: reporter?.display_name ?? 'Someone',
        postId: row.post_id,
        post: {
          id: post.id,
          userId: post.user_id,
          authorName: post.author?.display_name ?? 'Someone',
          event: post.selections?.[0]?.event ?? 'Bet',
          stake: post.stake,
          status: post.status
        }
      }
    })
}

// Clears the reports AND un-hides the post (see auto_hide_reported_post in
// schema.sql) - an admin reviewing and choosing to keep a post should
// actually restore its visibility, not just silently clear the report
// queue while it stays invisible to everyone but the author.
/** @param {string} postId @returns {Promise<true>} */
export async function dismissReportsForPost(postId) {
  if (!isSupabaseConfigured) return local.dismissReportsForPost(postId)
  const { error } = await supabase.from('post_reports').delete().eq('post_id', postId)
  if (error) throw error
  const { error: unhideError } = await supabase.from('bet_posts').update({ auto_hidden: false }).eq('id', postId)
  if (unhideError) throw unhideError
  return true
}

/** @param {string} postId @returns {Promise<true>} */
export async function removePost(postId) {
  if (!isSupabaseConfigured) return local.removePost(postId)
  const { error } = await supabase.from('bet_posts').delete().eq('id', postId)
  if (error) throw error
  return true
}

// --- Reactions & comments ------------------------------------------------

// Seeded here (the one place every full reaction row passes through -
// listReactions, toggleReaction, and the live INSERT handler below) so a
// later DELETE can look up which bet a reaction belonged to even though
// Supabase's postgres_changes DELETE payload only reliably includes the
// primary key in practice (payload.old), regardless of REPLICA IDENTITY -
// see subscribeBetActivity's DELETE handler. Capped like apiCache.js's
// MAX_ENTRIES so a long session's worth of reactions can't grow this
// unbounded; oldest-inserted entries are evicted first (Map preserves
// insertion order).
const reactionBetIndex = new Map() // reactionId -> betId
const REACTION_INDEX_CAP = 500

/** @param {any} row @returns {Reaction} */
function mapReaction(row) {
  const reaction = { id: row.id, betId: row.bet_id, userId: row.user_id, emoji: row.emoji, createdAt: row.created_at }
  reactionBetIndex.set(reaction.id, reaction.betId)
  if (reactionBetIndex.size > REACTION_INDEX_CAP) reactionBetIndex.delete(reactionBetIndex.keys().next().value)
  return reaction
}

/** @param {any} row @returns {Comment} */
function mapComment(row) {
  return { id: row.id, betId: row.bet_id, userId: row.user_id, body: row.body, createdAt: row.created_at }
}

// Returns just the row that changed (rather than a fresh SELECT * of every
// reaction on this bet) so BetCard.jsx can update its local state
// incrementally instead of replacing the whole array - a full replace can
// race with another user's reaction arriving over subscribeBetActivity's
// shared channel in the gap between this function's own write and its old
// re-SELECT, clobbering it out of local state until the next event.
/** @param {string} betId @param {string} userId @param {string} emoji @returns {Promise<{action: 'added'|'removed', reaction: Reaction}>} */
export async function toggleReaction(betId, userId, emoji) {
  if (!isSupabaseConfigured) return local.toggleReaction(betId, userId, emoji)
  const { data: existing } = await supabase
    .from('bet_reactions')
    .select('*')
    .eq('bet_id', betId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (existing) {
    await supabase.from('bet_reactions').delete().eq('id', existing.id)
    return { action: 'removed', reaction: mapReaction(existing) }
  }
  const { data, error } = await supabase.from('bet_reactions').insert({ bet_id: betId, user_id: userId, emoji }).select().single()
  if (error) throw error
  return { action: 'added', reaction: mapReaction(data) }
}

/** @param {string} betId @returns {Promise<Reaction[]>} */
export async function listReactions(betId) {
  if (!isSupabaseConfigured) return local.listReactions(betId)
  const { data, error } = await supabase.from('bet_reactions').select('*').eq('bet_id', betId)
  if (error) throw error
  return data.map(mapReaction)
}

/** @param {string} betId @param {string} userId @param {string} body @returns {Promise<Comment>} */
export async function addComment(betId, userId, body) {
  if (!isSupabaseConfigured) return local.addComment(betId, userId, body)
  const { data, error } = await supabase
    .from('bet_comments')
    .insert({ bet_id: betId, user_id: userId, body })
    .select()
    .single()
  if (error) throw error
  return mapComment(data)
}

/** @param {string} betId @returns {Promise<Comment[]>} */
export async function listComments(betId) {
  if (!isSupabaseConfigured) return local.listComments(betId)
  const { data, error } = await supabase
    .from('bet_comments')
    .select('*')
    .eq('bet_id', betId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapComment)
}

// For ActivityContext.jsx's in-app "commented" notification kind - feeds
// off betIds the caller already fetched (its own listBetPostsByUser call),
// rather than re-querying bet_posts here just to find them. excludeUserId
// drops the viewer's own comments on their own posts (nothing to notify
// yourself about). Comment-author names weren't previously threaded
// through to any caller, so this joins profiles the same way
// listAllReports.js does for its own post author.
/**
 * @param {string[]} betIds
 * @param {string} excludeUserId
 * @returns {Promise<{id: string, betId: string, userId: string, name: string, body: string, createdAt: string}[]>}
 */
export async function listRecentCommentsOnPosts(betIds, excludeUserId) {
  if (!betIds.length) return []
  if (!isSupabaseConfigured) return local.listRecentCommentsOnPosts(betIds, excludeUserId)
  const { data, error } = await supabase
    .from('bet_comments')
    .select('id, bet_id, user_id, body, created_at, commenter:profiles!bet_comments_user_id_fkey(display_name)')
    .in('bet_id', betIds)
    .neq('user_id', excludeUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data.map((row) => {
    const commenter = /** @type {{display_name: string}|null} */ (/** @type {unknown} */ (row.commenter))
    return {
      id: row.id,
      betId: row.bet_id,
      userId: row.user_id,
      name: commenter?.display_name ?? 'Someone',
      body: row.body,
      createdAt: row.created_at
    }
  })
}

// Renders non-virtualized in potentially unbounded lists (PublicFeedView.jsx
// fetches every public post with no .limit()), so unlike every other
// subscribeX below this can't be one channel per mounted BetCard - that
// risks dozens of concurrent WebSocket subscriptions on that page alone.
// Instead this is a single shared channel, created lazily on the first
// subscriber and torn down when the last unsubscribes, fanning events out
// to whichever bet_id they're for via a betId -> Set<handlers> registry.
// Bespoke rather than built on subscribeToInserts above: two source tables
// feed one fan-out map, and reactions need DELETE (toggleReaction has no
// UPDATE path - see above) which that helper doesn't support. In principle
// `alter table bet_reactions replica identity full` (see schema.sql) should
// make a DELETE's payload.old carry the full row instead of just the
// primary key - in practice Supabase's Realtime broadcast has been
// observed still sending only {id} regardless, so the DELETE handler below
// falls back to reactionBetIndex (populated by mapReaction above) rather
// than trusting payload.old.bet_id to be present.
const betActivityListeners = new Map() // betId -> Set<{onComment?, onReactionInsert?, onReactionDelete?}>
let betActivityChannel = null
let betActivityRefCount = 0

function ensureBetActivityChannel() {
  if (betActivityChannel || !isSupabaseConfigured) return
  betActivityChannel = supabase
    .channel(`bet-activity:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bet_comments' }, (payload) => {
      const comment = mapComment(payload.new)
      betActivityListeners.get(comment.betId)?.forEach((h) => h.onComment?.(comment))
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bet_reactions' }, (payload) => {
      const reaction = mapReaction(payload.new)
      betActivityListeners.get(reaction.betId)?.forEach((h) => h.onReactionInsert?.(reaction))
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bet_reactions' }, (payload) => {
      const reactionId = payload.old.id
      const betId = payload.old.bet_id ?? reactionBetIndex.get(reactionId)
      if (!betId) return
      reactionBetIndex.delete(reactionId)
      const reaction = { id: reactionId, betId, userId: payload.old.user_id, emoji: payload.old.emoji, createdAt: payload.old.created_at }
      betActivityListeners.get(betId)?.forEach((h) => h.onReactionDelete?.(reaction))
    })
    .subscribe()
}

/**
 * @param {string} betId
 * @param {{onComment?: (c: Comment) => void, onReactionInsert?: (r: Reaction) => void, onReactionDelete?: (r: Reaction) => void}} handlers
 * @returns {() => void}
 */
export function subscribeBetActivity(betId, handlers) {
  if (!isSupabaseConfigured) return () => {}
  if (!betActivityListeners.has(betId)) betActivityListeners.set(betId, new Set())
  betActivityListeners.get(betId).add(handlers)
  betActivityRefCount++
  ensureBetActivityChannel()
  return () => {
    const set = betActivityListeners.get(betId)
    set?.delete(handlers)
    if (set && set.size === 0) betActivityListeners.delete(betId)
    betActivityRefCount--
    if (betActivityRefCount === 0 && betActivityChannel) {
      supabase.removeChannel(betActivityChannel)
      betActivityChannel = null
    }
  }
}

// --- Bet copies (engagement tracking) -------------------------------------

/** @param {string} originalBetId @param {string} copyingUserId */
export async function recordBetCopy(originalBetId, copyingUserId) {
  if (!isSupabaseConfigured) return local.recordBetCopy(originalBetId, copyingUserId)
  const { error } = await supabase
    .from('bet_copies')
    .insert({ original_bet_id: originalBetId, copying_user_id: copyingUserId })
  if (error) throw error
}

/** @param {string} betId @returns {Promise<any[]>} */
export async function listBetCopies(betId) {
  if (!isSupabaseConfigured) return local.listBetCopies(betId)
  const { data, error } = await supabase.from('bet_copies').select('*').eq('original_bet_id', betId)
  if (error) throw error
  return data
}

// --- Tracker (manual entries, separate from group bet_posts) --------------

/** @param {string} userId @returns {Promise<ManualEntry[]>} */
export async function listManualEntries(userId) {
  if (!isSupabaseConfigured) return local.listManualEntries(userId)
  const { data, error } = await supabase.from('manual_entries').select('*').eq('user_id', userId)
  if (error) throw error
  return data.map(mapManualEntry)
}

/**
 * @param {{userId: string, sport: string, marketType: string, selections: any[], stake: number|null, potentialReturn: number|null}} entry
 * @returns {Promise<ManualEntry>}
 */
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
  bumpDailyStreak(entry.userId)
  return mapManualEntry(data)
}

// potentialReturnOverride is only passed for an each-way "placed, didn't
// win" result (see TrackerPage) - the amount actually returned there is
// the place-part payout, not the optimistic full-win figure stored when
// the bet was logged, so it needs correcting alongside the status.
/**
 * @param {string} entryId @param {'open'|'won'|'lost'|'void'} status
 * @param {number} [potentialReturnOverride] @param {any[]} [outcomes]
 * @returns {Promise<any>}
 */
export async function updateManualEntryStatus(entryId, status, potentialReturnOverride, outcomes) {
  if (!isSupabaseConfigured) return local.updateManualEntryStatus(entryId, status, potentialReturnOverride, outcomes)
  const settledAt = ['won', 'lost', 'void'].includes(status) ? new Date().toISOString() : null
  /** @type {{status: string, settled_at: string|null, potential_return?: number, outcomes?: any[]}} */
  const update = { status, settled_at: settledAt }
  if (potentialReturnOverride !== undefined) update.potential_return = potentialReturnOverride
  if (outcomes !== undefined) update.outcomes = outcomes
  const { data, error } = await supabase
    .from('manual_entries')
    .update(update)
    .eq('id', entryId)
    .select()
    .single()
  if (error) throw error
  return data
}

// The closing line for each outcome an open or settled bet references - the
// latest price netlify/functions/odds-snapshot.js recorded at or before
// kickoff, keyed the way src/utils/clv.js looks it up
// ({eventId|marketKey|outcomeName}). This is what turns the Tracker's
// device-local "line value" into true, cross-device Closing Line Value. Local
// mode has no snapshot job, so its twin returns nothing and the UI degrades to
// line value.
/** @param {string[]} fixtureIds @returns {Promise<Record<string, number>>} */
export async function getClosingLines(fixtureIds) {
  if (!isSupabaseConfigured) return local.getClosingLines(fixtureIds)
  const ids = [...new Set((fixtureIds ?? []).filter(Boolean))]
  if (!ids.length) return {}
  const [{ data: snaps }, { data: fx }] = await Promise.all([
    supabase.from('odds_snapshots').select('fixture_id,market,selection,odds,fetched_at').in('fixture_id', ids),
    supabase.from('fixtures').select('id,kickoff').in('id', ids)
  ])
  const kickoff = new Map((fx ?? []).map((f) => [f.id, f.kickoff]))
  // The "latest price at or before kickoff" reduction lives in clv.js so the
  // season-rollover function can build the exact same closing-line map.
  return closingLinesFromSnapshots(snaps, kickoff)
}

// Past months' group leaderboard winners, most recent first - the permanent
// half of Leaderboard.jsx's "Past champions" strip. Written once a month by
// netlify/functions/season-rollover.js; nothing here writes to
// season_results client-side (see supabase/schema.sql - there's no insert
// policy for it). Global-scope rows aren't fetched through here at all -
// HallOfFamePage.jsx reads those via netlify/functions/hall-of-fame.js's
// service-role client instead, same as every other record on that page.
/** @param {string} groupId @returns {Promise<{period: string, winnerUserId: string|null, winnerName: string, profit: number, roi: number|null, winRate: number|null, settledCount: number, clvWinnerUserId: string|null, clvWinnerName: string|null, clvAvgPct: number|null, clvBeatRate: number|null, clvSample: number|null}[]>} */
export async function listSeasonResults(groupId) {
  if (!isSupabaseConfigured) return local.listSeasonResults(groupId)
  const { data, error } = await supabase
    .from('season_results')
    .select('period,winner_user_id,winner_name,profit,roi,win_rate,settled_count,clv_winner_user_id,clv_winner_name,clv_avg_pct,clv_beat_rate,clv_sample')
    .eq('scope', 'group')
    .eq('group_id', groupId)
    .order('period', { ascending: false })
    .limit(12)
  if (error) throw error
  return data.map((row) => ({
    period: row.period,
    winnerUserId: row.winner_user_id,
    winnerName: row.winner_name,
    profit: Number(row.profit),
    roi: row.roi === null ? null : Number(row.roi),
    winRate: row.win_rate === null ? null : Number(row.win_rate),
    settledCount: row.settled_count,
    clvWinnerUserId: row.clv_winner_user_id,
    clvWinnerName: row.clv_winner_name,
    clvAvgPct: row.clv_avg_pct === null ? null : Number(row.clv_avg_pct),
    clvBeatRate: row.clv_beat_rate === null ? null : Number(row.clv_beat_rate),
    clvSample: row.clv_sample
  }))
}

// The full snapshot HISTORY for one fixture, grouped per outcome - what
// src/utils/sharpMoney.js needs to detect real movement over time, as
// opposed to getClosingLines above which only cares about the single
// latest pre-kickoff price. Only ever has data for a fixture someone
// followed (or bet on) while snapshots were being taken - see
// netlify/functions/odds-snapshot.js's follow-based snapshotting; a
// fixture nobody followed simply returns an empty object, same "honest
// absence, not an error" contract getClosingLines already uses.
/** @param {string} fixtureId @returns {Promise<Record<string, {odds: number, fetchedAt: string}[]>>} */
export async function getOddsSnapshotSeries(fixtureId) {
  if (!isSupabaseConfigured) return local.getOddsSnapshotSeries(fixtureId)
  if (!fixtureId) return {}
  const { data, error } = await supabase
    .from('odds_snapshots')
    .select('market,selection,odds,fetched_at')
    .eq('fixture_id', fixtureId)
    .order('fetched_at', { ascending: true })
  if (error) throw error
  /** @type {Record<string, {odds: number, fetchedAt: string}[]>} */
  const series = {}
  for (const row of data ?? []) {
    const key = `${row.market}|${row.selection}`
    if (!series[key]) series[key] = []
    series[key].push({ odds: Number(row.odds), fetchedAt: row.fetched_at })
  }
  return series
}

// Corrects a mis-typed stake on a private entry that's still open - same
// status = 'open' restriction as updateBetPost above, enforced by RLS too.
/** @param {string} entryId @param {{stake: number|null, potentialReturn: number|null}} params @returns {Promise<ManualEntry>} */
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
/** @param {string} entryId @returns {Promise<true>} */
export async function deleteManualEntry(entryId) {
  if (!isSupabaseConfigured) return local.deleteManualEntry(entryId)
  const { data, error } = await supabase.from('manual_entries').delete().eq('id', entryId).select()
  if (error) throw error
  if (!data?.length) throw new Error("Couldn't delete this entry - it may already be settled.")
  return true
}

// --- Account -----------------------------------------------------------

/** @param {string} userId @param {string} displayName @returns {Promise<string>} */
export async function updateDisplayName(userId, displayName) {
  if (!isSupabaseConfigured) return local.updateDisplayName(userId, displayName)
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId)
  if (error) throw error
  return displayName
}

/** @param {string} userId @param {string[]} prefs @returns {Promise<string[]>} */
export async function updateBookmakerPrefs(userId, prefs) {
  if (!isSupabaseConfigured) return local.updateBookmakerPrefs(userId, prefs)
  const { error } = await supabase.from('profiles').update({ bookmaker_prefs: prefs }).eq('id', userId)
  if (error) throw error
  return prefs
}

/** @param {string} userId @param {Profile['notificationPrefs']} prefs @returns {Promise<Profile['notificationPrefs']>} */
export async function updateNotificationPrefs(userId, prefs) {
  if (!isSupabaseConfigured) return local.updateNotificationPrefs(userId, prefs)
  const { error } = await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', userId)
  if (error) throw error
  return prefs
}

// amount/period both null clears the limit (the "off" state).
/**
 * @param {string} userId @param {{amount: number|null, period: string|null}} params
 * @returns {Promise<{amount: number|null, period: string|null}>}
 */
export async function updateStakeLimit(userId, { amount, period }) {
  if (!isSupabaseConfigured) return local.updateStakeLimit(userId, { amount, period })
  const { error } = await supabase
    .from('profiles')
    .update({ stake_limit_amount: amount, stake_limit_period: period })
    .eq('id', userId)
  if (error) throw error
  return { amount, period }
}

// A binding, timed app lockout - the harder tool alongside the soft
// stake_limit_amount nudge above (see supabase/schema.sql's
// guard_self_exclusion trigger for why a raw update can't shorten or clear
// an active one early; this function has no special handling for that -
// the DB enforces it either way). `until` is an ISO string in the future;
// callers only ever extend, never clear, while one is still active.
/** @param {string} userId @param {string} until @returns {Promise<string>} */
export async function updateSelfExclusion(userId, until) {
  if (!isSupabaseConfigured) return local.updateSelfExclusion(userId, until)
  const { error } = await supabase.from('profiles').update({ self_exclusion_until: until }).eq('id', userId)
  if (error) throw error
  return until
}

// buddyId null clears it (the "off" state) - see supabase/schema.sql's
// limit_buddy_id for what this actually does (netlify/functions/
// alert-checks.js pushes to this person once the limit's hit).
/** @param {string} userId @param {string|null} buddyId @returns {Promise<string|null>} */
export async function updateLimitBuddy(userId, buddyId) {
  if (!isSupabaseConfigured) return local.updateLimitBuddy(userId, buddyId)
  const { error } = await supabase.from('profiles').update({ limit_buddy_id: buddyId }).eq('id', userId)
  if (error) throw error
  return buddyId
}

// bankrollAmount/stakingRule both null clears the plan (the "off" state) -
// same convention as updateStakeLimit above. stakingRule is {type: 'flat'|
// 'percent', value: number} or null; see src/components/BetBuilderSheet.jsx's
// suggestedStake() for how it's turned into a per-bet stake suggestion.
/**
 * @param {string} userId @param {{bankrollAmount: number|null, stakingRule: {type: 'flat'|'percent', value: number}|null}} params
 * @returns {Promise<{bankrollAmount: number|null, stakingRule: {type: 'flat'|'percent', value: number}|null}>}
 */
export async function updateStakingPlan(userId, { bankrollAmount, stakingRule }) {
  if (!isSupabaseConfigured) return local.updateStakingPlan(userId, { bankrollAmount, stakingRule })
  const { error } = await supabase
    .from('profiles')
    .update({ bankroll_amount: bankrollAmount, staking_rule: stakingRule })
    .eq('id', userId)
  if (error) throw error
  return { bankrollAmount, stakingRule }
}

// Path is prefixed with the uploader's own user id - the storage RLS
// policies (see schema.sql) check exactly that prefix, so anything else
// would be rejected before it ever reached here. upsert:true means
// re-uploading (changing your photo) overwrites the same object instead of
// accumulating orphaned files.
/** @param {string} userId @param {File} file @returns {Promise<string>} */
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

// Reads the denormalized referral_count column (kept in sync by the
// profiles_sync_referral_count trigger, see schema.sql) rather than a live
// COUNT query - same column listGroupMembers below now also exposes, so a
// referral tier only ever comes from one source of truth.
/** @param {string} userId @returns {Promise<number>} */
export async function countReferrals(userId) {
  if (!isSupabaseConfigured) return local.countReferrals(userId)
  const { data, error } = await supabase.from('profiles').select('referral_count').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.referral_count ?? 0
}

// --- Push subscriptions -------------------------------------------------
// One row per browser/device (see supabase/schema.sql's push_subscriptions
// table). Local mode has no server to send a push from, so it's a no-op
// there - src/lib/push.js still runs the real browser subscribe/permission
// flow either way, this just skips persisting it.

/** @param {string} userId @param {PushSubscription} subscription */
export async function savePushSubscription(userId, subscription) {
  if (!isSupabaseConfigured) return local.savePushSubscription(userId, subscription)
  const json = subscription.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth_key: json.keys?.auth },
      { onConflict: 'endpoint' }
    )
  if (error) throw error
}

/** @param {string} endpoint */
export async function deletePushSubscription(endpoint) {
  if (!isSupabaseConfigured) return local.deletePushSubscription(endpoint)
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// --- Odds target alerts ---------------------------------------------------
// Checked server-side by netlify/functions/alert-checks.js, which has
// no equivalent in local mode (no scheduled functions run against
// localStorage) - alerts still save/list/delete locally so the flow stays
// fully clickable, they just never actually fire there.

/** @param {any} row @returns {OddsAlert} */
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

/**
 * @param {string} userId
 * @param {{sport: string, eventId: string, eventLabel: string, kickoff: string, marketKey: string, marketLabel: string, outcomeName: string, selectionLabel: string, targetDecimal: number}} alert
 * @returns {Promise<OddsAlert>}
 */
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

/** @param {string} userId @returns {Promise<OddsAlert[]>} */
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

/** @param {string} alertId */
export async function deleteOddsAlert(alertId) {
  if (!isSupabaseConfigured) return local.deleteOddsAlert(alertId)
  const { error } = await supabase.from('odds_alerts').delete().eq('id', alertId)
  if (error) throw error
}

// --- Followed fixtures -----------------------------------------------------
// Kickoff reminders and result notifications for a fixture the user is just
// interested in, no bet required - see alert-checks.js. No scheduled
// functions run against localStorage, so follows still save/list/unfollow
// there but never
// actually notify (same limitation as odds alerts in local mode).

/** @param {string} userId @param {{sport: string, eventId: string, eventLabel: string, kickoff: string}} follow */
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

/** @param {string} userId @param {string} sport @param {string} eventId */
export async function unfollowFixture(userId, sport, eventId) {
  if (!isSupabaseConfigured) return local.unfollowFixture(userId, sport, eventId)
  const { error } = await supabase.from('followed_fixtures').delete().eq('user_id', userId).eq('sport', sport).eq('event_id', eventId)
  if (error) throw error
}

/** @param {string} userId @param {string} sport @param {string} eventId @returns {Promise<boolean>} */
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
/** @param {string} userId @param {string} sport @param {string} name */
export async function followParticipant(userId, sport, name) {
  if (!isSupabaseConfigured) return local.followParticipant(userId, sport, name)
  const { error } = await supabase
    .from('followed_participants')
    .upsert({ user_id: userId, sport, participant_name: name }, { onConflict: 'user_id,sport,participant_name' })
  if (error) throw error
}

/** @param {string} userId @param {string} sport @param {string} name */
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

/** @param {string} userId @returns {Promise<{sport: string, name: string}[]>} */
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

/** @param {string} userId @returns {Promise<(BetPost & {groupName: string, memberNames: Record<string, string>})[]>} */
export async function listFeedForUser(userId) {
  const groups = await listMyGroups(userId)
  const perGroup = await Promise.all(
    groups.map(async (group) => {
      const [posts, members] = await Promise.all([listBetPosts(group.id), listGroupMembers(group.id)])
      const memberNames = Object.fromEntries(members.map((m) => [m.id, m.displayName]))
      const memberAvatars = Object.fromEntries(members.map((m) => [m.id, m.avatarUrl]))
      return posts.map((post) => ({ ...post, groupName: group.name, memberNames, memberAvatars }))
    })
  )
  return perGroup.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// --- Friends & video tips ---------------------------------------------------
// Metadata (who's friends with whom, captions, tags, shares) syncs through
// Supabase like everything else once configured. Video bytes now do too,
// via uploadVideoBlob/getVideoPlaybackUrl below (Supabase Storage, private
// `videos` bucket - see supabase/schema.sql). Local mode has no Storage
// backend, so it keeps using src/lib/videoStore.js's IndexedDB trio - an
// honest, documented gap (a clip recorded in local mode still won't sync
// anywhere), the same shape as getClosingLines/getOddsSnapshotSeries.

const VIDEO_EXT_BY_MIME = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' }

// Path is prefixed with the uploader's own user id, same convention as
// uploadAvatar - the storage RLS policies check exactly that prefix. Unlike
// avatars this bucket is private (see schema.sql's comment on why), so the
// key stored on video_posts is the object *path*, not a resolved URL -
// playback URLs are short-lived and generated per-read by
// getVideoPlaybackUrl below.
/** @param {string} userId @param {Blob} blob @returns {Promise<string>} */
export async function uploadVideoBlob(userId, blob) {
  if (!isSupabaseConfigured) return local.uploadVideoBlob(userId, blob)
  const ext = VIDEO_EXT_BY_MIME[blob.type] || 'webm'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('videos').upload(path, blob)
  if (error) throw error
  return path
}

// Signed URLs are short-lived (1hr) and, unlike getPublicUrl, actually
// enforce the bucket's select RLS policy at signing time - this is what
// keeps a friend-only clip from being fetchable by a stranger who guesses
// the path. Returns null if the object is missing or the viewer fails RLS.
/** @param {string} videoKey @returns {Promise<string|null>} */
export async function getVideoPlaybackUrl(videoKey) {
  if (!isSupabaseConfigured) return local.getVideoPlaybackUrl(videoKey)
  const { data, error } = await supabase.storage.from('videos').createSignedUrl(videoKey, 3600)
  if (error) return null
  return data.signedUrl
}

/** @param {string} code @param {string} userId @returns {Promise<{id: string, displayName: string}>} */
// Read-only twin of addFriendByCode's own lookup, for anything that just
// needs to resolve a code to a person without the side effect of adding
// them - the /challenge/:code deep link (ChallengePage.jsx) needs to know
// who a shared link points at before deciding whether the visitor is
// already friends with them.
/** @param {string} code @returns {Promise<{id: string, displayName: string}|null>} */
export async function getProfileByFriendCode(code) {
  if (!isSupabaseConfigured) return local.getProfileByFriendCode(code)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('friend_code', code.trim().toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id, displayName: data.display_name } : null
}

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

/** @param {string} userId @param {string} otherId @returns {Promise<boolean>} */
export async function isFriend(userId, otherId) {
  if (!isSupabaseConfigured) return local.isFriend(userId, otherId)
  const { data, error } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(user_a.eq.${userId},user_b.eq.${otherId}),and(user_a.eq.${otherId},user_b.eq.${userId})`)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// addFriendByCode minus the code-resolution step, for internal contexts
// (a group member, a comment author) where the caller already has the
// person's real id but never had a friend code to type in. Same RLS
// policy as addFriendByCode's insert ("user adds a friendship as
// themselves") already allows this - it was never scoped to "came from a
// code lookup."
/** @param {string} userId @param {string} otherId @returns {Promise<{id: string, displayName: string}>} */
export async function addFriend(userId, otherId) {
  if (!isSupabaseConfigured) return local.addFriend(userId, otherId)
  if (otherId === userId) throw new Error("That's you.")

  const { data: existing } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(user_a.eq.${userId},user_b.eq.${otherId}),and(user_a.eq.${otherId},user_b.eq.${userId})`)
    .maybeSingle()
  if (existing) throw new Error('Already friends.')

  const { error } = await supabase.from('friendships').insert({ user_a: userId, user_b: otherId })
  if (error) throw error

  const { data: target, error: profileError } = await supabase.from('profiles').select('id, display_name').eq('id', otherId).single()
  if (profileError) throw profileError
  return { id: target.id, displayName: target.display_name }
}

/** @param {string} userId @returns {Promise<{id: string, displayName: string}[]>} */
export async function listFriends(userId) {
  if (!isSupabaseConfigured) return local.listFriends(userId)
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b, a:profiles!friendships_user_a_fkey(id, display_name), b:profiles!friendships_user_b_fkey(id, display_name)')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
  if (error) throw error
  return data.map((row) => {
    const other = /** @type {{id: string, display_name: string}} */ (
      /** @type {unknown} */ (row.user_a === userId ? row.b : row.a)
    )
    return { id: other.id, displayName: other.display_name }
  })
}

function mapChallenge(row) {
  return {
    id: row.id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    metric: row.metric,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at
  }
}

// Every challenge between exactly these two people, either direction,
// newest first - ChallengeSection.jsx (mounted in HeadToHeadSheet.jsx)
// picks the still-running one (if any) as "active" and the rest as
// history, rather than this function drawing that line itself.
/** @param {string} userId @param {string} friendId @returns {Promise<{id: string, challengerId: string, opponentId: string, metric: 'profit'|'roi'|'pickem', startsAt: string, endsAt: string, createdAt: string}[]>} */
export async function listChallengesBetween(userId, friendId) {
  if (!isSupabaseConfigured) return local.listChallengesBetween(userId, friendId)
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .or(`and(challenger_id.eq.${userId},opponent_id.eq.${friendId}),and(challenger_id.eq.${friendId},opponent_id.eq.${userId})`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapChallenge)
}

/** @param {{challengerId: string, opponentId: string, metric: 'profit'|'roi'|'pickem', days: number}} entry */
export async function createChallenge({ challengerId, opponentId, metric, days }) {
  if (!isSupabaseConfigured) return local.createChallenge({ challengerId, opponentId, metric, days })
  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      challenger_id: challengerId,
      opponent_id: opponentId,
      metric,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString()
    })
    .select()
    .single()
  if (error) throw error
  return mapChallenge(data)
}

function mapGroupTournament(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    metric: row.metric,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

// Every tournament a group has run, newest first - GroupTournamentSection.jsx
// picks the still-running one (if any, by endsAt) as "active" and the rest
// as history, same split ChallengeSection.jsx already does for challenges.
/** @param {string} groupId @returns {Promise<{id: string, groupId: string, name: string, metric: 'profit'|'roi', startsAt: string, endsAt: string, createdBy: string, createdAt: string}[]>} */
export async function listGroupTournaments(groupId) {
  if (!isSupabaseConfigured) return local.listGroupTournaments(groupId)
  const { data, error } = await supabase.from('group_tournaments').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapGroupTournament)
}

/** @param {{groupId: string, name: string, metric: 'profit'|'roi', days: number, createdBy: string}} entry */
export async function createGroupTournament({ groupId, name, metric, days, createdBy }) {
  if (!isSupabaseConfigured) return local.createGroupTournament({ groupId, name, metric, days, createdBy })
  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('group_tournaments')
    .insert({
      group_id: groupId,
      name,
      metric,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: createdBy
    })
    .select()
    .single()
  if (error) throw error
  return mapGroupTournament(data)
}

/**
 * @param {{authorId: string, videoKey: string, durationSec: number, caption: string, tag: string}} params
 * @returns {Promise<{id: string, authorId: string, videoKey: string, durationSec: number, caption: string, tag: string, createdAt: string}>}
 */
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

/**
 * @param {string} userId
 * @returns {Promise<{id: string, authorId: string, videoKey: string, durationSec: number, caption: string, tag: string, createdAt: string, authorName: string}[]>}
 */
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

/** @param {string} videoId @param {string} sharedByUserId @param {{type: string, id: string}} target */
export async function shareVideo(videoId, sharedByUserId, target) {
  if (!isSupabaseConfigured) return local.shareVideo(videoId, sharedByUserId, target)
  const { error } = await supabase
    .from('video_shares')
    .insert({ video_id: videoId, shared_by_user_id: sharedByUserId, target_type: target.type, target_id: target.id })
  if (error) throw error
}

/** @param {any} row */
function mapSharedVideoRow(row) {
  const post = /** @type {{id: string, author_id: string, storage_key: string, duration_sec: number, caption: string, tag: string, created_at: string, profiles: {display_name: string}|null}} */ (
    /** @type {unknown} */ (row.video_posts)
  )
  const sharer = /** @type {{display_name: string}|null} */ (/** @type {unknown} */ (row.sharer))
  return {
    id: post.id,
    authorId: post.author_id,
    videoKey: post.storage_key,
    durationSec: post.duration_sec,
    caption: post.caption,
    tag: post.tag,
    createdAt: post.created_at,
    authorName: post.profiles?.display_name ?? 'Someone',
    sharedByName: sharer?.display_name ?? 'Someone',
    sharedAt: row.created_at
  }
}

/** @param {string} userId @returns {Promise<ReturnType<typeof mapSharedVideoRow>[]>} */
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

// The merge SocialFeedPage's Tips segment and PublicFeedView's interleaved
// Home feed both need: own+friends' posts and clips shared with the viewer
// are two separate queries that can overlap (a friend shares their own
// clip with you), deduped by id+sharedAt so a shared-and-own copy of the
// same video never renders twice, sorted by whichever timestamp is more
// recent for that copy.
/** @param {string} userId @returns {Promise<ReturnType<typeof mapSharedVideoRow>[]>} */
export async function listTipsFeed(userId) {
  const [ownRaw, shared] = await Promise.all([listFriendsFeed(userId), listSharedWithMe(userId)])
  // Normalized to mapSharedVideoRow's shape (sharedByName/sharedAt undefined
  // for a viewer's own/friends' posts, only set for an explicit share) so
  // the merged array is one consistent type instead of a union.
  const own = ownRaw.map((v) => ({ ...v, sharedByName: undefined, sharedAt: undefined }))
  const merged = new Map()
  for (const v of [...own, ...shared]) merged.set(`${v.id}-${v.sharedAt ?? 'own'}`, v)
  return [...merged.values()].sort((a, b) => new Date(b.sharedAt ?? b.createdAt).getTime() - new Date(a.sharedAt ?? a.createdAt).getTime())
}

/** @param {string} groupId @returns {Promise<ReturnType<typeof mapSharedVideoRow>[]>} */
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

// --- Table predictor -------------------------------------------------------
// A slower group game than Pick'em (single match, weekly) - predict a whole
// competition's final order, scored against a member-updated snapshot of
// the real standings. See supabase/schema.sql's predictors/predictor_entries
// for why this is one active predictor per group and a freeform
// participant list rather than a hardcoded league.

/** @param {any} row @returns {Predictor|null} */
function mapPredictor(row) {
  if (!row) return null
  return {
    id: row.id,
    groupId: row.group_id,
    competition: row.competition,
    participants: row.participants,
    createdBy: row.created_by,
    createdAt: row.created_at,
    currentStandings: row.current_standings ?? null,
    standingsUpdatedBy: row.standings_updated_by ?? null,
    standingsUpdatedAt: row.standings_updated_at ?? null
  }
}

/** @param {any} row @returns {PredictorEntry} */
function mapPredictorEntry(row) {
  return {
    id: row.id,
    predictorId: row.predictor_id,
    userId: row.user_id,
    predictedOrder: row.predicted_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** @param {string} groupId @returns {Promise<Predictor|null>} */
export async function getPredictor(groupId) {
  if (!isSupabaseConfigured) return local.getPredictor(groupId)
  const { data, error } = await supabase
    .from('predictors')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return mapPredictor(data)
}

/**
 * @param {string} groupId @param {string} userId @param {string} competition @param {string[]} participants
 * @returns {Promise<Predictor|null>}
 */
export async function createPredictor(groupId, userId, competition, participants) {
  if (!isSupabaseConfigured) return local.createPredictor(groupId, userId, competition, participants)
  const { data, error } = await supabase
    .from('predictors')
    .insert({ group_id: groupId, competition, participants, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return mapPredictor(data)
}

/** @param {string} predictorId @param {string} userId @param {string[]} standings @returns {Promise<Predictor|null>} */
export async function updateStandings(predictorId, userId, standings) {
  if (!isSupabaseConfigured) return local.updateStandings(predictorId, userId, standings)
  const { data, error } = await supabase
    .from('predictors')
    .update({ current_standings: standings, standings_updated_by: userId, standings_updated_at: new Date().toISOString() })
    .eq('id', predictorId)
    .select()
    .single()
  if (error) throw error
  return mapPredictor(data)
}

/** @param {string} predictorId @returns {Promise<PredictorEntry[]>} */
export async function listPredictorEntries(predictorId) {
  if (!isSupabaseConfigured) return local.listPredictorEntries(predictorId)
  const { data, error } = await supabase.from('predictor_entries').select('*').eq('predictor_id', predictorId)
  if (error) throw error
  return data.map(mapPredictorEntry)
}

// Upsert - resubmitting just overwrites the previous entry, trust-based
// like every other self-reported thing in this app rather than locking at
// a kickoff time.
/** @param {string} predictorId @param {string} userId @param {string[]} predictedOrder @returns {Promise<PredictorEntry>} */
export async function submitPredictorEntry(predictorId, userId, predictedOrder) {
  if (!isSupabaseConfigured) return local.submitPredictorEntry(predictorId, userId, predictedOrder)
  const { data, error } = await supabase
    .from('predictor_entries')
    .upsert(
      { predictor_id: predictorId, user_id: userId, predicted_order: predictedOrder, updated_at: new Date().toISOString() },
      { onConflict: 'predictor_id,user_id' }
    )
    .select()
    .single()
  if (error) throw error
  return mapPredictorEntry(data)
}

// --- Error logs --------------------------------------------------------
// src/components/ErrorBoundary.jsx's only backend call - without this a
// caught crash was only ever visible in whoever's own devtools console.
// Insert works for a signed-out visitor too (a crash on AuthPage itself has
// nobody to attribute it to), so this reads the current session directly
// rather than taking a userId param the caller would often not have.
// AdminReportsPage-style single-operator gating (see supabase/schema.sql)
// controls who can read the list back.

/** @param {any} row @returns {ErrorLog} */
function mapErrorLog(row) {
  return {
    id: row.id,
    message: row.message,
    stack: row.stack ?? null,
    route: row.route ?? null,
    userId: row.user_id ?? null,
    userAgent: row.user_agent ?? null,
    createdAt: row.created_at
  }
}

/** @param {{message: string, stack?: string|null, route?: string|null}} entry @returns {Promise<void>} */
export async function logClientError(entry) {
  if (!isSupabaseConfigured) return local.logClientError(entry)
  const { data } = await supabase.auth.getSession()
  await supabase.from('error_logs').insert({
    message: entry.message.slice(0, 2000),
    stack: entry.stack ? entry.stack.slice(0, 4000) : null,
    route: entry.route ?? null,
    user_id: data.session?.user?.id ?? null,
    user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent
  })
}

/** @returns {Promise<ErrorLog[]>} */
export async function listErrorLogs() {
  if (!isSupabaseConfigured) return local.listErrorLogs()
  const { data, error } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data.map(mapErrorLog)
}

/** @param {string} id @returns {Promise<void>} */
export async function deleteErrorLog(id) {
  if (!isSupabaseConfigured) return local.deleteErrorLog(id)
  await supabase.from('error_logs').delete().eq('id', id)
}

// --- Admin analytics ----------------------------------------------------
// netlify/functions/admin-analytics.js does the actual cross-user
// aggregation (service-role, RLS doesn't give an admin broad read access
// to bet_posts/manual_entries/etc) - this just forwards the caller's own
// access token the same way deleteAccount() does, so the function can
// verify identity + is_admin server-side rather than trusting a client flag.
/** @returns {Promise<AdminAnalytics>} */
export async function getAdminAnalytics() {
  if (!isSupabaseConfigured) return local.getAdminAnalytics()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('No active session.')
  const res = await fetch('/api/admin-analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessToken })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || 'Failed to load analytics.')
  return body
}
