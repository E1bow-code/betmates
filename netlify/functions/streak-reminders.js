// Scheduled function (see config.schedule below) - celebrates a win streak
// the first time it reaches 3/5/10, matching the badge thresholds in
// src/utils/achievements.js. Same service-role pattern as every other
// scheduled function: nobody's signed in when a cron job fires, so it
// bypasses RLS rather than working within it.
//
// Also fires the DAILY "log a bet" streak's at-risk reminder (a different
// concept - consecutive calendar days active, not consecutive wins) in the
// same run: same */30 * * * * cron slot and the same streakReminders
// opt-in, rather than a second schedule entry or a second checkbox on
// AccountPage.jsx for what reads as one "streak reminders" idea to a user.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { computeStreak } from '../../src/utils/trackerStats.js'
import { freezesGranted } from '../../src/utils/dailyStreak.js'

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
      .select(
        'id,streak_milestone_notified,streak_current_count,streak_last_logged_date,streak_freezes_used,streak_reminder_sent_date,created_at'
      )
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

    // Mark every due user up front so a slow send can't cause the next run
    // to double-fire before the update lands.
    if (due.length) {
      await Promise.all(
        due.map((row) => supabase.from('profiles').update({ streak_milestone_notified: row.milestone }).eq('id', row.userId))
      )
    }

    // Daily "log a bet" streak - a different signal from the win-streak
    // `due` list above, so it's computed independently rather than folded
    // into it. Only fires once a day (the reminder-sent-date watermark,
    // checked before AND written after, since this same block otherwise
    // runs on every 30-minute tick within the window) and only for users
    // whose streak would actually break: already logged today, or a banked
    // freeze would silently cover the gap, both mean there's nothing to warn
    // about. The 19:00 UTC window is one evening nudge, not an all-day one.
    const hour = new Date().getUTCHours()
    const today = new Date().toISOString().slice(0, 10)
    const dueDaily =
      hour === 19
        ? optedIn.filter((p) => {
            if (!p.streak_current_count) return false
            if (p.streak_last_logged_date === today) return false
            if (p.streak_reminder_sent_date === today) return false
            const freezesAvailable = freezesGranted(p.created_at) - p.streak_freezes_used
            return freezesAvailable === 0
          })
        : []

    if (dueDaily.length) {
      await Promise.all(
        dueDaily.map((p) => supabase.from('profiles').update({ streak_reminder_sent_date: today }).eq('id', p.id))
      )
    }

    if (!due.length && !dueDaily.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const allTargetIds = [...new Set([...due.map((row) => row.userId), ...dueDaily.map((p) => p.id)])]
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', allTargetIds)
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const milestoneSends = due.flatMap((row) => {
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

    const dailySends = dueDaily.flatMap((p) => {
      const userSubs = subsByUser.get(p.id) ?? []
      const payload = JSON.stringify({
        title: `📅 ${p.streak_current_count}-day streak at risk`,
        body: 'Log a bet today to keep it going.',
        url: '/#/dashboard'
      })
      return userSubs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
          .catch(() => null)
      )
    })

    const results = await Promise.allSettled([...milestoneSends, ...dailySends])
    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === 'fulfilled').length,
        marked: due.length,
        dailyMarked: dueDaily.length
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  // PRE-LAUNCH: dialled down from '*/30 * * * *' to once daily to cut Netlify
  // invocations while there are no real users. Pinned to 19:00 UTC on purpose -
  // the daily log-in-streak-about-to-lapse nudge is itself gated to 19:00 UTC,
  // so a once-a-day run must land in that window to fire at all. Restore
  // '*/30 * * * *' at launch (win-streak milestones want the faster cadence).
  schedule: '0 19 * * *'
}
