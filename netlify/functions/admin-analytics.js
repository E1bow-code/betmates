// Admin-only aggregate stats (src/pages/AdminAnalyticsPage.jsx, route
// /admin/analytics) - signups/bets/groups over time, DAU/WAU/MAU, and a
// top-win-streaks list, computed from tables that already exist (no new
// tracking). RLS doesn't give an admin broad read access to bet_posts/
// manual_entries/etc today (only error_logs/post_reports have an
// is_admin-gated SELECT policy), so - same as hall-of-fame.js - this reads
// with the service-role key. Unlike hall-of-fame.js this can't be public:
// identity is resolved from the caller's own access token (same pattern as
// delete-account.js), then checked against profiles.is_admin before any
// data is returned.
import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { computeStreak, computeLongestWinStreak } from '../../src/utils/trackerStats.js'
import { bucketByDay, distinctUsersSince } from '../../src/utils/adminAnalyticsAgg.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TTL = 5 * 60 * 1000 // one admin checking their own dashboard occasionally, not public traffic - keep it close to live without recomputing on every reopen
const DAYS = 30
const TOP_N = 5

function holder(row) {
  return { userId: row.user_id, name: row.profiles?.display_name ?? 'Someone' }
}

async function computeAnalytics(admin) {
  const [
    { data: profiles },
    { data: groups },
    { data: posts },
    { data: manual },
    { data: comments },
    { data: reactions },
    { data: groupMessages },
    { data: directMessages },
    { data: betCopies },
    { data: predictorEntries }
  ] = await Promise.all([
    admin.from('profiles').select('id,created_at'),
    admin.from('groups').select('id,created_at'),
    admin.from('bet_posts').select('user_id,created_at,status,stake,potential_return,settled_at,profiles(display_name)'),
    admin.from('manual_entries').select('user_id,created_at,status,stake,potential_return,settled_at,profiles(display_name)'),
    admin.from('bet_comments').select('user_id,created_at'),
    admin.from('bet_reactions').select('user_id,created_at'),
    admin.from('group_messages').select('user_id,created_at'),
    admin.from('direct_messages').select('sender_id,created_at'),
    admin.from('bet_copies').select('copying_user_id,created_at'),
    admin.from('predictor_entries').select('user_id,created_at')
  ])

  const allProfiles = profiles ?? []
  const allGroups = groups ?? []
  const allPosts = posts ?? []
  const allManual = manual ?? []
  const allBets = [...allPosts, ...allManual]
  const settledStatuses = ['won', 'lost', 'void']

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const todayKey = now.toISOString().slice(0, 10)

  const overview = {
    totalUsers: allProfiles.length,
    totalGroups: allGroups.length,
    totalBets: allBets.length,
    totalSettled: allBets.filter((b) => settledStatuses.includes(b.status)).length,
    signupsToday: allProfiles.filter((p) => p.created_at?.slice(0, 10) === todayKey).length,
    signupsThisWeek: allProfiles.filter((p) => new Date(p.created_at) >= weekAgo).length
  }

  const signupsByDay = bucketByDay(allProfiles, 'created_at', DAYS)
  const betsByDay = bucketByDay(allBets, 'created_at', DAYS)
  const groupsByDay = bucketByDay(allGroups, 'created_at', DAYS)

  // "Active" = a row in any table that plausibly signals someone doing
  // something, not just a passive/config change.
  const activityRows = [
    ...allPosts.map((r) => ({ userId: r.user_id, at: r.created_at })),
    ...allManual.map((r) => ({ userId: r.user_id, at: r.created_at })),
    ...(comments ?? []).map((r) => ({ userId: r.user_id, at: r.created_at })),
    ...(reactions ?? []).map((r) => ({ userId: r.user_id, at: r.created_at })),
    ...(groupMessages ?? []).map((r) => ({ userId: r.user_id, at: r.created_at })),
    ...(directMessages ?? []).map((r) => ({ userId: r.sender_id, at: r.created_at })),
    ...(betCopies ?? []).map((r) => ({ userId: r.copying_user_id, at: r.created_at })),
    ...(predictorEntries ?? []).map((r) => ({ userId: r.user_id, at: r.created_at }))
  ]
  const activeUsers = {
    dau: distinctUsersSince(activityRows, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    wau: distinctUsersSince(activityRows, weekAgo),
    mau: distinctUsersSince(activityRows, new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000))
  }

  const byUser = new Map()
  for (const row of allBets) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { info: holder(row), entries: [] })
    byUser
      .get(row.user_id)
      .entries.push({ stake: row.stake, status: row.status, potentialReturn: row.potential_return, settledAt: row.settled_at })
  }
  const current = []
  const longest = []
  for (const { info, entries } of byUser.values()) {
    const streak = computeStreak(entries)
    if (streak.type === 'won' && streak.count > 0) current.push({ ...info, count: streak.count })
    const longestCount = computeLongestWinStreak(entries)
    if (longestCount > 0) longest.push({ ...info, count: longestCount })
  }
  current.sort((a, b) => b.count - a.count)
  longest.sort((a, b) => b.count - a.count)

  return {
    overview,
    signupsByDay,
    betsByDay,
    groupsByDay,
    activeUsers,
    topStreaks: { current: current.slice(0, TOP_N), longest: longest.slice(0, TOP_N) },
    generatedAt: now.toISOString()
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    const { accessToken } = await req.json()
    if (!accessToken) return new Response(JSON.stringify({ error: 'Missing accessToken' }), { status: 400 })

    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), { status: 401 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

    const cached = cacheGet('admin-analytics')
    if (cached) return new Response(JSON.stringify(cached), { status: 200, headers: { 'content-type': 'application/json' } })

    const body = await computeAnalytics(admin)
    cacheSet('admin-analytics', body, TTL)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
