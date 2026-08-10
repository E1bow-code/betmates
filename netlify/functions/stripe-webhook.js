// Receives Stripe's subscription lifecycle events and is the ONLY place
// that ever writes is_premium/premium_until/stripe_subscription_id -
// create-checkout-session.js only ever writes stripe_customer_id. Runs
// with the service-role key (bypasses guard_premium_fields's
// anon/authenticated check the same way every other scheduled/webhook
// function bypasses RLS) since nobody is signed in when Stripe calls this.
//
// Signature verification needs the RAW body, not the parsed JSON body -
// req.text() (not req.json()) is deliberate here, unlike every other
// function in this directory.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

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

async function syncSubscription(admin, subscription) {
  const userId = await findUserId(admin, subscription)
  if (!userId) {
    console.error('syncSubscription: no matching user for customer', subscription.customer, 'metadata', subscription.metadata)
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
  if (error) console.error('syncSubscription update error', userId, error.message)
  else console.log('syncSubscription ok', userId, subscription.status, subscription.id)
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
      await syncSubscription(admin, event.data.object)
    } else if (event.type === 'customer.subscription.deleted') {
      const userId = await findUserId(admin, event.data.object)
      if (userId) await admin.from('profiles').update({ is_premium: false }).eq('id', userId)
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
