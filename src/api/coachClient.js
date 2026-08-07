// Fetch wrapper for the Coach function (netlify/functions/coach.js). Sends the
// rolled-up summary from src/utils/coachSummary.js and returns:
//   { configured: false }        - no ANTHROPIC_API_KEY set in prod; hide the section
//   { configured: true, take }   - the coaching text, or take: null when there's
//                                  nothing to say / upstream was unavailable
// Never throws - any network failure resolves to "not configured" so the
// Insights page renders the rest of itself untouched.
export async function fetchCoachTake(summary) {
  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary })
    })
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}
