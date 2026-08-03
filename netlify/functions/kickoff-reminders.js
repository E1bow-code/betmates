// Scheduled function (see `config.schedule` below) - checks every open bet
// across every user for a leg whose kickoff is coming up soon and sends a
// "kickoff soon" push. Unlike send-push.js (triggered by a signed-in user
// acting on their own access token + RLS), nobody is signed in when a cron
// job fires, so this runs on the service-role key instead - the one place
// in this project that bypasses RLS rather than working within it.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

// Reminds once a bet's earliest leg is within 30 minutes of kickoff. Runs
// every 15 minutes (see config.schedule), so nothing sits unreminded for
// more than ~15 minutes inside that window, and kickoff_reminder_sent_at
// stops a second run from double-sending before it passes out of range.
const REMINDER_WINDOW_MS = 30 * 60 * 1000

function earliestKickoff(selections) {
  const times = (selections ?? [])
    .map((s) => s.kickoff)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
  return times.length ? Math.min(...times) : null
}

function eventSummary(selections) {
  return selections?.[0]?.event ?? 'Your bet'
}

async function collectDue(supabase, table) {
  const { data, error } = await supabase
    .from(table)
    .select('id,user_id,selections,profiles(notification_prefs)')
    .eq('status', 'open')
    .is('kickoff_reminder_sent_at', null)
  if (error || !data) return []

  const now = Date.now()
  return data
    .map((row) => ({ ...row, kickoffAt: earliestKickoff(row.selections) }))
    .filter((row) => row.kickoffAt !== null && row.kickoffAt > now && row.kickoffAt <= now + REMINDER_WINDOW_MS)
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const [duePosts, dueManual] = await Promise.all([collectDue(supabase, 'bet_posts'), collectDue(supabase, 'manual_entries')])
    const due = [...duePosts.map((r) => ({ ...r, table: 'bet_posts' })), ...dueManual.map((r) => ({ ...r, table: 'manual_entries' }))]

    if (!due.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    // Mark every due row up front so a slow push send can't cause the next
    // 15-minute run to pick the same bet back up.
    await Promise.all(
      due.map((row) => supabase.from(row.table).update({ kickoff_reminder_sent_at: new Date().toISOString() }).eq('id', row.id))
    )

    const optedIn = due.filter((row) => row.profiles?.notification_prefs?.kickoffReminders === true)
    if (!optedIn.length) return new Response(JSON.stringify({ sent: 0, marked: due.length }), { status: 200 })

    const userIds = [...new Set(optedIn.map((row) => row.user_id))]
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = optedIn.flatMap((row) => {
      const userSubs = subsByUser.get(row.user_id) ?? []
      const minutes = Math.max(1, Math.round((row.kickoffAt - Date.now()) / 60000))
      const payload = JSON.stringify({
        title: '⏰ Kickoff soon',
        body: `${eventSummary(row.selections)} kicks off in ${minutes} min`,
        url: '/#/tracker'
      })
      return userSubs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
          .catch(() => null)
      )
    })

    const results = await Promise.allSettled(sends)
    return new Response(
      JSON.stringify({ sent: results.filter((r) => r.status === 'fulfilled').length, marked: due.length }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '*/15 * * * *'
}
