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
    const { accessToken, groupId, friendId, authorId, followersOf, excludeUserId, title, body, url, gate } = await req.json()
    if (!accessToken || (!groupId && !friendId && !authorId && !followersOf)) {
      return new Response(JSON.stringify({ sent: 0, reason: 'missing accessToken and groupId/friendId/authorId/followersOf' }), {
        status: 200
      })
    }

    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    })

    let targetUserIds
    if (friendId) {
      // "friends can read each other's push subscriptions" (schema.sql)
      // covers the read below - no group lookup needed for a 1:1 DM.
      // Treated as transactional (DMs and challenge invites both go
      // through this path) - same no-notification_prefs-gate reasoning
      // alert-checks.js already uses for the trial-ending reminder: a
      // friend directly messaging or challenging you is rare enough, and
      // important enough, that it doesn't need its own opt-out.
      targetUserIds = [friendId]
    } else if (authorId) {
      // "commenters can read the bet author's push subscriptions"
      // (schema.sql) covers this - scoped to only whoever the caller has
      // actually just commented on, not a blanket grant.
      targetUserIds = [authorId]
    } else if (followersOf) {
      // "followed users can read their followers' push subscriptions"
      // (schema.sql) covers the read below - followersOf is always the
      // caller's own id here (you can only announce your own new posts).
      const { data: followers, error: followersError } = await supabase.from('follows').select('follower_id').eq('following_id', followersOf)
      if (followersError) throw followersError
      targetUserIds = followers.map((f) => f.follower_id)
    } else {
      const { data: members, error: membersError } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
      if (membersError) throw membersError
      targetUserIds = members.map((m) => m.user_id).filter((id) => id !== excludeUserId)
    }
    if (!targetUserIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    // Every scheduled push (auto-settle.js, alert-checks.js, etc.) already
    // gates on the recipient's notification_prefs before sending - this
    // real-time path never did, so AccountPage's "Bet posted in a group"
    // toggle silently did nothing, and reactions/comments had no opt-out
    // at all.
    //
    // groupId/followersOf both fan out to notifyGroup/notifyFollowers
    // (src/lib/notify.js), which cover more than just "a bet was posted" -
    // group tournament-started announcements go through the same groupId
    // path (GroupTournamentSection.jsx). Inferring "gate on betPosted"
    // from groupId alone (an earlier version of this fix did exactly that)
    // meant turning off "Bet posted in a group" silently also muted
    // tournament announcements, with no way to keep one and not the other.
    // So the CALLER states which pref (if any) applies via `gate` -
    // BetBuilderSheet.jsx/notifyFollowers pass 'betPosted' for an actual
    // bet post, GroupTournamentSection.jsx passes nothing and stays
    // transactional, same treatment as friendId above. authorId (reactions
    // + comments on YOUR bet) keeps its own hardcoded betActivity gate
    // rather than going through `gate` too - it's the one opt-OUT (not
    // opt-in) preference here, since those pushes already went to everyone
    // before this toggle existed, so `optedIn` below takes an explicit
    // predicate instead of assuming every gate is `=== true`.
    const optedIn = async (ids, predicate) => {
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,notification_prefs').in('id', ids)
      if (profilesError) throw profilesError
      return profiles.filter((p) => predicate(p.notification_prefs)).map((p) => p.id)
    }
    if (gate) {
      targetUserIds = await optedIn(targetUserIds, (prefs) => prefs?.[gate] === true)
    } else if (authorId) {
      targetUserIds = await optedIn(targetUserIds, (prefs) => prefs?.betActivity !== false)
    }
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
