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
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
  const { error } = await admin
    .from('profiles')
    .update({
      is_premium: isActiveStatus(subscription.status),
      premium_until: periodEnd,
      stripe_subscription_id: subscription.id
    })
    .eq('id', userId)
  if (error) console.error('syncPlusSubscription update error', userId, error.message)
  else console.log('syncPlusSubscription ok', userId, subscription.status, subscription.id)
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
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
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
  if (error) {
    console.error('syncGroupSubscription upsert error', groupId, userId, error.message)
    return
  }
  if (isActiveStatus(subscription.status)) {
    const { error: memberError } = await admin.from('group_members').upsert({ group_id: groupId, user_id: userId })
    if (memberError) console.error('syncGroupSubscription member upsert error', groupId, userId, memberError.message)
  }
  console.log('syncGroupSubscription ok', groupId, userId, subscription.status, subscription.id)
}

// Congratulates the group owner the moment a subscription is actually
// created - callers only invoke this on customer.subscription.created, not
// .updated, so a renewal or payment-method change doesn't re-notify the
// owner every billing period. No notification_prefs gate, matching the
// reaction/comment pushes elsewhere (send-push.js) - this is an inherently
// opt-in-worthy business event without an existing dedicated toggle.
async function notifyNewGroupSubscriber(admin, groupId, subscriberId) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  const { data: group, error: groupError } = await admin.from('groups').select('name, created_by').eq('id', groupId).single()
  if (groupError || !group || group.created_by === subscriberId) return
  const { data: subscriber } = await admin.from('profiles').select('display_name').eq('id', subscriberId).single()
  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('*').eq('user_id', group.created_by)
  if (subsError || !subs?.length) return

  webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({
    title: '🎉 New paying member!',
    body: `${subscriber?.display_name ?? 'Someone'} just joined ${group.name}`,
    url: `/#/groups/${groupId}`
  })
  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload).catch(() => null)
    )
  )
}

async function syncConnectAccount(admin, account) {
  if (!account.charges_enabled || !account.details_submitted) return
  const { error } = await admin
    .from('groups')
    .update({ stripe_connect_charges_enabled: true })
    .eq('stripe_connect_account_id', account.id)
  if (error) console.error('syncConnectAccount update error', account.id, error.message)
  else console.log('syncConnectAccount ok', account.id)
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
      const subscription = event.data.object
      if (subscription.metadata?.groupId) {
        const { groupId, userId } = subscription.metadata
        await admin.from('group_subscriptions').update({ status: subscription.status }).eq('group_id', groupId).eq('subscriber_id', userId)
        await admin.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
      } else {
        const userId = await findUserId(admin, subscription)
        if (userId) await admin.from('profiles').update({ is_premium: false }).eq('id', userId)
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
