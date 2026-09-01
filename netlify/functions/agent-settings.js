// Agent HQ on/off endpoint (src/pages/AgentHqPage.jsx -> dataStore
// .listAgentSettings / .setAgentEnabled -> /api/agent-settings). Lets an admin
// read every agent's on/off flag and pause/resume one, without a deploy. The
// scheduled functions read these flags via src/lib/agentSettings.js.
//
// Reachable over HTTP by anyone, so - like admin-analytics.js and
// agent-action.js - it resolves the caller from their own access token and
// checks profiles.is_admin server-side before doing anything; the write itself
// uses the service-role key (agent_settings is service-role-write). Without
// Supabase configured it returns 503 and never throws.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// The agents that can be toggled (must match the keys the scheduled functions
// check). Rejecting anything else keeps junk out of the table.
const KEYS = new Set(['coco', 'sage', 'bea', 'dex', 'coach', 'mira', 'priya', 'nova'])

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
  const { accessToken, action, key, enabled } = payload || {}
  if (!accessToken) return json({ error: 'Missing accessToken' }, 400)

  try {
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    if (action === 'list') {
      const { data, error } = await admin.from('agent_settings').select('key,enabled')
      if (error) throw error
      return json({ settings: data ?? [] })
    }

    if (action === 'set') {
      if (!KEYS.has(key)) return json({ error: 'Unknown agent' }, 400)
      if (typeof enabled !== 'boolean') return json({ error: 'enabled must be a boolean' }, 400)
      const { error } = await admin
        .from('agent_settings')
        .upsert({ key, enabled, updated_at: new Date().toISOString(), updated_by: userData.user.id }, { onConflict: 'key' })
      if (error) throw error
      return json({ ok: true, key, enabled })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
