// Scheduled function (see `config.schedule` below), Sunday evenings - turns
// the on-demand "Share recap" button on Tracker (src/lib/shareImage.js)
// into something proactive: whoever's opted in gets a push with their
// week's numbers without having to go looking for them. Same service-role
// pattern as kickoff-reminders.js/auto-settle.js - nobody's signed in when
// a cron job fires, so it has to bypass RLS rather than work within it.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { computeStats } from '../../src/utils/trackerStats.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: optedIn } = await supabase.from('profiles').select('id').eq('notification_prefs->>weeklyRecap', 'true')
    if (!optedIn?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const userIds = optedIn.map((p) => p.id)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoIso = weekAgo.toISOString()

    const [{ data: posts }, { data: manual }, { data: subs }] = await Promise.all([
      supabase
        .from('bet_posts')
        .select('user_id,stake,status,potential_return,settled_at')
        .in('user_id', userIds)
        .in('status', ['won', 'lost', 'void'])
        .gte('settled_at', weekAgoIso),
      supabase
        .from('manual_entries')
        .select('user_id,stake,status,potential_return,settled_at')
        .in('user_id', userIds)
        .in('status', ['won', 'lost', 'void'])
        .gte('settled_at', weekAgoIso),
      supabase.from('push_subscriptions').select('*').in('user_id', userIds)
    ])

    const byUser = new Map()
    for (const row of [...(posts ?? []), ...(manual ?? [])]) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
      byUser.get(row.user_id).push({ stake: row.stake, status: row.status, potentialReturn: row.potential_return })
    }

    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = []
    for (const [userId, entries] of byUser) {
      // Nothing settled this week - a recap saying "£0.00, 0 bets" isn't
      // worth a notification, so those users are skipped rather than sent
      // an empty one.
      if (!entries.length) continue
      const stats = computeStats(entries)
      const userSubs = subsByUser.get(userId) ?? []
      if (!userSubs.length) continue

      const sign = stats.profit >= 0 ? '+' : ''
      const payload = JSON.stringify({
        title: '📊 Your week in bets',
        body: `${sign}£${stats.profit.toFixed(2)} across ${stats.settledCount} settled bets${stats.winRate === null ? '' : ` · ${stats.winRate}% win rate`}`,
        url: '/#/tracker'
      })
      for (const sub of userSubs) {
        sends.push(
          webpush
            .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
            .catch(() => null)
        )
      }
    }

    const results = await Promise.allSettled(sends)
    return new Response(JSON.stringify({ sent: results.filter((r) => r.status === 'fulfilled').length }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '0 20 * * 0'
}
