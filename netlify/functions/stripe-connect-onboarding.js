// Starts (or resumes) Stripe Express onboarding for a paid group's owner.
// Same identity model as create-checkout-session.js - resolves the real
// user from their own access token, never a client-supplied id - since
// this writes stripe_connect_account_id (bypassing
// guard_group_connect_fields via the service-role client, the one
// legitimate reason for that write to exist).
//
// Missing config degrades like every other proxy here: { configured:
// false } at HTTP 200, never a crash.
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
      .select('created_by, stripe_connect_account_id')
      .eq('id', groupId)
      .single()
    if (groupError) throw groupError
    if (group.created_by !== userId) return json({ configured: true, error: 'Only the group owner can do this.' }, 403)

    let accountId = group.stripe_connect_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express', email, metadata: { groupId, userId } })
      accountId = account.id
      const { error: updateError } = await admin.from('groups').update({ stripe_connect_account_id: accountId }).eq('id', groupId)
      if (updateError) throw updateError
    }

    const siteUrl = process.env.URL || new URL(req.url).origin
    const returnUrl = `${siteUrl}/#/groups/${groupId}`
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    })

    return json({ configured: true, url: accountLink.url })
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : 'Failed to start onboarding.' }, 500)
  }
}
