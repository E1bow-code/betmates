// Discord interactions endpoint (set this function's URL as the app's
// "Interactions Endpoint URL" in the Discord Developer Portal). Discord calls
// it when someone clicks an Approve/Reject button on a proposal:
//   sp:*  - Coco's daily social posts   (social-propose.js  -> social_posts)
//   ip:*  - Sage's fact-checked ideas    (sage-propose.js    -> idea_proposals)
// Its auth is the Ed25519 signature Discord sends (verified against
// DISCORD_PUBLIC_KEY) - NOT denyUnlessCron - because Discord, not our cron, is
// the caller.
//
// Flow: verify signature -> PING? reply PONG -> button? flip the matching row;
// on approve, run the side effect (publish a post to X / open a GitHub issue
// for an idea); then respond with an UPDATE_MESSAGE (type 7) so the original
// message's buttons are replaced with the outcome. Everything is synchronous so
// it finishes inside Discord's 3s window (an X post or an issue create is well
// under a second); worst case the DB/side-effect still completes and only the
// message edit is missed.
//
// No-op-friendly: without DISCORD_PUBLIC_KEY it can't verify anyone, so it
// rejects; without Supabase the action is skipped and the message says so;
// without X / GitHub creds the relevant side effect is skipped but the decision
// is still recorded. It never throws.
import { createClient } from '@supabase/supabase-js'
import { verifyDiscordRequest } from '../../src/lib/discordVerify.js'
import { postToX } from '../../src/lib/xClient.js'
import { buildIdeaIssue } from '../../src/lib/sageResearch.js'

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Optional: when set, an approved idea is logged as a GitHub issue. REPO is
// "owner/repo". Unset -> the approval is recorded but no issue is opened.
const GITHUB_TOKEN = process.env.SAGE_GITHUB_TOKEN
const GITHUB_REPO = process.env.SAGE_GITHUB_REPO

// Discord interaction + response type constants (only the ones we use).
const PING = 1
const MESSAGE_COMPONENT = 3
const PONG = 1
const UPDATE_MESSAGE = 7

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// A type-7 response: replace the message's buttons with a plain outcome line.
function editMessage(content) {
  return json({ type: UPDATE_MESSAGE, data: { content, components: [] } })
}

// Coco: flip a social_posts row and, on approve, publish to X.
async function handleSocialPost(supabase, action, postId, who) {
  const { data: row } = await supabase.from('social_posts').select('id,body,status').eq('id', postId).maybeSingle()
  if (!row) return editMessage('This proposal no longer exists.')
  if (row.status !== 'pending') return editMessage(`Already ${row.status} - no change.`)

  const now = new Date().toISOString()
  if (action === 'reject') {
    await supabase.from('social_posts').update({ status: 'rejected', decided_at: now }).eq('id', postId)
    return editMessage(`❌ Rejected by ${who}. Post discarded.`)
  }

  // Approve: mark approved, then publish to X.
  await supabase.from('social_posts').update({ status: 'approved', decided_at: now }).eq('id', postId)
  const result = await postToX(row.body)
  if (result.skipped) {
    return editMessage(`✅ Approved by ${who}. (X not configured, so nothing was published.)`)
  }
  if (result.ok) {
    await supabase.from('social_posts').update({ status: 'posted', external_id: result.id ?? null, posted_at: new Date().toISOString() }).eq('id', postId)
    const link = result.id ? ` https://x.com/i/status/${result.id}` : ''
    return editMessage(`✅ Approved by ${who} — posted to X.${link}`)
  }
  await supabase.from('social_posts').update({ status: 'failed', error: (result.error || `HTTP ${result.status}`).slice(0, 500) }).eq('id', postId)
  return editMessage(`✅ Approved by ${who}, but the X post failed: ${result.error || `HTTP ${result.status}`}`)
}

// Best-effort: open a GitHub issue for an approved idea. Returns the issue URL,
// or null if GitHub isn't configured or the call failed. Never throws.
async function openIdeaIssue(row) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null
  try {
    const { title, body } = buildIdeaIssue(row)
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'betmates-sage'
      },
      body: JSON.stringify({ title, body, labels: ['sage-idea'] })
    })
    if (!res.ok) return null
    const created = await res.json().catch(() => ({}))
    return created?.html_url ?? null
  } catch {
    return null
  }
}

// Sage: flip an idea_proposals row and, on approve, optionally open an issue.
async function handleIdeaProposal(supabase, action, ideaId, who) {
  const { data: row } = await supabase.from('idea_proposals').select('id,body,sources,status').eq('id', ideaId).maybeSingle()
  if (!row) return editMessage('This idea no longer exists.')
  if (row.status !== 'pending') return editMessage(`Already ${row.status} - no change.`)

  const now = new Date().toISOString()
  if (action === 'reject') {
    await supabase.from('idea_proposals').update({ status: 'rejected', decided_by: who, decided_at: now }).eq('id', ideaId)
    return editMessage(`❌ Rejected by ${who}. Idea discarded.`)
  }

  // Approve: record it, then try to log a GitHub issue.
  await supabase.from('idea_proposals').update({ status: 'approved', decided_by: who, decided_at: now }).eq('id', ideaId)
  const issueUrl = await openIdeaIssue(row)
  if (issueUrl) {
    await supabase.from('idea_proposals').update({ issue_url: issueUrl }).eq('id', ideaId)
    return editMessage(`✅ Approved by ${who} — logged as an issue: ${issueUrl}`)
  }
  return editMessage(`✅ Approved by ${who}. Idea saved.`)
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const rawBody = await req.text()

  if (!PUBLIC_KEY || !(await verifyDiscordRequest(PUBLIC_KEY, signature, timestamp, rawBody))) {
    return new Response('invalid request signature', { status: 401 })
  }

  let interaction
  try {
    interaction = JSON.parse(rawBody)
  } catch {
    return new Response('bad request', { status: 400 })
  }

  // Discord's endpoint validation ping.
  if (interaction.type === PING) return json({ type: PONG })

  if (interaction.type === MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? ''
    // `sp:` = Coco's social post, `ip:` = Sage's idea. Both carry a uuid.
    const m = /^(sp|ip):(approve|reject):([0-9a-f-]{36})$/.exec(customId)
    if (!m) return editMessage('Unrecognised action.')
    const [, kind, action, id] = m
    const who = interaction.member?.user?.username || interaction.user?.username || 'operator'

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return editMessage('⚠️ Not configured (no database) - action not recorded.')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    return kind === 'sp'
      ? handleSocialPost(supabase, action, id, who)
      : handleIdeaProposal(supabase, action, id, who)
  }

  // Any other interaction type: acknowledge without doing anything.
  return json({ type: PONG })
}
