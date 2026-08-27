// Scheduled function (see `config.schedule` below), Monday mornings - emails
// each opted-in member their groups' leaderboard for the past 7 days, ranked
// by settled profit via the exact same computeGroupLeaderboard the live
// Leaderboard.jsx uses (so the email can never disagree with the app). Same
// service-role pattern as every other scheduled function - nobody's signed in
// when a cron job fires, so it bypasses RLS.
//
// Email goes out through Resend (https://resend.com) - a plain HTTPS POST, no
// SDK. Like every other integration here it degrades: unset RESEND_API_KEY /
// DIGEST_FROM_EMAIL (or Supabase keys) and it no-ops with { sent: 0, reason:
// 'not configured' } rather than crashing. To turn it on: set RESEND_API_KEY
// and DIGEST_FROM_EMAIL (e.g. "BetMates <digest@yourdomain>", a verified
// Resend sender) in Netlify.
//
// Opt-in, not opt-out: only members with notification_prefs.weeklyLeaderboardEmail
// === true are emailed (Account → Notifications → "Weekly leaderboard email"),
// same restraint as the weeklyRecap push. A recipient whose groups had zero
// settled bets this week gets nothing rather than an empty board.
import { createClient } from '@supabase/supabase-js'
import { computeGroupLeaderboard } from '../../src/utils/groupLeaderboard.js'
import { buildLeaderboardDigest } from '../../src/lib/leaderboardEmail.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const DIGEST_FROM_EMAIL = process.env.DIGEST_FROM_EMAIL

function mapPost(row) {
  return { userId: row.user_id, stake: row.stake, stakeHidden: row.stake_hidden, status: row.status, potentialReturn: row.potential_return, settledAt: row.settled_at, selections: row.selections }
}

function weekLabel(fromIso, toIso) {
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' }
  const from = new Date(fromIso).toLocaleDateString('en-GB', opts)
  const to = new Date(toIso).toLocaleDateString('en-GB', opts)
  return `${from} – ${to}`
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: DIGEST_FROM_EMAIL, to: [to], subject, html })
  })
  if (!res.ok) {
    console.error(`Resend error ${res.status} for ${to}:`, await res.text().catch(() => ''))
    return false
  }
  return true
}

export default async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY || !DIGEST_FROM_EMAIL) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekAgoIso = weekAgo.toISOString()

    const [{ data: members }, { data: groups }, { data: profiles }, { data: privates }, { data: postRows }] = await Promise.all([
      supabase.from('group_members').select('group_id,user_id'),
      supabase.from('groups').select('id,name'),
      supabase.from('profiles').select('id,display_name,notification_prefs'),
      supabase.from('profile_private').select('id,email'),
      supabase
        .from('bet_posts')
        .select('group_id,user_id,stake,stake_hidden,status,potential_return,settled_at,selections')
        .not('group_id', 'is', null)
        .in('status', ['won', 'lost', 'void'])
        .gte('settled_at', weekAgoIso)
    ])

    const memberNames = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))
    const prefsById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.notification_prefs || {}]))
    const emailById = Object.fromEntries((privates ?? []).map((p) => [p.id, p.email]))
    const groupName = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]))

    // Each group's weekly board, computed once.
    const postsByGroup = new Map()
    for (const row of postRows ?? []) {
      if (!postsByGroup.has(row.group_id)) postsByGroup.set(row.group_id, [])
      postsByGroup.get(row.group_id).push(mapPost(row))
    }
    const boardByGroup = new Map()
    for (const [groupId, posts] of postsByGroup) {
      boardByGroup.set(groupId, computeGroupLeaderboard(posts, memberNames, 'week'))
    }

    // Which groups each member belongs to.
    const groupsByMember = new Map()
    for (const m of members ?? []) {
      if (!groupsByMember.has(m.user_id)) groupsByMember.set(m.user_id, [])
      groupsByMember.get(m.user_id).push(m.group_id)
    }

    const label = weekLabel(weekAgoIso, now.toISOString())
    let sent = 0

    for (const [userId, groupIds] of groupsByMember) {
      // Opt-in only, and only if we have an address to send to.
      if (prefsById[userId]?.weeklyLeaderboardEmail !== true) continue
      const email = emailById[userId]
      if (!email) continue

      const digestGroups = groupIds
        .map((gid) => ({ name: groupName[gid], rows: boardByGroup.get(gid) }))
        .filter((g) => g.name && g.rows && g.rows.length > 0)
        .map((g) => ({ name: g.name, rows: g.rows.map((r) => ({ ...r, isRecipient: r.userId === userId })) }))

      const digest = buildLeaderboardDigest({ recipientName: memberNames[userId], weekLabel: label, groups: digestGroups })
      if (!digest) continue

      if (await sendEmail(email, digest.subject, digest.html)) sent += 1
    }

    return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('weekly-leaderboard-email error:', err.message)
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  // Monday 09:00 UTC - "here's how last week landed" at the start of the week.
  schedule: '0 9 * * 1'
}
