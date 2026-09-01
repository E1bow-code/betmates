// Bea's community pulse (scheduled). Scans groups for a member-count milestone
// they've just crossed (src/lib/communityMilestone.js) and posts a warm one-
// liner to Discord via the shared notifier. Dedupe is a watermark on the group
// row (groups.last_member_milestone), bumped only once an announcement actually
// reaches Discord - so each milestone fires exactly once, and an unconfigured
// (no-webhook) deploy never silently "uses up" a milestone it couldn't post.
//
// Gated like every other signal: without Supabase or DISCORD_WEBHOOK_URL it
// no-ops and never throws (the "missing keys degrade, don't crash" contract).
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { notifyDiscord } from '../../src/lib/discordNotify.js'
import { newlyCrossedMilestone, milestoneMessage, MEMBER_MILESTONES } from '../../src/lib/communityMilestone.js'
import { agentEnabled } from '../../src/lib/agentSettings.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK) {
    return json({ announced: 0, reason: 'not configured' })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Agent HQ can pause Bea without a deploy (agent_settings). Fail-open.
    if (!(await agentEnabled(supabase, 'bea'))) return json({ announced: 0, reason: 'disabled' })

    // Only groups that have reached at least the first milestone are worth
    // scanning; last_member_milestone (default 0) is the dedupe watermark.
    const { data: groups, error } = await supabase
      .from('groups')
      .select('id,name,member_count,last_member_milestone')
      .gte('member_count', MEMBER_MILESTONES[0])
    if (error) return json({ announced: 0, error: error.message })

    let announced = 0
    for (const g of groups ?? []) {
      const milestone = newlyCrossedMilestone(g.member_count ?? 0, g.last_member_milestone ?? 0)
      if (!milestone) continue
      // Announce first; only move the watermark if it actually posted, so a
      // Discord outage doesn't silently consume the milestone.
      const ok = await notifyDiscord(milestoneMessage(g.name, milestone))
      if (!ok) continue
      await supabase.from('groups').update({ last_member_milestone: milestone }).eq('id', g.id)
      announced++
    }

    return json({ announced })
  } catch (err) {
    return json({ announced: 0, error: err instanceof Error ? err.message : String(err) })
  }
}

export const config = {
  // Once daily. Milestones are rare events; a daily scan is plenty and keeps
  // Netlify invocations low. (No pre-launch dial-down needed - it's already
  // daily and no-ops entirely until there are groups + a webhook.)
  schedule: '0 10 * * *'
}
