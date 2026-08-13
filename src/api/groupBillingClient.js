// Fetch wrappers for netlify/functions/stripe-connect-onboarding.js and
// create-group-checkout-session.js. Same shape as premiumClient.js and,
// like it, not part of dataStore.js's dual-backend contract - a Stripe
// Connect flow is meaningless without a real Supabase backend AND a real
// Stripe account behind it, so there's no local-mode twin to keep in
// sync; both functions just return { configured: false } when either is
// missing, same "degrade, don't crash" contract every other proxy here
// follows.
//
// accessToken comes from dataStore.getAccessToken() - null in local mode,
// which both functions treat as "not configured" rather than throwing.

/** @param {{accessToken: string|null, groupId: string}} params @returns {Promise<{configured: boolean, url?: string, error?: string}>} */
export async function startConnectOnboarding({ accessToken, groupId }) {
  if (!accessToken) return { configured: false }
  try {
    const res = await fetch('/api/stripe-connect-onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, groupId })
    })
    return await res.json()
  } catch {
    return { configured: false }
  }
}

/** @param {{accessToken: string|null, groupId: string}} params @returns {Promise<{configured: boolean, url?: string, error?: string}>} */
export async function startGroupCheckout({ accessToken, groupId }) {
  if (!accessToken) return { configured: false }
  try {
    const res = await fetch('/api/create-group-checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, groupId })
    })
    return await res.json()
  } catch {
    return { configured: false }
  }
}
