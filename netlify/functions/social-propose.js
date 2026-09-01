// Coco's daily proposal (scheduled). Drafts a promo post from real BetMates
// data (src/lib/socialDraft.js), stores it as a 'pending' row in social_posts,
// and posts it to Discord with Approve / Reject buttons via the bot. A click is
// handled by discord-interactions.js, which flips the row and publishes an
// approved post to X.
//
// Buttons require the message to be sent by an application, so this posts via
// the bot token (a plain incoming webhook can't carry components). Everything
// is gated: without the bot token + channel id + Supabase it no-ops and never
// throws, the same "missing keys degrade, don't crash" contract as the rest of
// the app. See docs/social-agent-setup.md for the credentials.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { buildDailyPost } from '../../src/lib/socialDraft.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID

/** Best-effort exact-count of rows matching an eq filter; 0 on any error. */
async function count(supabase, table, column, value) {
  try {
    const q = supabase.from(table).select('id', { count: 'exact', head: true })
    const { count: c } = await (value === undefined ? q : q.eq(column, value))
    return c ?? 0
  } catch {
    return 0
  }
}

// Post a message carrying the Approve / Reject buttons via the bot. Returns the
// Discord message id, or null if not configured / the call failed.
async function postProposal(body, postId) {
  if (!BOT_TOKEN || !CHANNEL_ID) return null
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bot ${BOT_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `📝 **Coco proposes today's post:**\n\n> ${body}`,
        allowed_mentions: { parse: [] },
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Approve & post', custom_id: `sp:approve:${postId}` },
            { type: 2, style: 4, label: 'Reject', custom_id: `sp:reject:${postId}` }
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BOT_TOKEN || !CHANNEL_ID) {
    return new Response(JSON.stringify({ proposed: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Cheap, real signals for the draft; each defaults to 0/absent on error so
    // the copywriter always has something to say (community fallback).
    const [cmWon, cmLost, dpWon, dpLost, groupCount] = await Promise.all([
      count(supabase, 'coach_messages', 'result', 'won'),
      count(supabase, 'coach_messages', 'result', 'lost'),
      count(supabase, 'coach_daily_picks', 'result', 'won'),
      count(supabase, 'coach_daily_picks', 'result', 'lost'),
      count(supabase, 'groups')
    ])
    const coachRecord = { w: cmWon + dpWon, l: cmLost + dpLost }

    const body = buildDailyPost({ coachRecord, groupCount })

    // Store the proposal first so the button custom_ids reference a real row.
    const { data: inserted, error } = await supabase
      .from('social_posts')
      .insert({ body, platform: 'x', status: 'pending' })
      .select('id')
      .single()
    if (error || !inserted) {
      return new Response(JSON.stringify({ proposed: 0, error: error?.message ?? 'insert failed' }), { status: 200 })
    }

    const messageId = await postProposal(body, inserted.id)
    if (messageId) {
      await supabase.from('social_posts').update({ discord_message_id: messageId }).eq('id', inserted.id)
    } else {
      // Couldn't reach Discord - drop the orphan proposal so it isn't left
      // pending forever with no way to approve it.
      await supabase.from('social_posts').update({ status: 'failed', error: 'discord post failed' }).eq('id', inserted.id)
      return new Response(JSON.stringify({ proposed: 0, reason: 'discord post failed' }), { status: 200 })
    }

    return new Response(JSON.stringify({ proposed: 1, id: inserted.id }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ proposed: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // Once daily (09:00 UTC). Coco proposes one post a day; the operator approves
  // or rejects it in Discord. Adjust the cadence to taste.
  schedule: '0 9 * * *'
}
