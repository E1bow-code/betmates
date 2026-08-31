// Scheduled function (see `config.schedule` below) - CoachGPT's "pick of the
// day". Once a day it grounds itself on real upcoming fixtures (the same tools
// the chat endpoint uses), locks in ONE genuine value pick, and stores it in
// coach_daily_picks. It does NOT settle the pick - coach-settle.js grades it
// against real /api/scores results later, exactly as it does a user's
// lock_in_recommendation picks - so Coach builds a real, verifiable tipster
// record over time with nobody signed in.
//
// Reuses runCoachGptTurn + the grounding tools + matchRecommendation from the
// chat endpoint UNCHANGED, so a daily pick is grounded and matched to a real leg
// by the exact same code a live chat pick is - no second grounding/matching path
// to drift. Missing COACH_ANTHROPIC_KEY (or the OmniRoute creds) degrades like
// every proxy here: returns { picked: 0, reason: 'not configured' } and touches
// nothing, so merging this changes nothing until the key is set.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { runCoachGptTurn, matchRecommendation } from '../../src/lib/coachgpt.js'
import {
  toolListUpcoming,
  toolFindFixture,
  toolGetPlayerProfile,
  toolGetNews,
  toolGetResults,
  toolGetTeamForm
} from './coachgpt.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
const COACH_ROUTE = OMNIROUTE_BASE_URL
  ? { baseUrl: OMNIROUTE_BASE_URL, modelPrefix: process.env.OMNIROUTE_MODEL_PREFIX }
  : undefined

const PROMPT =
  "It's your daily pick. Use your tools to look across the next couple of days of fixtures " +
  'and settle on the SINGLE best-value bet you can find. Name one specific selection clearly ' +
  'as your lean, with a sentence on why. One pick only - this goes on your public record, so ' +
  'make it your genuine best call, not a longshot.'

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  const apiKey = OMNIROUTE_BASE_URL ? process.env.OMNIROUTE_API_KEY : process.env.COACH_ANTHROPIC_KEY
  if (!apiKey || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ picked: 0, reason: 'not configured' }), { status: 200 })
  }

  const siteUrl = process.env.URL || 'https://betmates.org'
  const today = new Date().toISOString().slice(0, 10)

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Idempotent: one pick per day. Don't spend a model call if today's is in.
    const { data: existing } = await supabase.from('coach_daily_picks').select('id').eq('pick_date', today).maybeSingle()
    if (existing) return new Response(JSON.stringify({ picked: 0, reason: 'already picked today' }), { status: 200 })

    // Same tool wiring as the chat handler: find_fixture's grounding accumulates
    // so matchRecommendation can match the real pick even when it isn't the last
    // fixture the model looked at. The personal tools have no signed-in user
    // here, so they degrade to unavailable rather than erroring.
    let allGrounding = []
    const callTool = async (name, input) => {
      if (name === 'list_upcoming_events') return toolListUpcoming(siteUrl, input)
      if (name === 'find_fixture') {
        const groundingOut = {}
        const result = await toolFindFixture(siteUrl, input, groundingOut)
        if (groundingOut.value) allGrounding = [...allGrounding, ...groundingOut.value]
        return result
      }
      if (name === 'get_player_profile') return toolGetPlayerProfile(input.name)
      if (name === 'get_recent_news') return toolGetNews(siteUrl, input)
      if (name === 'get_recent_results') return toolGetResults(siteUrl, input)
      if (name === 'get_team_form') return toolGetTeamForm(siteUrl, input)
      if (['get_my_record', 'get_my_open_bets', 'get_my_group_standings', 'get_coach_record'].includes(name)) {
        return { available: false, reason: 'not applicable to the daily pick' }
      }
      return { error: `Unknown tool: ${name}` }
    }

    const { text, recommendation, error } = await runCoachGptTurn({ apiKey, history: [], message: PROMPT, callTool, route: COACH_ROUTE })
    if (error) return new Response(JSON.stringify({ picked: 0, reason: `coach unavailable: ${error}` }), { status: 200 })

    const grounding = allGrounding.length
      ? Array.from(new Map(allGrounding.map((leg) => [`${leg.selection}-${leg.eventId ?? leg.horseId ?? leg.event}`, leg])).values())
      : null
    const leg = matchRecommendation(recommendation, grounding)
    if (!leg) return new Response(JSON.stringify({ picked: 0, reason: 'no confident pick today' }), { status: 200 })

    const { error: insertError } = await supabase.from('coach_daily_picks').insert({
      pick_date: today,
      sport: leg.sport ?? null,
      reply: text,
      recommendation: leg,
      result: null
    })
    // A race (two runs the same minute) trips the pick_date unique constraint -
    // that's fine, today's pick already exists; report it rather than 500-ing.
    if (insertError) return new Response(JSON.stringify({ picked: 0, reason: 'already picked today' }), { status: 200 })

    return new Response(JSON.stringify({ picked: 1, sport: leg.sport, selection: leg.selection }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ picked: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // Late-morning UK - most days' fixtures and prices are up by now. One model
  // call a day (self-skips once today's pick is stored), and it only spends at
  // all when COACH_ANTHROPIC_KEY is set, so it's safe to ship dormant.
  schedule: '0 11 * * *'
}
