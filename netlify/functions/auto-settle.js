// Scheduled function (see `config.schedule` below) - checks every open bet
// across every user against final scores and settles it automatically, the
// same way src/lib/settlement.js does when someone happens to visit their
// Tracker, except nobody has to visit anything for this one to run. Shares
// the win/lose/void rules with settlement.js via src/lib/betEvaluation.js so
// a scheduled run and a manual visit can never disagree on a result.
//
// Runs on the service-role key like every other scheduled function -
// nobody's signed in when a cron job fires, so there's no user access token
// for RLS to key off, and this needs to read/write every user's bets, not
// just one poster's own group.
//
// Fetches scores/results through this project's own /api/scores and
// /api/racing-results (same as alert-checks.js's followed-fixture results
// check) rather than hitting the two providers directly - both are already
// cached per src/lib/apiCache.js, so a run landing soon after a user's own
// Tracker visit (or after alert-checks.js's own /api/scores call) shares
// that quota instead of spending it twice.
// @ts-check
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { evaluateEntryDetailed, resolveSettlement } from '../../src/lib/betEvaluation.js'
import { apiKeysForSport, sgoEventIdForLeg } from '../../src/lib/sportsConfig.js'

// Narrower than dataStore.js's BetPost/ManualEntry typedefs - this only
// selects the columns settlement actually needs, straight off the raw
// Postgrest row (snake_case), not the camelCase shape map* helpers produce.
/**
 * @typedef {object} SettleRow
 * @property {string} id
 * @property {string} user_id
 * @property {string} sport
 * @property {any[]} selections
 * @property {number|null} stake
 * @property {{notification_prefs?: {betSettled?: boolean}}|null} profiles
 */
/** @typedef {SettleRow & {table: 'bet_posts'|'manual_entries'}} OpenEntry */
/** @typedef {OpenEntry & {status: string, potentialReturnOverride?: number, outcomes?: any[]}} SettledEntry */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

/**
 * @param {string[]} apiSportKeys
 * @param {string[]} sgoIds
 * @returns {Promise<any[]>}
 */
async function fetchScores(apiSportKeys, sgoIds) {
  if (!apiSportKeys.length && !sgoIds.length) return []
  const params = new URLSearchParams()
  if (apiSportKeys.length) params.set('keys', apiSportKeys.join(','))
  if (sgoIds.length) params.set('sgoIds', sgoIds.join(','))
  const res = await fetch(`${SITE_URL}/api/scores?${params}`)
  if (!res.ok) return []
  return res.json()
}

/** @returns {Promise<any[]>} */
async function fetchRaceResults() {
  const res = await fetch(`${SITE_URL}/api/racing-results`)
  if (!res.ok) return []
  return res.json()
}

/** @param {any[]} selections */
function eventSummary(selections) {
  return selections?.[0]?.event ?? 'Your bet'
}

/**
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ settled: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const [{ data: posts }, { data: manual }] = await Promise.all([
      supabase.from('bet_posts').select('id,user_id,sport,selections,stake,profiles(notification_prefs)').eq('status', 'open'),
      supabase.from('manual_entries').select('id,user_id,sport,selections,stake,profiles(notification_prefs)').eq('status', 'open')
    ])
    // Supabase's untyped client sometimes infers the profiles(...) to-one
    // join as an array - it's a single row here, matching the FK.
    const postRows = /** @type {SettleRow[]} */ (/** @type {unknown} */ (posts ?? []))
    const manualRows = /** @type {SettleRow[]} */ (/** @type {unknown} */ (manual ?? []))

    /** @type {OpenEntry[]} */
    const open = [
      ...postRows.map((p) => ({ ...p, table: /** @type {const} */ ('bet_posts') })),
      ...manualRows.map((m) => ({ ...m, table: /** @type {const} */ ('manual_entries') }))
    ]
    if (!open.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    /** @type {Set<string>} */
    const neededKeys = new Set()
    /** @type {Set<string>} */
    const neededSgoIds = new Set()
    let needsRacing = false
    for (const entry of open) {
      for (const leg of entry.selections ?? []) {
        if (leg.sport === 'racing') needsRacing = true
        for (const key of apiKeysForSport(leg.sport ?? entry.sport)) neededKeys.add(key)
        const sgoId = sgoEventIdForLeg(leg)
        if (sgoId) neededSgoIds.add(sgoId)
      }
    }
    if (!neededKeys.size && !neededSgoIds.size && !needsRacing) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const [games, raceResults] = await Promise.all([
      fetchScores([...neededKeys], [...neededSgoIds]),
      needsRacing ? fetchRaceResults() : Promise.resolve([])
    ])
    if (!games.length && !raceResults.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    /** @type {SettledEntry[]} */
    const settledEntries = []
    for (const entry of open) {
      // Isolate each bet: this cron settles EVERY user's bets unattended, so a
      // single row that makes evaluation throw (a malformed/legacy leg the UI
      // wouldn't produce) must not abort the whole run and silently halt
      // settlement for everyone. Skip the bad row, log it, settle the rest.
      // The client twin (settlement.js) is already shielded by TrackerPage's
      // own .catch; this gives the passive path the same isolation.
      try {
        const detailed = evaluateEntryDetailed(entry, games, raceResults)
        const resolved = resolveSettlement(entry, detailed)
        // Only worth recording for a multi - see settlement.js's client-triggered
        // twin, which applies the same restriction.
        if (resolved) settledEntries.push({ ...entry, ...resolved, outcomes: (entry.selections?.length ?? 0) > 1 ? detailed.outcomes : undefined })
      } catch (evalErr) {
        console.error(`auto-settle: skipping ${entry.table} ${entry.id} - evaluation error:`, evalErr instanceof Error ? evalErr.message : evalErr)
      }
    }
    if (!settledEntries.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const settledAt = new Date().toISOString()
    await Promise.all(
      settledEntries.map((entry) => {
        /** @type {{status: string, settled_at: string, potential_return?: number, outcomes?: any[]}} */
        const update = { status: entry.status, settled_at: settledAt }
        if (entry.potentialReturnOverride !== undefined) update.potential_return = entry.potentialReturnOverride
        if (entry.outcomes !== undefined) update.outcomes = entry.outcomes
        return supabase.from(entry.table).update(update).eq('id', entry.id)
      })
    )

    // "Bet settled" push, for whoever's opted in - same pattern as
    // alert-checks.js's kickoff reminders, just a different trigger condition.
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
      const notifiable = settledEntries.filter((e) => e.profiles?.notification_prefs?.betSettled === true)
      if (notifiable.length) {
        const userIds = [...new Set(notifiable.map((e) => e.user_id))]
        const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
        /** @type {Map<string, any[]>} */
        const subsByUser = new Map()
        for (const sub of subs ?? []) {
          if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
          subsByUser.get(sub.user_id)?.push(sub)
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
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ settled: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // PRE-LAUNCH: dialled down from '*/30 * * * *' to once daily to cut Netlify
  // invocations while there are no real users. Safe because settlement.js
  // settles a user's bets the moment they open the Tracker - this passive cron
  // is only for nobody-looking settlement. Restore '*/30 * * * *' at launch.
  schedule: '0 6 * * *'
}
