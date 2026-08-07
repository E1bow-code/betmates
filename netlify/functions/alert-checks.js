// Scheduled function (see config.schedule) - merges what used to be three
// separate */15 * * * * functions (kickoff-reminders.js, check-odds-
// alerts.js, check-followed-results.js) into one. Each fired independently
// on the same cadence, so three cron invocations happened every 15 minutes
// no matter how little there was to check - this is the same three checks,
// same frequency, same behavior, just one invocation instead of three
// against Netlify's usage credits. Nobody's signed in when a cron job
// fires, so this runs on the service-role key rather than working within
// RLS - the one place in this project that does.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { apiKeysForSport } from '../../src/lib/sportsConfig.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

async function sendAll(supabase, notifications, buildPayload) {
  if (!notifications.length) return 0
  const userIds = [...new Set(notifications.map((n) => n.user_id))]
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
  const subsByUser = new Map()
  for (const sub of subs ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
    subsByUser.get(sub.user_id).push(sub)
  }
  const sends = notifications.flatMap((n) => {
    const userSubs = subsByUser.get(n.user_id) ?? []
    const payload = JSON.stringify(buildPayload(n))
    return userSubs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload).catch(() => null)
    )
  })
  const results = await Promise.allSettled(sends)
  return results.filter((r) => r.status === 'fulfilled').length
}

// --- Kickoff reminders (was kickoff-reminders.js) ---------------------
// Reminds once a bet's earliest leg is within 30 minutes of kickoff. Runs
// every 15 minutes, so nothing sits unreminded for more than ~15 minutes
// inside that window, and kickoff_reminder_sent_at stops a second run from
// double-sending before it passes out of range.
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

