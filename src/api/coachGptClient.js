// Fetch wrapper for the CoachGPT function (netlify/functions/coachgpt.js).
// Sends the new message plus the recent turns already held in page state
// and returns:
//   { configured: false }        - no ANTHROPIC_API_KEY set; show a "not
//                                   available here" state
//   { configured: true, reply }  - the reply text, or reply: null if
//                                   Claude never produced one
// Never throws - any network failure resolves to "not configured" so the
// page can show one consistent unavailable state either way.
export async function sendCoachGptMessage({ message, history }) {
  try {
    const res = await fetch('/api/coachgpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history })
    })
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}
