// Fetch wrappers for the Coach function (netlify/functions/coach.js). Each
// sends a different already-aggregated shape and gets back:
//   { configured: false }        - no COACH_ANTHROPIC_KEY set in prod; hide the section
//   { configured: true, take }   - the coaching text, or take: null when there's
//                                  nothing to say / upstream was unavailable
// Never throws - any network failure resolves to "not configured" so the
// calling page/card renders the rest of itself untouched.
//
// accessToken proves this is a real signed-in caller - coach.js has no
// per-user message cap of its own to enforce (unlike coachgpt.js), but
// without SOME identity check it was reachable by anyone with no account
// at all, burning real Claude API cost. dataStore.getAccessToken()
// resolves to null in local/no-backend mode, which coach.js's own
// missing-Supabase-config contract already treats as open.
import { getAccessToken } from '../lib/dataStore.js'

async function postCoach(body) {
  try {
    const accessToken = await getAccessToken()
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, accessToken })
    })
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}

// "Coach's take" on the user's whole record (Insights).
export function fetchCoachTake(summary) {
  return postCoach({ summary })
}

// "Bet review" on one of the user's own settled bets, on request (Tracker's
// "Ask Coach" button).
export function fetchBetReview(bet) {
  return postCoach({ bet })
}

// "Group Coach" - a take on a group's week together, fed the same numbers
// GroupRecapCard already shows.
export function fetchGroupCoachTake(recap) {
  return postCoach({ recap })
}
