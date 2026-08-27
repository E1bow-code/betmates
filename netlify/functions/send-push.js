// Fans a Web Push notification out to a group's members, a friend, a bet
// author's commenters, or a poster's followers. Runs on the service-role
// key, same as every other push-sending function (auto-settle.js,
// alert-checks.js, etc.) - it wasn't always: this used to authenticate as
// the POSTER's own access token and lean on push_subscriptions' RLS
// policies ("group-mates can read...", "friends can read...", etc., see
// supabase/schema.sql) to both fetch subscriptions AND enforce that the
// caller actually had the claimed relationship to the target. Those
// policies granted raw push credentials (endpoint/keys) to a broad
// relationship set for that reason, which was more exposure than the
// feature needed. Now the relationship itself is checked explicitly
// below (resolveGroupMember/resolveFriend/resolveCommenter/
// resolveFollower) using the caller's identity resolved from their own
// access token - same shape as delete-account.js/create-checkout-session.js
// - and push_subscriptions no longer needs those broad SELECT policies at
// all (see schema.sql: only "user manages own push subscriptions"
// remains).
//
// Always resolves 200 even on failure - a broken push send should never
// surface as an error on the bet-posting flow that triggers it (see
// src/lib/notify.js, which calls this and swallows any error already, but
// belt-and-braces here too).
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

// Each mirrors the exact predicate the RLS policy it replaces used to
// enforce (see schema.sql's comments on each policy for the reasoning) -
// callerId always comes from the caller's own resolved access token,
// never a client-supplied id, so none of these can be spoofed by passing
// a different id in the request body.
async function isGroupMember(admin, groupId, callerId) {
  const { data, error } = await admin.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', callerId).maybeSingle()
  if (error) throw error
  return !!data
}

async function isFriend(admin, callerId, targetId) {
  const { data, error } = await admin
    .from('friendships')
    .select('id')
    .or(`and(user_a.eq.${callerId},user_b.eq.${targetId}),and(user_a.eq.${targetId},user_b.eq.${callerId})`)
    .maybeSingle()
  if (error) throw error
  return !!data
}

async function hasCommentedOn(admin, callerId, authorId) {
  const { data, error } = await admin
    .from('bet_comments')
    .select('id, bet_posts!inner(user_id)')
    .eq('user_id', callerId)
    .eq('bet_posts.user_id', authorId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'push not configured' }), { status: 200 })
  }

  try {
    const { accessToken, groupId, friendId, authorId, followersOf, excludeUserId, title, body, url, gate } = await req.json()
    if (!accessToken || (!groupId && !friendId && !authorId && !followersOf)) {
      return new Response(JSON.stringify({ sent: 0, reason: 'missing accessToken and groupId/friendId/authorId/followersOf' }), {
        status: 200
      })
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return new Response(JSON.stringify({ sent: 0, reason: 'invalid session' }), { status: 200 })
    const callerId = userData.user.id

    // Every legitimate caller (src/lib/notify.js) only ever sends an
    // internal hash route ("/#/tracker", "/#/messages/<id>", ...) - but
    // this is a public endpoint any authenticated caller can hit directly
    // with their own request body, and nothing enforced that `url` stays
    // internal. src/sw.js's notificationclick handler navigates the app
    // (or opens a new window) straight to whatever `url` a push payload
    // carries, with no origin check of its own - confirmed live, an
    // absolute attacker-controlled URL passed through untouched, turning
    // a trusted-looking BetMates push into a phishing delivery channel to
    // anyone the caller has a legitimate relationship with (a group-mate,
    // friend, follower, or even just someone who's commented on their
    // bet). `//evil.example` is rejected too, not just `https://...` - a
    // protocol-relative URL is still an absolute one to a browser.
    const safeUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'

    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    let targetUserIds
    if (friendId) {
      // Treated as transactional (DMs and challenge invites both go
      // through this path) - same no-notification_prefs-gate reasoning
      // alert-checks.js already uses for the trial-ending reminder: a
      // friend directly messaging or challenging you is rare enough, and
      // important enough, that it doesn't need its own opt-out.
      if (!(await isFriend(admin, callerId, friendId))) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      targetUserIds = [friendId]
    } else if (authorId) {
      // Scoped tightly to "the caller has actually just commented on one
      // of this author's bets", not a blanket grant.
      if (!(await hasCommentedOn(admin, callerId, authorId))) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      targetUserIds = [authorId]
    } else if (followersOf) {
      // followersOf must be the caller's own id - you can only announce
      // your own new posts to your own followers, never someone else's.
      if (followersOf !== callerId) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      const { data: followers, error: followersError } = await admin.from('follows').select('follower_id').eq('following_id', followersOf)
      if (followersError) throw followersError
      targetUserIds = followers.map((f) => f.follower_id)
    } else {
      if (!(await isGroupMember(admin, groupId, callerId))) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      const { data: members, error: membersError } = await admin.from('group_members').select('user_id').eq('group_id', groupId)
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
      const { data: profiles, error: profilesError } = await admin.from('profiles').select('id,notification_prefs').in('id', ids)
      if (profilesError) throw profilesError
      return profiles.filter((p) => predicate(p.notification_prefs)).map((p) => p.id)
    }
    // authorId is checked BEFORE gate, not merely instead of it - this
    // function is a public endpoint any authenticated caller can hit
    // directly with their own request body, not just through notify.js's
    // own call shapes, so a caller passing `authorId` alongside an
    // unrelated `gate` value (e.g. one of their own opted-in prefs) must
    // not be able to swap out the hardcoded betActivity check for
    // whichever pref happens to favour them - reaction/comment pushes on
    // someone else's bet always respect that one specific opt-out,
    // full stop. `gate` itself is also constrained to the specific keys a
    // legitimate caller actually sends (notify.js's notifyGroup passes
    // 'betPosted' or 'groupChat', notifyFollowers passes 'betPosted'),
    // rather than trusting an arbitrary caller-supplied string as a
    // notification_prefs property name.
    // Each gate's default when the pref key is absent (a profile that
    // predates the toggle, or one that's never touched it) - false means
    // opt-in (only send once someone's explicitly turned it on), true
    // means opt-out (send unless explicitly turned off), same "don't
    // silently mute something everyone already expects" reasoning
    // betActivity above uses for reactions/comments.
    const GATE_DEFAULTS = { betPosted: false, groupChat: true }
    if (authorId) {
      targetUserIds = await optedIn(targetUserIds, (prefs) => prefs?.betActivity !== false)
    } else if (gate && gate in GATE_DEFAULTS) {
      const defaultOn = GATE_DEFAULTS[gate]
      targetUserIds = await optedIn(targetUserIds, (prefs) => (prefs?.[gate] ?? defaultOn) === true)
    }
    if (!targetUserIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('*').in('user_id', targetUserIds)
    if (subsError) throw subsError

    const payload = JSON.stringify({ title, body, url: safeUrl })
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
