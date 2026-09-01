// Agent HQ "Run now" endpoint (src/pages/AgentHqPage.jsx -> dataStore.agentRun
// -> /api/agent-run). Lets an admin fire one of the proactive "poster" agents
// on demand instead of waiting for its daily schedule: Coco (social-propose),
// Sage (sage-propose) and Bea (community-pulse). The reactive signal agents
// (Dex/Mira/Priya/Nova/CoachGPT) react to real events - there's nothing to
// force-run - so they aren't here.
//
// It reuses each agent's EXACT scheduled handler by importing it and calling it
// with a synthetic cron-authorised request, so an on-demand run and a scheduled
// run can't behave differently. Admin-verified server-side (same pattern as
// agent-action.js / agent-settings.js) before anything runs; a paused agent
// still no-ops (the handler checks its own flag), which is the intended
// behaviour - resume it first. Without Supabase configured it 503s and never
// throws.
import { createClient } from '@supabase/supabase-js'
import socialPropose from './social-propose.js'
import sagePropose from './sage-propose.js'
import communityPulse from './community-pulse.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Only the proactive posters can be run on demand. Keys match Agent HQ's
// settingsKey.
const RUNNERS = { coco: socialPropose, sage: sagePropose, bea: communityPulse }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: 'Not configured' }, 503)

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const { accessToken, key } = payload || {}
  if (!accessToken) return json({ error: 'Missing accessToken' }, 400)
  const runner = RUNNERS[key]
  if (!runner) return json({ error: 'This agent can’t be run on demand.' }, 400)

  try {
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    // Invoke the agent's own scheduled handler. The synthetic request carries
    // the Netlify scheduled-invocation header so denyUnlessCron admits it (the
    // admin check above is the real gate here).
    const synthetic = new Request('https://internal/agent-run', { headers: { 'x-nf-event': 'schedule' } })
    const res = await runner(synthetic)
    const result = await res.json().catch(() => ({}))
    return json({ ok: true, key, result })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
