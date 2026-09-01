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
import { openGithubIssue } from '../../src/lib/ideaIssue.js'
import { settleSocialPost, settleIdeaProposal } from '../../src/lib/proposalActions.js'

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

// Coco: flip a social_posts row and, on approve, publish to X. The decision +
// writes live in src/lib/proposalActions.js (shared with the Agent HQ endpoint);
// here we just render the outcome back into the Discord message.
async function handleSocialPost(supabase, action, postId, who) {
  const r = await settleSocialPost(supabase, { id: postId, action, who, postToX })
  return editMessage(r.message)
}

// Sage: flip an idea_proposals row and, on approve, optionally open a GitHub
// issue (openGithubIssue). Same shared settle logic as above.
async function handleIdeaProposal(supabase, action, ideaId, who) {
  const r = await settleIdeaProposal(supabase, { id: ideaId, action, who, openIssue: openGithubIssue })
  return editMessage(r.message)
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
