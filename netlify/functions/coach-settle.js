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
import { evaluateLeg } from '../../src/lib/betEvaluation.js'
import { apiKeysForSport } from '../../src/lib/sportsConfig.js'

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
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ settled: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data } = await supabase.from('coach_messages').select('id,recommendation').not('recommendation', 'is', null).is('result', null)
    const due = /** @type {DueRow[]} */ (data ?? [])
    if (!due.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    /** @type {Set<string>} */
    const neededKeys = new Set()
    let needsRacing = false
    for (const row of due) {
      const leg = row.recommendation
      if (leg.sport === 'racing') needsRacing = true
      else for (const key of apiKeysForSport(leg.sport)) neededKeys.add(key)
    }
    if (!neededKeys.size && !needsRacing) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const [games, raceResults] = await Promise.all([fetchScores([...neededKeys]), needsRacing ? fetchRaceResults() : Promise.resolve([])])
    if (!games.length && !raceResults.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    const resolved = due
      .map((row) => ({ id: row.id, result: evaluateLeg(row.recommendation, games, raceResults) }))
      .filter((row) => row.result === 'won' || row.result === 'lost' || row.result === 'void')
    if (!resolved.length) return new Response(JSON.stringify({ settled: 0 }), { status: 200 })

    await Promise.all(resolved.map((row) => supabase.from('coach_messages').update({ result: row.result }).eq('id', row.id)))

    return new Response(JSON.stringify({ settled: resolved.length }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ settled: 0, error: message }), { status: 200 })
  }
}

export const config = {
  schedule: '*/30 * * * *'
}
