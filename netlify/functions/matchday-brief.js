// The research desk's matchday brief (scheduled). Stands in for five of the
// sim's agents at once - Jonas (form), Rue (conditions), Vic (injuries), Ola
// (officials), Finn (fixtures/travel). Picks the soonest upcoming fixture a
// user follows that hasn't been briefed yet, asks Claude (with the web_search
// server tool) for a fact-checked, CITED pre-match briefing (src/lib/
// matchdayBrief.js), and posts it to Discord. It is research/context, never a
// tip or a prediction - the same never-tip rule the Coach follows.
//
// Same gating and budget as Sage: without the Anthropic key + Supabase +
// DISCORD_WEBHOOK_URL it no-ops and never throws, and the model call passes
// through the global llmBudget breaker. Dedupe is a watermark on the follow
// row (followed_fixtures.brief_sent_at), set only once the brief actually
// reaches Discord, so a fixture is briefed once and an outage doesn't consume
// it. See docs/agent-signals.md.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { notifyDiscord } from '../../src/lib/discordNotify.js'
import { buildAnthropicRequest } from '../../src/lib/anthropicRoute.js'
import { buildBriefBody, extractProposal, formatBriefMessage, BRIEF_MODEL } from '../../src/lib/matchdayBrief.js'
import { withinLlmBudget } from '../../src/lib/llmBudget.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
const API_KEY = OMNIROUTE_BASE_URL ? process.env.OMNIROUTE_API_KEY : process.env.COACH_ANTHROPIC_KEY
const route = OMNIROUTE_BASE_URL ? { baseUrl: OMNIROUTE_BASE_URL, modelPrefix: process.env.OMNIROUTE_MODEL_PREFIX } : undefined

// How far ahead a fixture has to kick off to be worth briefing now. Wide enough
// that a daily run always has the next day or two covered.
const WINDOW_MS = 48 * 60 * 60 * 1000

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// "Arsenal v Tottenham" / "Arsenal vs Spurs" -> { home, away }. Falls back to
// the whole label as the home side when there's no separator to split on.
function parseLabel(label) {
  const s = String(label || '').trim()
  const m = /^(.*?)\s+(?:v|vs|vs\.)\s+(.*)$/i.exec(s)
  return m ? { home: m[1].trim(), away: m[2].trim() } : { home: s, away: '' }
}

// Ask Claude for the cited brief. Returns { text, sources } or null.
async function research(fixture) {
  try {
    const { url, headers, body } = buildAnthropicRequest(API_KEY, BRIEF_MODEL, buildBriefBody(fixture), route)
    const res = await fetch(url, { method: 'POST', headers, body })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`matchday-brief: Anthropic ${res.status}: ${detail.slice(0, 300)}`)
      return null
    }
    const proposal = extractProposal(await res.json())
    return proposal.text ? proposal : null
  } catch (err) {
    console.error('matchday-brief: request failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK) {
    return json({ briefed: 0, reason: 'not configured' })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const now = Date.now()
    const horizon = new Date(now + WINDOW_MS).toISOString()
    // Soonest upcoming, not-yet-briefed follows within the window.
    const { data: follows, error } = await supabase
      .from('followed_fixtures')
      .select('sport,event_id,event_label,kickoff')
      .is('brief_sent_at', null)
      .gte('kickoff', new Date(now).toISOString())
      .lte('kickoff', horizon)
      .order('kickoff', { ascending: true })
      .limit(1)
    if (error) return json({ briefed: 0, error: error.message })
    if (!follows?.length) return json({ briefed: 0, reason: 'no upcoming follows' })

    const follow = follows[0]

    // Global daily spend breaker (fails open but bounded), like Sage.
    if (!(await withinLlmBudget(supabase, 2))) return json({ briefed: 0, reason: 'budget' })

    // Prefer real fixture columns (odds-snapshot upserts them) over parsing the
    // stored label.
    const { data: fx } = await supabase
      .from('fixtures')
      .select('home_team,away_team,competition,kickoff')
      .eq('id', follow.event_id)
      .maybeSingle()
    const parsed = parseLabel(follow.event_label)
    const fixture = {
      home: fx?.home_team || parsed.home,
      away: fx?.away_team || parsed.away,
      competition: fx?.competition || undefined,
      kickoff: fx?.kickoff || follow.kickoff || undefined
    }
    if (!fixture.home) return json({ briefed: 0, reason: 'no fixture label' })

    const proposal = await research(fixture)
    if (!proposal) return json({ briefed: 0, reason: 'nothing to brief' })

    const ok = await notifyDiscord(formatBriefMessage(fixture, proposal))
    if (!ok) return json({ briefed: 0, reason: 'discord post failed' })

    // Mark every user's follow of this fixture as briefed so it isn't repeated.
    await supabase
      .from('followed_fixtures')
      .update({ brief_sent_at: new Date().toISOString() })
      .eq('event_id', follow.event_id)

    return json({ briefed: 1, event_id: follow.event_id, sources: proposal.sources.length })
  } catch (err) {
    return json({ briefed: 0, error: err instanceof Error ? err.message : String(err) })
  }
}

export const config = {
  // Once daily (07:00 UTC). One cited brief per run for the soonest upcoming
  // followed fixture; the watermark stops repeats. Raise the cadence if you
  // want same-day briefs closer to kickoff.
  schedule: '0 7 * * *'
}
