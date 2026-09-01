// Agent HQ control endpoint (src/pages/AgentHqPage.jsx -> dataStore.agentAction
// -> /api/agent-action). Lets an admin approve/reject one of Coco's social
// posts or Sage's idea proposals straight from the in-app control room, running
// the exact same settle logic as the Discord buttons (src/lib/proposalActions.js)
// so the two paths can't diverge.
//
// This is reachable over HTTP by anyone, so - like admin-analytics.js and
// delete-account.js - it resolves the caller's identity from their own access
// token and checks profiles.is_admin server-side before it does anything; the
// client `isAdmin` flag is never trusted. The write itself uses the service-role
// key (proposal tables are service-role-write). Without Supabase configured it
// returns 503 and never throws.
import { createClient } from '@supabase/supabase-js'
import { settleSocialPost, settleIdeaProposal } from '../../src/lib/proposalActions.js'
import { postToX } from '../../src/lib/xClient.js'
import { openGithubIssue } from '../../src/lib/ideaIssue.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  const { accessToken, kind, id, action } = payload || {}
  if (!accessToken) return json({ error: 'Missing accessToken' }, 400)
  if (kind !== 'social' && kind !== 'idea') return json({ error: 'Unknown kind' }, 400)
  if (action !== 'approve' && action !== 'reject') return json({ error: 'Unknown action' }, 400)
  if (typeof id !== 'string' || !id) return json({ error: 'Missing id' }, 400)

  try {
    // Identity from the caller's own token, then is_admin server-side.
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin,display_name')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)
    const who = profile.display_name || 'operator'

    const result =
      kind === 'social'
        ? await settleSocialPost(admin, { id, action, who, postToX })
        : await settleIdeaProposal(admin, { id, action, who, openIssue: openGithubIssue })
    return json(result)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
