// Starts a Stripe Checkout session for a paid group's monthly membership.
// Same identity model as create-checkout-session.js - resolves the real
// user from their own access token, never a client-supplied id.
//
// Unlike BetMates Plus (a fixed catalog of monthly/annual Price ids),
// every group picks its own price, so the line item is built inline with
// price_data rather than a pre-created Stripe Price. subscription_data's
// transfer_data.destination + application_fee_percent makes this a
// destination charge: the Customer/Subscription stay on the platform
// account (so stripe-webhook.js can sync them the same way it already
// syncs Plus), but the money (minus Stripe's own fee and BetMates' 10%)
// settles to the group owner's connected account.
//
// Missing config, or a group that hasn't finished Connect onboarding,
// degrades like every other proxy here: { configured: false }/an error
// message at HTTP 200/4xx, never a crash.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const PLATFORM_FEE_PERCENT = 10

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req) => {
  if (req.method !== 'POST') return json({ configured: true, error: 'POST only' }, 405)
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json({ configured: false })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json({ configured: true, error: 'Bad request body' }, 400)
  }

  const { accessToken, groupId } = body ?? {}
  if (!accessToken) return json({ configured: true, error: 'Missing accessToken' }, 400)
  if (!groupId) return json({ configured: true, error: 'Missing groupId' }, 400)

  const authClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !userData?.user) return json({ configured: true, error: 'Invalid or expired session.' }, 401)
  const userId = userData.user.id
  const email = userData.user.email

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  try {
    const { data: group, error: groupError } = await admin
      .from('groups')
      .select('id, name, invite_code, price_amount, price_currency, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', groupId)
      .single()
    if (groupError) throw groupError
    if (!group.price_amount) return json({ configured: true, error: 'This group is not priced.' }, 400)
    if (!group.stripe_connect_account_id || !group.stripe_connect_charges_enabled) {
      return json({ configured: true, error: "This group's owner hasn't finished setting up payouts yet." }, 400)
    }

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
    const joinUrl = `${siteUrl}/#/join/${group.invite_code}`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      // See create-checkout-session.js's comment - Managed Payments is on
      // by default and requires a tax_code, which price_data-built inline
      // products (each group's own custom price) have no way to carry.
      managed_payments: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: group.price_currency,
            unit_amount: Math.round(group.price_amount * 100),
            recurring: { interval: 'month' },
            product_data: { name: `${group.name} membership` }
          },
          quantity: 1
        }
      ],
      subscription_data: {
        transfer_data: { destination: group.stripe_connect_account_id },
        application_fee_percent: PLATFORM_FEE_PERCENT,
        metadata: { userId, groupId }
      },
      success_url: `${joinUrl}?subscribed=1`,
      cancel_url: joinUrl
    })

    return json({ configured: true, url: session.url })
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : 'Failed to start checkout.' }, 500)
  }
}
