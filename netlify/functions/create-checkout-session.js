// Starts a Stripe Checkout session for BetMates Plus. Like delete-account.js,
// only ever acts on the identity Supabase Auth confirms behind the caller's
// own access token - never a client-supplied user id, since this writes
// stripe_customer_id (bypassing the guard_premium_fields trigger via the
// service-role client, the one legitimate reason for that write to exist).
//
// Missing STRIPE_SECRET_KEY/price ids degrades like every other proxy here:
// { configured: false } at HTTP 200, never a crash - lets AccountPage show
// "not set up yet" instead of a broken button when Stripe hasn't been
// configured.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const PRICE_IDS = { monthly: process.env.STRIPE_PRICE_MONTHLY, annual: process.env.STRIPE_PRICE_ANNUAL }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req) => {
  if (req.method !== 'POST') return json({ configured: true, error: 'POST only' }, 405)
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !PRICE_IDS.monthly || !PRICE_IDS.annual) {
    return json({ configured: false })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json({ configured: true, error: 'Bad request body' }, 400)
  }

  const { accessToken, plan } = body ?? {}
  if (!accessToken) return json({ configured: true, error: 'Missing accessToken' }, 400)
  const priceId = PRICE_IDS[plan]
  if (!priceId) return json({ configured: true, error: 'Invalid plan' }, 400)

  const authClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !userData?.user) return json({ configured: true, error: 'Invalid or expired session.' }, 401)
  const userId = userData.user.id
  const email = userData.user.email

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  try {
    const { data: profile, error: profileError } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).single()
    if (profileError) throw profileError

    let customerId = profile?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { userId } })
      customerId = customer.id
      const { error: updateError } = await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
      if (updateError) throw updateError
    }

    const siteUrl = process.env.URL || new URL(req.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // 7 days free before the first charge - stripe-webhook.js's
      // isActiveStatus() already treats 'trialing' as active, so this
      // needed no change on the sync side. Card is still collected at
      // checkout (Stripe's default for subscription mode), so it just
      // auto-charges when the trial ends rather than needing a second
      // action from the user.
      subscription_data: { trial_period_days: 7, metadata: { userId } },
      success_url: `${siteUrl}/#/account?upgraded=1`,
      cancel_url: `${siteUrl}/#/account`
    })

    return json({ configured: true, url: session.url })
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : 'Failed to start checkout.' }, 500)
  }
}
