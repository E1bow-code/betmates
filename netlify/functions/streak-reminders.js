// Scheduled function (see config.schedule below) - celebrates a win streak
// the first time it reaches 3/5/10, matching the badge thresholds in
// src/utils/achievements.js. Same service-role pattern as every other
// scheduled function: nobody's signed in when a cron job fires, so it
// bypasses RLS rather than working within it.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { computeStreak } from '../../src/utils/trackerStats.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

const MILESTONES = [10, 5, 3]

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: optedIn } = await supabase
      .from('profiles')
      .select('id,streak_milestone_notified')
      .eq('notification_prefs->>streakReminders', 'true')
    if (!optedIn?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const userIds = optedIn.map((p) => p.id)
    const [{ data: posts }, { data: manual }] = await Promise.all([
      supabase.from('bet_posts').select('user_id,status,settled_at').in('user_id', userIds).in('status', ['won', 'lost']),
      supabase.from('manual_entries').select('user_id,status,settled_at').in('user_id', userIds).in('status', ['won', 'lost'])
    ])

    const byUser = new Map()
    for (const row of [...(posts ?? []), ...(manual ?? [])]) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
      byUser.get(row.user_id).push({ status: row.status, settledAt: row.settled_at })
    }

    // Highest milestone each user has actually reached (count >= milestone)
    // that they haven't already been notified for - never re-fires for one
    // already sent, even if the streak later breaks and rebuilds to it
    // again, same as an achievement badge staying earned.
    const due = []
    for (const profile of optedIn) {
      const streak = computeStreak(byUser.get(profile.id) ?? [])
      if (streak.type !== 'won') continue
      const alreadyNotified = profile.streak_milestone_notified ?? 0
      const milestone = MILESTONES.find((m) => streak.count >= m && m > alreadyNotified)
      if (milestone) due.push({ userId: profile.id, milestone })
    }

    if (!due.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    // Mark every due user up front so a slow send can't cause the next run
    // to double-fire before the update lands.
    await Promise.all(
      due.map((row) => supabase.from('profiles').update({ streak_milestone_notified: row.milestone }).eq('id', row.userId))
    )

    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', due.map((row) => row.userId))
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = due.flatMap((row) => {
      const userSubs = subsByUser.get(row.userId) ?? []
      const payload = JSON.stringify({
        title: `🔥 ${row.milestone}-win streak!`,
        body: `You've won ${row.milestone} in a row - keep it going.`,
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
  schedule: '*/30 * * * *'
}
