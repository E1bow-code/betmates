// One-tap compose + post-to-X for the Command Deck (src/pages/AgentHqPage.jsx ->
// dataStore.composePost -> /api/social-compose). Coco's scheduled job drafts a
// promo and routes it through a Discord Approve/Reject loop; this endpoint is
// the operator's direct hand: compose a post server-side (from the same
// deterministic templates in src/lib/socialDraft.js - never free client text)
// and publish it straight to X, admin-verified.
//
// Three modes:
//   - preview: compose and return the body (no post, no DB write) so the studio
//     can show the draft before you commit.
//   - post:    compose from a chosen sport + subject, publish, record the row.
//   - daily:   compose Coco's daily promo (buildDailyPost) from live signals,
//              publish, record the row.
//
// Admin-verified the same way as agent-action.js (anon getUser for identity ->
// service-role profiles.is_admin check). Degrades, never crashes: no Supabase ->
// 503; X keys unset -> postToX returns { skipped } and we save the draft as
// 'approved' and tell the operator X isn't connected rather than failing.
import { createClient } from '@supabase/supabase-js'
import { buildDailyPost, composeSubjectPost } from '../../src/lib/socialDraft.js'
import { postToX } from '../../src/lib/xClient.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function count(admin, table, col, val) {
  let q = admin.from(table).select('id', { count: 'exact', head: true })
  if (col) q = q.eq(col, val)
  const { count: n } = await q
  return n || 0
}

// The same cheap, real signals Coco's daily draft leans on.
async function gatherSignals(admin) {
  const [w, l, groupCount] = await Promise.all([
    count(admin, 'coach_daily_picks', 'result', 'won'),
    count(admin, 'coach_daily_picks', 'result', 'lost'),
    count(admin, 'groups')
  ])
  return { coachRecord: { w, l }, groupCount }
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
  const { accessToken, mode = 'preview', sport = 'football', subject = 'hype' } = payload || {}
  if (!accessToken) return json({ error: 'Missing accessToken' }, 400)

  try {
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const signals = await gatherSignals(admin)
    const body = mode === 'daily' ? buildDailyPost(signals) : composeSubjectPost({ sport, subject, ...signals })

    // Preview: hand back the draft, publish nothing.
    if (mode === 'preview') return json({ ok: true, body })

    // Publish. postToX never throws: it returns { skipped } when X isn't
    // configured, { ok, id } on success, or { ok:false, error } on failure.
    const result = await postToX(body)
    if (result.skipped) {
      await admin.from('social_posts').insert({ body, platform: 'x', status: 'approved' })
      return json({ ok: true, posted: false, skipped: true, body, message: 'Saved the draft - X isn’t connected yet (set the X_* keys to post live).' })
    }
    if (result.ok) {
      await admin.from('social_posts').insert({ body, platform: 'x', status: 'posted', external_id: result.id ?? null, posted_at: new Date().toISOString() })
      return json({ ok: true, posted: true, body, link: result.id ? `https://x.com/i/status/${result.id}` : null, message: 'Posted to X ✓' })
    }
    await admin.from('social_posts').insert({ body, platform: 'x', status: 'failed', error: result.error || 'post failed' })
    return json({ ok: false, posted: false, body, error: result.error || 'X rejected the post.' })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
