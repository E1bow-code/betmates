// Scheduled function (see `config.schedule` below) - settles CoachGPT's own
// lock_in_recommendation picks, the same way auto-settle.js settles real
// user bets, so the CoachGPT scoreboard (src/pages/CoachGptPage.jsx) has a
// real win/lose record instead of staying empty forever. Deliberately
// reuses evaluateLeg from src/lib/betEvaluation.js UNCHANGED rather than
// hand-rolling a second settlement rule set - a recommendation leg (the
// full object netlify/functions/coachgpt.js matched out of `grounding`) has
// the exact same shape (event/market/selection/sport/eventId or
// raceId+horseId/odds) a real bet leg has, evaluateLeg has no idea it isn't
// one. No each-way handling needed: unlike a real bet, a recommendation leg
// never carries eachWay/eachWayPlaces, so evaluateLeg's 'placed' branch
// never fires here - only 'won'/'lost'/'void'/'undetermined' come back.
//
// Hits the same /api/scores and /api/racing-results endpoints auto-settle.js
// already calls, both cached via src/lib/apiCache.js, so this shares
// whichever run (a user's Tracker visit, auto-settle.js, or an earlier call
// this same cron minute) already paid the API-quota cost instead of
// spending it again.
// @ts-check
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { evaluateLeg } from '../../src/lib/betEvaluation.js'
import { apiKeysForSport } from '../../src/lib/sportsConfig.js'
import { notifyDiscord } from '../../src/lib/discordNotify.js'
import { agentEnabled } from '../../src/lib/agentSettings.js'

/**
 * @typedef {object} DueRow
 * @property {string} id
 * @property {any} recommendation
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

/** @param {string[]} apiSportKeys @returns {Promise<any[]>} */
async function fetchScores(apiSportKeys) {
  if (!apiSportKeys.length) return []
  const res = await fetch(`${SITE_URL}/api/scores?keys=${encodeURIComponent(apiSportKeys.join(','))}`)
  if (!res.ok) return []
  return res.json()
}

/** @returns {Promise<any[]>} */
async function fetchRaceResults() {
  const res = await fetch(`${SITE_URL}/api/racing-results`)
  if (!res.ok) return []
  return res.json()
}

/**
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ settled: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Two sources of unsettled picks, graded the same way: a user's own
    // lock_in_recommendation picks (coach_messages) and CoachGPT's standalone
    // "pick of the day" (coach_daily_picks, written by coach-pick.js). Both hold
    // a recommendation leg of the same shape, so one score fetch settles both.
    const [{ data: msgData }, { data: dailyData }] = await Promise.all([
      supabase.from('coach_messages').select('id,recommendation').not('recommendation', 'is', null).is('result', null),
      supabase.from('coach_daily_picks').select('id,recommendation').not('recommendation', 'is', null).is('result', null)
    ])
    const dueMsgs = /** @type {DueRow[]} */ (msgData ?? [])
    const dueDaily = /** @type {DueRow[]} */ (dailyData ?? [])
    if (!dueMsgs.length && !dueDaily.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    /** @type {Set<string>} */
    const neededKeys = new Set()
    let needsRacing = false
    for (const row of [...dueMsgs, ...dueDaily]) {
      const leg = row.recommendation
      if (leg.sport === 'racing') needsRacing = true
      else for (const key of apiKeysForSport(leg.sport)) neededKeys.add(key)
    }
    if (!neededKeys.size && !needsRacing) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const [games, raceResults] = await Promise.all([fetchScores([...neededKeys]), needsRacing ? fetchRaceResults() : Promise.resolve([])])
    if (!games.length && !raceResults.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    // Isolate each pick: one recommendation that makes evaluateLeg throw must not
    // abort the whole unattended run and stall settlement for every other pick.
    // Skip it (leaves result null -> retried next run).
    const resolveRows = (/** @type {DueRow[]} */ rows) => rows
      .map((row) => {
        try {
          return { id: row.id, result: evaluateLeg(row.recommendation, games, raceResults) }
        } catch (evalErr) {
          console.error(`coach-settle: skipping recommendation ${row.id} - evaluation error:`, evalErr instanceof Error ? evalErr.message : evalErr)
          return { id: row.id, result: 'undetermined' }
        }
      })
      .filter((row) => row.result === 'won' || row.result === 'lost' || row.result === 'void')

    const resolvedMsgs = resolveRows(dueMsgs)
    const resolvedDaily = resolveRows(dueDaily)
    if (!resolvedMsgs.length && !resolvedDaily.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const settledAt = new Date().toISOString()
    await Promise.all([
      ...resolvedMsgs.map((row) => supabase.from('coach_messages').update({ result: row.result }).eq('id', row.id)),
      ...resolvedDaily.map((row) => supabase.from('coach_daily_picks').update({ result: row.result, settled_at: settledAt }).eq('id', row.id))
    ])

    // Ping the operator on Discord with CoachGPT's fresh grades and its
    // cumulative record. No-ops without DISCORD_WEBHOOK_URL and can never
    // throw; the cumulative counts are best-effort (default 0 on any error) so
    // a slow/failed count query can't affect the settlement just written.
    const graded = [...resolvedMsgs, ...resolvedDaily]
    const rw = graded.filter((r) => r.result === 'won').length
    const rl = graded.filter((r) => r.result === 'lost').length
    const rv = graded.filter((r) => r.result === 'void').length
    const countBy = (table, res) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('result', res)
    const [mw, ml, dw, dl] = await Promise.all([
      countBy('coach_messages', 'won'), countBy('coach_messages', 'lost'),
      countBy('coach_daily_picks', 'won'), countBy('coach_daily_picks', 'lost')
    ]).then((rs) => rs.map((r) => r.count ?? 0)).catch(() => [0, 0, 0, 0])
    // CoachGPT's Discord voice can be muted from Agent HQ - grading above still
    // ran regardless. Fail-open.
    if (await agentEnabled(supabase, 'coach')) {
      await notifyDiscord(
        `🧠 **CoachGPT** — graded ${graded.length} pick${graded.length === 1 ? '' : 's'} (${rw}W / ${rl}L / ${rv}V). Record now **${mw + dw}–${ml + dl}**.`
      )
    }

    return new Response(JSON.stringify({ settled: resolvedMsgs.length + resolvedDaily.length }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ settled: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // PRE-LAUNCH: dialled down from '*/30 * * * *' to once daily to cut Netlify
  // invocations while there are few real users. Once daily is enough to settle
  // CoachGPT's daily pick (coach-pick.js) against the prior day's results; bump
  // back to '*/30 * * * *' at launch so user picks settle promptly too.
  schedule: '30 6 * * *'
}
