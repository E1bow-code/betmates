// Fetch wrapper for netlify/functions/create-checkout-session.js. Not part
// of dataStore.js's dual-backend contract (unlike every other profile
// mutation) - a Stripe checkout is meaningless without a real Supabase
// backend AND a real Stripe account behind it, so there's no local-mode
// twin to keep in sync; the function itself just returns
// { configured: false } when either is missing, same "degrade, don't
// crash" contract every other proxy in this codebase follows.
//
// accessToken comes from dataStore.getAccessToken() - null in local mode,
// which the function treats as "not configured" rather than throwing.
/** @param {{accessToken: string|null, plan: 'monthly'|'annual'}} params @returns {Promise<{configured: boolean, url?: string, error?: string}>} */
export async function startPremiumCheckout({ accessToken, plan }) {
  if (!accessToken) return { configured: false }
  try {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, plan })
    })
    return await res.json()
  } catch {
    return { configured: false }
  }
}
