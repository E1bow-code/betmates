// Scheduled function (see `config.schedule` below) - checks every open bet
// across every user against final scores and settles it automatically, the
// same way src/lib/settlement.js does when someone happens to visit their
// Tracker, except nobody has to visit anything for this one to run. Shares
// the win/lose/void rules with settlement.js via src/lib/betEvaluation.js so
// a scheduled run and a manual visit can never disagree on a result.
//
// Runs on the service-role key like kickoff-reminders.js - nobody's signed
// in when a cron job fires, so there's no user access token for RLS to key
// off, and this needs to read/write every user's bets, not just one poster's
// own group.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { evaluateEntry } from '../../src/lib/betEvaluation.js'
import { apiKeysForSport } from '../../src/lib/sportsConfig.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ODDS_API_KEY = process.env.ODDS_API_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

async function fetchScores(apiSportKeys) {
  if (!apiSportKeys.length) return []
  const results = await Promise.allSettled(
    apiSportKeys.map(async (sportKey) => {
      const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`)
      if (!res.ok) throw new Error(`${sportKey}: ${res.status}`)
      return res.json()
    })
  )
  const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  return events
    .filter((e) => e.completed && e.scores)
    .map((e) => ({
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      scores: e.scores.map((s) => ({ name: s.name, score: Number(s.score) }))
    }))
}

function eventSummary(selections) {
  return selections?.[0]?.event ?? 'Your bet'
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ODDS_API_KEY) {
    return new Response(JSON.stringify({ settled: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const [{ data: posts }, { data: manual }] = await Promise.all([
      supabase.from('bet_posts').select('id,user_id,sport,selections,profiles(notification_prefs)').eq('status', 'open'),
      supabase.from('manual_entries').select('id,user_id,sport,selections,profiles(notification_prefs)').eq('status', 'open')
    ])

    const open = [
      ...(posts ?? []).map((p) => ({ ...p, table: 'bet_posts' })),
      ...(manual ?? []).map((m) => ({ ...m, table: 'manual_entries' }))
    ]
    if (!open.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const neededKeys = new Set()
    for (const entry of open) {
      for (const leg of entry.selections ?? []) {
        for (const key of apiKeysForSport(leg.sport ?? entry.sport)) neededKeys.add(key)
      }
    }
    if (!neededKeys.size) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const games = await fetchScores([...neededKeys])
    if (!games.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const settledEntries = []
    for (const entry of open) {
      const status = evaluateEntry(entry, games)
      if (status) settledEntries.push({ ...entry, status })
    }
    if (!settledEntries.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const settledAt = new Date().toISOString()
    await Promise.all(
      settledEntries.map((entry) => supabase.from(entry.table).update({ status: entry.status, settled_at: settledAt }).eq('id', entry.id))
    )

    // "Bet settled" push, for whoever's opted in - same pattern as
    // kickoff-reminders.js, just a different trigger condition.
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
      const notifiable = settledEntries.filter((e) => e.profiles?.notification_prefs?.betSettled === true)
      if (notifiable.length) {
        const userIds = [...new Set(notifiable.map((e) => e.user_id))]
        const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
        const subsByUser = new Map()
        for (const sub of subs ?? []) {
          if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
          subsByUser.get(sub.user_id).push(sub)
        }

        const sends = notifiable.flatMap((entry) => {
          const userSubs = subsByUser.get(entry.user_id) ?? []
          const payload = JSON.stringify({
            title: entry.status === 'won' ? '🎉 Bet won!' : entry.status === 'void' ? 'Bet voided' : 'Bet lost',
            body: eventSummary(entry.selections),
            url: '/#/tracker'
          })
          return userSubs.map((sub) =>
            webpush
              .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
              .catch(() => null)
          )
        })
        await Promise.allSettled(sends)
      }
    }

    return new Response(JSON.stringify({ settled: settledEntries.length }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ settled: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '*/30 * * * *'
}
