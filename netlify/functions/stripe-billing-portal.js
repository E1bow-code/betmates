// Starts a Stripe Billing Portal session so a user can manage or cancel
// their own subscriptions - BetMates Plus and/or any paid groups they're
// subscribed to, since both share one Stripe Customer
// (profiles.stripe_customer_id, created identically by
// create-checkout-session.js and create-group-checkout-session.js). One
// portal session covers everything on that Customer, so there's no
// group-specific variant of this function.
//
// Same identity model as every other function here - resolves the real
// user from their own access token, never a client-supplied id.
//
// A user who's never subscribed to anything has no stripe_customer_id yet -
// that's a normal, expected state (not an error), so it degrades to
// { configured: true, error: "..." } same as everywhere else rather than
// calling Stripe with nothing to look up.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

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

  const { accessToken } = body ?? {}
  if (!accessToken) return json({ configured: true, error: 'Missing accessToken' }, 400)

  const authClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !userData?.user) return json({ configured: true, error: 'Invalid or expired session.' }, 401)
  const userId = userData.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  try {
    const { data: profile, error: profileError } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).single()
    if (profileError) throw profileError
    if (!profile?.stripe_customer_id) {
      return json({ configured: true, error: "You don't have a billing account yet - subscribe to Plus or a paid group first." }, 400)
    }

    const siteUrl = process.env.URL || new URL(req.url).origin
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/#/account`
    })

    return json({ configured: true, url: session.url })
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : 'Failed to open billing portal.' }, 500)
  }
}
