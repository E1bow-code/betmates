// Scheduled function (see config.schedule) - the push half of the Social
// tab's News "My teams" filter (SocialFeedPage.jsx/dataStore.
// followParticipant). Rather than re-parsing the RSS feeds itself, it calls
// this site's own /api/sports-news (the same cached endpoint the in-app
// News list uses) and matches titles against followed_participants with the
// same plain substring match as the client-side filter - still fuzzy, still
// no team/sport tag on an RSS item to join against.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: optedIn } = await supabase
      .from('profiles')
      .select('id,team_news_notified_at')
      .eq('notification_prefs->>teamNews', 'true')
    if (!optedIn?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const userIds = optedIn.map((p) => p.id)
    const { data: follows } = await supabase.from('followed_participants').select('user_id,participant_name').in('user_id', userIds)
    if (!follows?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const namesByUser = new Map()
    for (const row of follows) {
      if (!namesByUser.has(row.user_id)) namesByUser.set(row.user_id, [])
      namesByUser.get(row.user_id).push(row.participant_name.toLowerCase())
    }

    const res = await fetch(`${SITE_URL}/api/sports-news`)
    const news = res.ok ? await res.json() : []
    // A handful of items (see sports-news.js) come back with no pubDate -
    // those can never be told apart from something already notified against
    // a time watermark, so they're left out here rather than risking a
    // repeat notification every run. They still show up fine in the in-app
    // list, which has no such constraint.
    const dated = news.filter((item) => item.pubDate)

    const now = new Date().toISOString()
    const followedUsers = optedIn.filter((p) => namesByUser.get(p.id)?.length)

    const due = []
    for (const profile of followedUsers) {
      // No watermark yet - just opted in, or just followed their first team.
      // Start the clock from now instead of blasting every headline
      // currently in the feed as if it just broke.
      if (!profile.team_news_notified_at) continue
      const since = new Date(profile.team_news_notified_at)
      const names = namesByUser.get(profile.id)
      const matches = dated.filter((item) => new Date(item.pubDate) > since && names.some((name) => item.title.toLowerCase().includes(name)))
      if (matches.length) due.push({ userId: profile.id, matches })
    }

    // Every followed-someone opted-in user gets their watermark bumped to
    // now regardless of whether they matched this run - same "mark first"
    // guard as streak-reminders.js, so a slow send can't cause the next run
    // to double-fire, and a first-time follow starts its clock now instead
    // of staying null forever.
    await Promise.all(followedUsers.map((p) => supabase.from('profiles').update({ team_news_notified_at: now }).eq('id', p.id)))

    if (!due.length) return new Response(JSON.stringify({ sent: 0, checked: followedUsers.length }), { status: 200 })

    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', due.map((row) => row.userId))
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = due.flatMap((row) => {
      const userSubs = subsByUser.get(row.userId) ?? []
      const body = row.matches.length === 1 ? row.matches[0].title : `${row.matches.length} new headlines about teams you follow`
      const payload = JSON.stringify({ title: '📰 Team news', body, url: '/#/social' })
      return userSubs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
          .catch(() => null)
      )
    })

    const results = await Promise.allSettled(sends)
    return new Response(
      JSON.stringify({ checked: followedUsers.length, matched: due.length, sent: results.filter((r) => r.status === 'fulfilled').length }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '*/30 * * * *'
}
