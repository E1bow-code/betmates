// Receives Stripe's subscription lifecycle events (BetMates Plus AND paid
// group memberships - see create-group-checkout-session.js) plus Connect
// account.updated events for group payout onboarding. Runs with the
// service-role key (bypasses guard_premium_fields/guard_group_connect_fields's
// anon/authenticated check the same way every other scheduled/webhook
// function bypasses RLS) since nobody is signed in when Stripe calls this.
//
// Signature verification needs the RAW body, not the parsed JSON body -
// req.text() (not req.json()) is deliberate here, unlike every other
// function in this directory.
//
// Group subscription events land on this SAME endpoint as Plus - a group
// checkout is a destination charge (see create-group-checkout-session.js),
// which keeps the Customer/Subscription on the platform account rather
// than the connected one, so there's no separate Connect webhook needed
// for subscription.*. Only account.updated (onboarding completion) is
// Connect-specific, and Stripe still delivers that to this same endpoint
// once "listen to events on connected accounts" is enabled on it.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

// Mirrors what the Stripe dashboard itself treats as "customer has access" -
// trialing counts, incomplete/past_due/canceled/unpaid don't. current_period_end
// covers the "canceled but paid through the period end" case so access doesn't
// vanish mid-period on a self-serve cancellation.
function isActiveStatus(status) {
  return status === 'active' || status === 'trialing'
}

// The subscription's current period end as an ISO string, or null.
// current_period_end moved OFF the top-level Subscription and onto its items
// in Stripe's 2025-03 ("basil") API versions - which stripe-node v22 defaults
// toward, and this code pins no apiVersion - so a webhook delivered on a basil
// version carries it only at subscription.items.data[0].current_period_end.
// Reading only the top-level field left premium_until / group_subscriptions.
// current_period_end null, which silently killed the trial-ending and paid-
// group renewal reminders in alert-checks.js (both gate on those columns being
// non-null) and dropped the "renews {date}" line on the account page. Read
// whichever shape the payload carries so it works on either API version.
function subscriptionPeriodEndIso(subscription) {
  const raw = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null
  return raw ? new Date(raw * 1000).toISOString() : null
}

async function findUserId(admin, subscription) {
  if (subscription.metadata?.userId) return subscription.metadata.userId
  const { data, error } = await admin.from('profiles').select('id').eq('stripe_customer_id', subscription.customer).single()
  if (error) console.error('findUserId lookup error', subscription.customer, error.message)
  return data?.id ?? null
}

async function syncPlusSubscription(admin, subscription) {
  const userId = await findUserId(admin, subscription)
  if (!userId) {
    console.error('syncPlusSubscription: no matching user for customer', subscription.customer, 'metadata', subscription.metadata)
    return
  }
  const periodEnd = subscriptionPeriodEndIso(subscription)
  const { error } = await admin
    .from('profiles')
    .update({
      is_premium: isActiveStatus(subscription.status),
      premium_until: periodEnd,
      premium_status: subscription.status,
      stripe_subscription_id: subscription.id
    })
    .eq('id', userId)
  // Throws, doesn't just log - this write is the actual grant of paid
  // access. The outer handler's own comment already says "a transient DB
  // error should fail loudly enough to get retried", but nothing here
  // ever threw, so it never did: a genuinely-paying subscriber whose
  // profiles update failed (network blip, not a real data problem) still
  // got a 200 back to Stripe, which then never retries per the comment's
  // own documented intent - confirmed by reading straight through, not
  // eyeballed.
  if (error) throw new Error(`syncPlusSubscription update failed for ${userId}: ${error.message}`)
  console.log('syncPlusSubscription ok', userId, subscription.status, subscription.id)
}

// Mirrors syncPlusSubscription's shape but writes group_subscriptions
// (the select-only-for-clients table, see schema.sql) instead of profiles,
// and grants/revokes the actual group_members row that the rest of the
// app already gates all group access on - no separate "paid content"
// concept needed anywhere else.
async function syncGroupSubscription(admin, subscription) {
  const groupId = subscription.metadata.groupId
  const userId = subscription.metadata.userId
  if (!groupId || !userId) {
    console.error('syncGroupSubscription: missing metadata on subscription', subscription.id, subscription.metadata)
    return
  }
  const periodEnd = subscriptionPeriodEndIso(subscription)
  const { error } = await admin.from('group_subscriptions').upsert(
    {
      group_id: groupId,
      subscriber_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      status: subscription.status,
      current_period_end: periodEnd
    },
    { onConflict: 'group_id,subscriber_id' }
  )
  // Both writes below throw rather than log-and-continue, same reasoning
  // as syncPlusSubscription - a subscriber who's genuinely paid but never
  // got their group_subscriptions row (or, worse, never got the actual
  // group_members access row the rest of the app gates everything on)
  // because of a transient failure deserves a Stripe retry, not a silent
  // 200.
  if (error) throw new Error(`syncGroupSubscription upsert failed for group ${groupId}/user ${userId}: ${error.message}`)
  if (isActiveStatus(subscription.status)) {
    const { error: memberError } = await admin.from('group_members').upsert({ group_id: groupId, user_id: userId })
    if (memberError) throw new Error(`syncGroupSubscription member upsert failed for group ${groupId}/user ${userId}: ${memberError.message}`)
  }
  console.log('syncGroupSubscription ok', groupId, userId, subscription.status, subscription.id)
}

