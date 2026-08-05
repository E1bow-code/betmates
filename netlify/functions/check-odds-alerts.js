// Scheduled function (see config.schedule) - the other half of the price
// alerts set from FixtureDetailPage/FightDetailPage/GenericEventDetailPage's
// bell buttons (see src/components/OddsAlertSheet.jsx, dataStore.js's
// createOddsAlert). Re-fetches each alert's fixture through the SAME
// internal /api/* routes the client itself uses (odds.js/ufc.js/sport.js
// already resolve everything down to a best-price-per-outcome shape), so
// there's no separate provider-parsing logic to keep in sync here - just
// look up the one outcome and compare its price to the target.
//
// Racing has no alerts to check: the create UI never offers a bell for it
// (see racingClient.js - USE_MOCK is true there, its prices never move).
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

function eventPath(sport, eventId) {
  if (sport === 'football') return `/api/odds?id=${encodeURIComponent(eventId)}`
  if (sport === 'ufc') return `/api/ufc?id=${encodeURIComponent(eventId)}`
  return `/api/sport?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(eventId)}`
}

async function fetchCurrentPrice(sport, eventId, marketKey, outcomeName) {
  const res = await fetch(`${SITE_URL}${eventPath(sport, eventId)}`)
  if (!res.ok) return null
  const event = await res.json()
  const market = event.markets?.find((m) => m.key === marketKey)
  const outcome = market?.outcomes?.find((o) => o.name === outcomeName)
  return outcome?.bestOdds?.decimal ?? null
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ checked: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const pushConfigured = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
    if (pushConfigured) webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: pending } = await supabase.from('odds_alerts').select('*').is('triggered_at', null)
    if (!pending?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

    // An alert whose event has already kicked off has nothing left to check
    // - pre-match prices are moot once the market's gone in-play - so these
    // are just cleaned up rather than re-fetched every 15 minutes forever.
    const now = Date.now()
    const expired = pending.filter((a) => new Date(a.kickoff).getTime() <= now)
    const active = pending.filter((a) => new Date(a.kickoff).getTime() > now)
    if (expired.length) await supabase.from('odds_alerts').delete().in('id', expired.map((a) => a.id))
    if (!active.length) return new Response(JSON.stringify({ checked: 0, expired: expired.length }), { status: 200 })

    const groups = new Map()
    for (const alert of active) {
      const key = `${alert.sport}|${alert.event_id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(alert)
    }

    const triggered = []
    await Promise.all(
      [...groups.entries()].map(async ([key, alerts]) => {
        const [sport, eventId] = key.split('|')
        await Promise.all(
          alerts.map(async (alert) => {
            const current = await fetchCurrentPrice(sport, eventId, alert.market_key, alert.outcome_name)
            if (current !== null && current >= Number(alert.target_decimal)) triggered.push({ ...alert, currentDecimal: current })
          })
        )
      })
    )

    if (!triggered.length) return new Response(JSON.stringify({ checked: active.length, triggered: 0 }), { status: 200 })

    await Promise.all(
      triggered.map((a) => supabase.from('odds_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', a.id))
    )

    if (!pushConfigured) return new Response(JSON.stringify({ checked: active.length, triggered: triggered.length, sent: 0 }), { status: 200 })

    const userIds = [...new Set(triggered.map((a) => a.user_id))]
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = triggered.flatMap((a) => {
      const userSubs = subsByUser.get(a.user_id) ?? []
      const payload = JSON.stringify({
        title: '🎯 Odds alert',
        body: `${a.selection_label} (${a.market_label}) on ${a.event_label} is now ${a.currentDecimal.toFixed(2)} - your target was ${Number(a.target_decimal).toFixed(2)}`,
        url: '/#/alerts'
      })
      return userSubs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
          .catch(() => null)
      )
    })

    const results = await Promise.allSettled(sends)
    return new Response(
      JSON.stringify({
        checked: active.length,
        triggered: triggered.length,
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
