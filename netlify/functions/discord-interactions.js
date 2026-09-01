// Discord interactions endpoint (set this function's URL as the app's
// "Interactions Endpoint URL" in the Discord Developer Portal). Discord calls
// it when someone clicks an Approve/Reject button on one of Coco's proposed
// posts (social-propose.js). Its auth is the Ed25519 signature Discord sends
// (verified against DISCORD_PUBLIC_KEY) - NOT denyUnlessCron - because Discord,
// not our cron, is the caller.
//
// Flow: verify signature -> PING? reply PONG -> button? flip the social_posts
// row; on approve, publish the post to X (xClient.js) and record the tweet id;
// then respond with an UPDATE_MESSAGE (type 7) so the original message's
// buttons are replaced with the outcome. Everything is synchronous so it
// finishes inside Discord's 3s window (an X post is well under a second);
// worst case the DB/X action still completes and only the message edit is
// missed.
//
// No-op-friendly: without DISCORD_PUBLIC_KEY it can't verify anyone, so it
// rejects; without Supabase or X creds the relevant step is skipped and the
// message says so, but it never throws.
import { createClient } from '@supabase/supabase-js'
import { verifyDiscordRequest } from '../../src/lib/discordVerify.js'
import { postToX } from '../../src/lib/xClient.js'

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
    const m = /^sp:(approve|reject):([0-9a-f-]{36})$/.exec(customId)
    if (!m) return editMessage('Unrecognised action.')
    const [, action, postId] = m
    const who = interaction.member?.user?.username || interaction.user?.username || 'operator'

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return editMessage('⚠️ Not configured (no database) - action not recorded.')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Only act on a still-pending post - a second click (or a re-delivered
    // interaction) is idempotent and just reports the settled state.
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

  // Any other interaction type: acknowledge without doing anything.
  return json({ type: PONG })
}