// Shared owner-facing push for group subscription lifecycle events - looks
// up the group/owner, the subscriber's display name, and the owner's push
// subscriptions once; callers just supply the title/body copy. No
// notification_prefs gate, matching the reaction/comment pushes elsewhere
// (send-push.js) - these are inherently opt-in-worthy business events
// without an existing dedicated toggle.
async function notifyGroupOwner(admin, groupId, subscriberId, buildMessage) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  const { data: group, error: groupError } = await admin.from('groups').select('name, created_by').eq('id', groupId).single()
  if (groupError || !group || group.created_by === subscriberId) return
  const { data: subscriber } = await admin.from('profiles').select('display_name').eq('id', subscriberId).single()
  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('*').eq('user_id', group.created_by)
  if (subsError || !subs?.length) return

  webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({
    ...buildMessage(subscriber?.display_name ?? 'Someone', group.name),
    url: `/#/groups/${groupId}`
  })
  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload).catch(() => null)
    )
  )
}

// Callers only invoke this on customer.subscription.created, not .updated,
// so a renewal or payment-method change doesn't re-notify the owner every
// billing period.
function notifyNewGroupSubscriber(admin, groupId, subscriberId) {
  return notifyGroupOwner(admin, groupId, subscriberId, (name, groupName) => ({
    title: '🎉 New paying member!',
    body: `${name} just joined ${groupName}`
  }))
}

// customer.subscription.deleted fires once per cancellation (immediate or
// end-of-period), so this doesn't need the same created-vs-updated
// event-type guard the new-subscriber push does.
function notifyGroupSubscriberLeft(admin, groupId, subscriberId) {
  return notifyGroupOwner(admin, groupId, subscriberId, (name, groupName) => ({
    title: 'A member left',
    body: `${name} cancelled their subscription to ${groupName}`
  }))
}

async function syncConnectAccount(admin, account) {
  if (!account.charges_enabled || !account.details_submitted) return
  const { error } = await admin
    .from('groups')
    .update({ stripe_connect_charges_enabled: true })
    .eq('stripe_connect_account_id', account.id)
  if (error) throw new Error(`syncConnectAccount update failed for ${account.id}: ${error.message}`)
  console.log('syncConnectAccount ok', account.id)
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !WEBHOOK_SECRET) {
    return new Response('Not configured', { status: 500 })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY)
  const sig = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object
      if (subscription.metadata?.groupId) {
        await syncGroupSubscription(admin, subscription)
        if (event.type === 'customer.subscription.created' && isActiveStatus(subscription.status)) {
          await notifyNewGroupSubscriber(admin, subscription.metadata.groupId, subscription.metadata.userId)
        }
      } else {
        await syncPlusSubscription(admin, subscription)
      }
    } else if (event.type === 'customer.subscription.deleted') {
      // These three writes REVOKE access on cancellation - none of them
      // checked their own {error} before this (some didn't even
      // destructure it), so a failed revoke here was invisible, not just
      // unretried: a user who cancelled kept paid access indefinitely
      // with nothing in the logs to say why. Now checked and thrown,
      // same as the sync helpers above.
      const subscription = event.data.object
      if (subscription.metadata?.groupId) {
        const { groupId, userId } = subscription.metadata
        const { error: subError } = await admin
          .from('group_subscriptions')
          .update({ status: subscription.status })
          .eq('group_id', groupId)
          .eq('subscriber_id', userId)
        if (subError) throw new Error(`group_subscriptions revoke failed for group ${groupId}/user ${userId}: ${subError.message}`)
        const { error: memberError } = await admin.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
        if (memberError) throw new Error(`group_members revoke failed for group ${groupId}/user ${userId}: ${memberError.message}`)
        await notifyGroupSubscriberLeft(admin, groupId, userId)
      } else {
        const userId = await findUserId(admin, subscription)
        if (userId) {
          const { error: profileError } = await admin.from('profiles').update({ is_premium: false }).eq('id', userId)
          if (profileError) throw new Error(`Plus revoke failed for user ${userId}: ${profileError.message}`)
        }
      }
    } else if (event.type === 'account.updated') {
      await syncConnectAccount(admin, event.data.object)
    }
    // checkout.session.completed is deliberately not handled separately -
    // the subscription.created event that follows it carries the same
    // metadata and is the actual source of truth for status/period end.
  } catch (err) {
    // Stripe retries on non-2xx, so a transient DB error should fail loudly
    // enough to get retried rather than being swallowed.
    return new Response(err instanceof Error ? err.message : 'Webhook handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'content-type': 'application/json' } })
}
