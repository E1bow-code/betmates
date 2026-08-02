// Fans a Web Push notification out to a group's members. Authenticates to
// Supabase as the POSTER (their own access token, passed in the request
// body) rather than a service-role key - this project doesn't have one
// configured, so push_subscriptions' "group-mates can read subscriptions
// to notify them" RLS policy (see supabase/schema.sql) does the access
// control instead of a server bypassing RLS entirely.
//
// Always resolves 200 even on failure - a broken push send should never
// surface as an error on the bet-posting flow that triggers it (see
// src/lib/notify.js, which calls this and swallows any error already, but
// belt-and-braces here too).
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'push not configured' }), { status: 200 })
  }

  try {
    const { accessToken, groupId, excludeUserId, title, body, url } = await req.json()
    if (!accessToken || !groupId) {
      return new Response(JSON.stringify({ sent: 0, reason: 'missing accessToken or groupId' }), { status: 200 })
    }

    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    })

    const { data: members, error: membersError } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
    if (membersError) throw membersError

    const targetUserIds = members.map((m) => m.user_id).filter((id) => id !== excludeUserId)
    if (!targetUserIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const { data: subs, error: subsError } = await supabase.from('push_subscriptions').select('*').in('user_id', targetUserIds)
    if (subsError) throw subsError

    const payload = JSON.stringify({ title, body, url })
    const results = await Promise.allSettled(
      subs.map((sub) => webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload))
    )

    return new Response(JSON.stringify({ sent: results.filter((r) => r.status === 'fulfilled').length }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}
