// Scheduled function (see config.schedule) - the "result" half of a
// followed fixture (see src/components/FollowButton.jsx). Kickoff
// reminders are handled by kickoff-reminders.js; this checks the OTHER
// end, once a followed fixture's estimated live window has finished, via
// the same /api/scores endpoint src/lib/settlement.js already uses for
// bet auto-settlement.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { apiKeysForSport } from '../../src/lib/sportsConfig.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

// Same estimate as src/utils/liveStatus.js, duplicated rather than
// imported - that file is written for the browser bundle, and this is a
// standalone Netlify Function; not worth sharing a module for one small
// lookup table.
const DURATION_MINUTES = {
  football: 130,
  mls: 130,
  ufc: 240,
  boxing: 240,
  tennis: 200,
  basketball: 150,
  hockey: 150,
  baseball: 210,
  nfl: 210,
  rugbyLeague: 120,
  rugbyUnion: 120,
  cricket: 360
}

async function fetchScores(apiSportKeys) {
  if (!apiSportKeys.length) return []
  const res = await fetch(`${SITE_URL}/api/scores?keys=${encodeURIComponent(apiSportKeys.join(','))}`)
  if (!res.ok) return []
  return res.json()
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ checked: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const pushConfigured = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
    if (pushConfigured) webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: pending } = await supabase.from('followed_fixtures').select('*').is('result_sent_at', null)
    if (!pending?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

    const now = Date.now()
    // Only worth checking once the event's estimated live window has
    // finished - checking earlier would just come back empty every time.
    const ready = pending.filter((f) => {
      const duration = (DURATION_MINUTES[f.sport] ?? 150) * 60000
      return now >= new Date(f.kickoff).getTime() + duration
    })
    if (!ready.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

    const bySport = new Map()
    for (const f of ready) {
      if (!bySport.has(f.sport)) bySport.set(f.sport, [])
      bySport.get(f.sport).push(f)
    }

    const notifications = []
    for (const [sport, follows] of bySport) {
      const games = await fetchScores(apiKeysForSport(sport))
      for (const follow of follows) {
        const game = games.find((g) => follow.event_label === `${g.homeTeam} v ${g.awayTeam}`)
        if (!game) continue
        const home = game.scores.find((s) => s.name === game.homeTeam)?.score
        const away = game.scores.find((s) => s.name === game.awayTeam)?.score
        notifications.push({ ...follow, scoreLine: `${game.homeTeam} ${home}-${away} ${game.awayTeam}` })
      }
    }

    // Every follow whose window has passed gets marked seen either way - a
    // sport with no score mapping (racing, tennis - see apiKeysForSport)
    // or a game not in this response yet stops being retried forever
    // instead of getting re-checked on every run indefinitely.
    await supabase
      .from('followed_fixtures')
      .update({ result_sent_at: new Date().toISOString() })
      .in('id', ready.map((f) => f.id))

    if (!notifications.length || !pushConfigured) {
      return new Response(JSON.stringify({ checked: ready.length, notified: 0 }), { status: 200 })
    }

    const userIds = [...new Set(notifications.map((n) => n.user_id))]
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = notifications.flatMap((n) => {
      const userSubs = subsByUser.get(n.user_id) ?? []
      const payload = JSON.stringify({ title: '🏁 Full time', body: n.scoreLine, url: '/#/odds' })
      return userSubs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
          .catch(() => null)
      )
    })

    const results = await Promise.allSettled(sends)
    return new Response(
      JSON.stringify({
        checked: ready.length,
        notified: notifications.length,
        sent: results.filter((r) => r.status === 'fulfilled').length
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ checked: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '*/15 * * * *'
}
