// Fetch wrapper for the CoachGPT function (netlify/functions/coachgpt.js).
// Sends the new message plus the recent turns already held in page state
// and returns:
//   { configured: false }                     - no COACH_ANTHROPIC_KEY set;
//                                                show a "not available
//                                                here" state
//   { configured: true, limited: true, reply:
//     null, ... }                             - signed-in caller isn't
//                                                Plus and has hit the free
//                                                monthly message allowance
//                                                (see coachgpt.js's
//                                                FREE_MONTHLY_MESSAGE_LIMIT) -
//                                                show an upgrade prompt,
//                                                not a broken reply
//   { configured: true, reply, grounding,
//     recommendation }                        - the reply text (reply:
//                                                null only on a genuine
//                                                Anthropic failure), real
//                                                BetSlip legs for a
//                                                "Log this" affordance
//                                                when the reply was
//                                                grounded in exactly one
//                                                fixture/race (else null),
//                                                and the single full leg
//                                                CoachGPT locked in as its
//                                                actual lean (else null)
// accessToken is optional - omitted (local/no-backend mode, or signed out)
// simply means the free-allowance check can't run, so it degrades to
// unlimited rather than blocking a mode that was never metered.
// Never throws - any network failure resolves to "not configured" so the
// page can show one consistent unavailable state either way.
export async function sendCoachGptMessage({ message, history, priorGrounding, accessToken }) {
  try {
    const res = await fetch('/api/coachgpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history, priorGrounding, accessToken })
    })
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}
