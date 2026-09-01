// Sage's daily idea proposal (scheduled). Asks Claude - with the web_search
// server tool - to research ONE fact-checked, cited idea to grow or improve
// BetMates (src/lib/sageResearch.js), stores it as a 'pending' row in
// idea_proposals, and posts it to Discord with Approve / Reject buttons via the
// bot. A click is handled by discord-interactions.js, which flips the row and,
// on approve, optionally opens a GitHub issue for it.
//
// Same shape as Coco's social-propose.js, and everything is gated: without the
// Anthropic key + Discord bot token + channel id + Supabase it no-ops and never
// throws (the "missing keys degrade, don't crash" contract). The model call
// also passes through the same global daily spend breaker (llmBudget.js) the
// Coach endpoints use, so a misconfigured cron can't run the Anthropic bill
// away. See docs/social-agent-setup.md for the credentials.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { buildAnthropicRequest } from '../../src/lib/anthropicRoute.js'
import { buildSageBody, extractProposal, formatProposalMessage, SAGE_MODEL } from '../../src/lib/sageResearch.js'
import { withinLlmBudget } from '../../src/lib/llmBudget.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID
// Same credential resolution as coach.js: OmniRoute if configured, else the
// direct Anthropic key. Named COACH_ANTHROPIC_KEY (not ANTHROPIC_API_KEY) for
// the same local-dev reason documented there; Sage reuses it rather than
// introducing a second Anthropic key to manage.
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
const API_KEY = OMNIROUTE_BASE_URL ? process.env.OMNIROUTE_API_KEY : process.env.COACH_ANTHROPIC_KEY
const route = OMNIROUTE_BASE_URL ? { baseUrl: OMNIROUTE_BASE_URL, modelPrefix: process.env.OMNIROUTE_MODEL_PREFIX } : undefined

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Ask Claude for a researched, cited proposal. Returns { text, sources } or
// null for any reason it can't be produced (bad key, upstream error, a reply
// with no usable text) - the caller treats null as "nothing to propose today"
// and no-ops, never surfacing an error.
async function research() {
  try {
    const { url, headers, body } = buildAnthropicRequest(API_KEY, SAGE_MODEL, buildSageBody(), route)
    const res = await fetch(url, { method: 'POST', headers, body })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`sage: Anthropic ${res.status}: ${detail.slice(0, 300)}`)
      return null
    }
    const data = await res.json()
    const proposal = extractProposal(data)
    return proposal.text ? proposal : null
  } catch (err) {
    console.error('sage: request failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// Post the proposal carrying the Approve / Reject buttons via the bot. Returns
// the Discord message id, or null if not configured / the call failed. The
// custom_ids use the `ip:` prefix so discord-interactions.js routes them to the
// idea handler (Coco's posts use `sp:`).
async function postProposal(content, id) {
  if (!BOT_TOKEN || !CHANNEL_ID) return null
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bot ${BOT_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Approve', custom_id: `ip:approve:${id}` },
            { type: 2, style: 4, label: 'Reject', custom_id: `ip:reject:${id}` }
          ]
        }]
      })
    })
    if (!res.ok) return null
    const msg = await res.json().catch(() => ({}))
    return msg?.id ?? null
  } catch {
    return null
  }
}

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY || !BOT_TOKEN || !CHANNEL_ID) {
    return json({ proposed: 0, reason: 'not configured' })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Global daily spend breaker (fails open but bounded). One research call can
    // fan out into several searches + a final generation, so budget 2 units.
    if (!(await withinLlmBudget(supabase, 2))) {
      return json({ proposed: 0, reason: 'budget' })
    }

    const proposal = await research()
    if (!proposal) return json({ proposed: 0, reason: 'nothing to propose' })

    // Store the proposal first so the button custom_ids reference a real row.
    const { data: inserted, error } = await supabase
      .from('idea_proposals')
      .insert({ body: proposal.text, sources: proposal.sources })
      .select('id')
      .single()
    if (error || !inserted) {
      return json({ proposed: 0, error: error?.message ?? 'insert failed' })
    }

    const messageId = await postProposal(formatProposalMessage(proposal), inserted.id)
    if (messageId) {
      await supabase.from('idea_proposals').update({ discord_message_id: messageId }).eq('id', inserted.id)
    } else {
      // Couldn't reach Discord - reject the orphan so it isn't left pending
      // forever with no way to approve it.
      await supabase.from('idea_proposals').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', inserted.id)
      return json({ proposed: 0, reason: 'discord post failed' })
    }

    return json({ proposed: 1, id: inserted.id, sources: proposal.sources.length })
  } catch (err) {
    return json({ proposed: 0, error: err instanceof Error ? err.message : String(err) })
  }
}

export const config = {
  // Once daily (08:00 UTC, an hour before Coco's post). Sage proposes one
  // researched idea a day; the operator approves or rejects it in Discord.
  schedule: '0 8 * * *'
}