async function collectDueBets(supabase, table) {
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

// Same idea as collectDueBets above, but for a followed fixture (see
// FollowButton.jsx / dataStore.js's followFixture) rather than an open bet
// - kickoff lives on its own column here instead of nested in a
// selections array, so this reads it directly rather than reusing
// earliestKickoff.
async function collectDueFollows(supabase) {
  const { data, error } = await supabase
    .from('followed_fixtures')
    .select('id,user_id,event_label,kickoff,profiles(notification_prefs)')
    .is('kickoff_reminder_sent_at', null)
  if (error || !data) return []

  const now = Date.now()
  return data
    .map((row) => ({ ...row, kickoffAt: new Date(row.kickoff).getTime() }))
    .filter((row) => row.kickoffAt > now && row.kickoffAt <= now + REMINDER_WINDOW_MS)
}

async function runKickoffReminders(supabase) {
  const [duePosts, dueManual, dueFollows] = await Promise.all([
    collectDueBets(supabase, 'bet_posts'),
    collectDueBets(supabase, 'manual_entries'),
    collectDueFollows(supabase)
  ])
  const due = [
    ...duePosts.map((r) => ({ ...r, table: 'bet_posts' })),
    ...dueManual.map((r) => ({ ...r, table: 'manual_entries' })),
    ...dueFollows.map((r) => ({ ...r, table: 'followed_fixtures' }))
  ]
  if (!due.length) return { sent: 0 }

  // Mark every due row up front so a slow push send can't cause the next
  // 15-minute run to pick the same bet back up.
  await Promise.all(
    due.map((row) => supabase.from(row.table).update({ kickoff_reminder_sent_at: new Date().toISOString() }).eq('id', row.id))
  )

  const optedIn = due.filter((row) => row.profiles?.notification_prefs?.kickoffReminders === true)
  const sent = await sendAll(supabase, optedIn, (row) => {
    const minutes = Math.max(1, Math.round((row.kickoffAt - Date.now()) / 60000))
    const isFollow = row.table === 'followed_fixtures'
    return {
      title: '⏰ Kickoff soon',
      body: `${isFollow ? row.event_label : eventSummary(row.selections)} kicks off in ${minutes} min`,
      url: isFollow ? '/#/odds' : '/#/tracker'
    }
  })
  return { sent, marked: due.length }
}

// --- Odds alerts (was check-odds-alerts.js) ----------------------------
// Re-fetches each alert's fixture through the SAME internal /api/* routes
// the client itself uses (odds.js/ufc.js/sport.js already resolve
// everything down to a best-price-per-outcome shape), so there's no
// separate provider-parsing logic to keep in sync here - just look up the
// one outcome and compare its price to the target. Racing has no alerts to
// check: the create UI never offers a bell for it (racingClient.js's
// USE_MOCK is true, its prices never move).
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

async function runOddsAlerts(supabase) {
  const { data: pending } = await supabase.from('odds_alerts').select('*').is('triggered_at', null)
  if (!pending?.length) return { checked: 0 }

  // An alert whose event has already kicked off has nothing left to check
  // - pre-match prices are moot once the market's gone in-play - so these
  // are just cleaned up rather than re-fetched every 15 minutes forever.
  const now = Date.now()
  const expired = pending.filter((a) => new Date(a.kickoff).getTime() <= now)
  const active = pending.filter((a) => new Date(a.kickoff).getTime() > now)
  if (expired.length) await supabase.from('odds_alerts').delete().in('id', expired.map((a) => a.id))
  if (!active.length) return { checked: 0, expired: expired.length }

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
  if (!triggered.length) return { checked: active.length, triggered: 0 }

  await Promise.all(triggered.map((a) => supabase.from('odds_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', a.id)))

  const sent = await sendAll(supabase, triggered, (a) => ({
    title: '🎯 Odds alert',
    body: `${a.selection_label} (${a.market_label}) on ${a.event_label} is now ${a.currentDecimal.toFixed(2)} - your target was ${Number(a.target_decimal).toFixed(2)}`,
    url: '/#/alerts'
  }))
  return { checked: active.length, triggered: triggered.length, sent }
}

// --- Followed-fixture results (was check-followed-results.js) ----------
// The "result" half of a followed fixture. Kickoff reminders above handle
// the other end; this checks once a followed fixture's estimated live
// window has finished, via the same /api/scores endpoint
// src/lib/settlement.js already uses for bet auto-settlement.
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

async function runFollowedResults(supabase) {
  const { data: pending } = await supabase.from('followed_fixtures').select('*').is('result_sent_at', null)
  if (!pending?.length) return { checked: 0 }

  const now = Date.now()
  // Only worth checking once the event's estimated live window has
  // finished - checking earlier would just come back empty every time.
  const ready = pending.filter((f) => {
    const duration = (DURATION_MINUTES[f.sport] ?? 150) * 60000
    return now >= new Date(f.kickoff).getTime() + duration
  })
  if (!ready.length) return { checked: 0 }

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
  // sport with no score mapping (racing, tennis - see apiKeysForSport) or
  // a game not in this response yet stops being retried forever instead
  // of getting re-checked on every run indefinitely.
  await supabase
    .from('followed_fixtures')
    .update({ result_sent_at: new Date().toISOString() })
    .in('id', ready.map((f) => f.id))

  const sent = await sendAll(supabase, notifications, (n) => ({ title: '🏁 Full time', body: n.scoreLine, url: '/#/odds' }))
  return { checked: ready.length, notified: notifications.length, sent }
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ reason: 'not configured' }), { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // Independent of each other (different tables, different push copy), so
  // they run concurrently rather than one after another - and one throwing
  // doesn't stop the other two from still doing their job.
  const [kickoffReminders, oddsAlerts, followedResults] = await Promise.allSettled([
    runKickoffReminders(supabase),
    runOddsAlerts(supabase),
    runFollowedResults(supabase)
  ])

  const settle = (r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? String(r.reason) })
  return new Response(
    JSON.stringify({
      kickoffReminders: settle(kickoffReminders),
      oddsAlerts: settle(oddsAlerts),
      followedResults: settle(followedResults)
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

export const config = {
  schedule: '*/15 * * * *'
}
