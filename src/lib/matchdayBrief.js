// The "research desk" brief - the prompt, request shape and formatting for a
// fact-checked, cited pre-match briefing on ONE upcoming fixture a BetMates
// user follows. It stands in for five of the sim's research agents at once,
// each contributing a lens:
//   Jonas (Form Scout)      - recent form and results
//   Rue   (Conditions)      - weather / pitch at the venue
//   Vic   (Fitness / Med)   - injuries, suspensions, returns
//   Ola   (Officials Watch) - the appointed referee and their card tendency
//   Finn  (Fixtures/Travel) - fixture congestion, travel, fatigue
//
// Pure and I/O-free (like sageResearch.js / coach.js) so `npm test` covers it
// and the scheduled netlify function can import it out of src/lib. The Claude
// call and the fixture DB queries live in the function; the parsing reuses
// sageResearch.extractProposal since a web_search response is shaped the same
// whatever the prompt.
//
// This is RESEARCH, not a tip. BetMates never places bets and the desk never
// predicts a result or tells anyone what to back - it surfaces cited context,
// in keeping with the same never-tip rule the Coach follows.
import { extractProposal } from './sageResearch.js'

export { extractProposal }

// Same model + web-search tool as Sage - grounded research at Sonnet's cost.
export const BRIEF_MODEL = 'claude-sonnet-5'
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 6 }

export const BRIEF_SYSTEM = [
  'You are the "research desk" inside BetMates, a social betting *tracker*.',
  'BetMates never places real bets: mates log their own wagers and compare',
  'notes. You write a short, fact-checked PRE-MATCH BRIEFING on one upcoming',
  'fixture, grounded in real cited sources - never a prediction or a tip.',
  '',
  'Cover only the angles you can actually verify by searching, one short line',
  'each, and skip any you cannot confirm:',
  '- Form: each side\'s recent results / run.',
  '- Conditions: forecast weather or pitch at the venue.',
  '- Availability: notable injuries, suspensions or returns.',
  '- Officials: the appointed referee and their card tendency, if known.',
  '- Schedule: fixture congestion or travel/fatigue either side is carrying.',
  '',
  'Hard rules:',
  '- Never predict the result, name a side to back, or suggest a bet. You',
  '  surface context that already exists; you do not tip.',
  '- Do NOT invent facts. If searching does not confirm something, leave it',
  '  out. Every claim must trace to a source you found.',
  '- If you can confirm almost nothing, say so in one line rather than padding.',
  '',
  'Output plainly, no preamble and no sign-off: a one-line header naming the',
  'fixture, then the verified lines above as short bullets. Under ~220 words,',
  'British English.'
].join('\n')

/**
 * @typedef {{ home: string, away: string, competition?: string, kickoff?: string }} Fixture
 */

/**
 * The Messages API request body for a matchday brief (model applied separately
 * by buildAnthropicRequest). Adaptive thinking + the web_search tool, exactly
 * like Sage.
 * @param {Fixture} fixture
 * @returns {object}
 */
export function buildBriefBody(fixture) {
  const f = fixture || {}
  const when = f.kickoff ? ` (kicks off ${f.kickoff})` : ''
  const comp = f.competition ? ` in the ${f.competition}` : ''
  const ask = `Research a cited pre-match briefing for ${f.home} v ${f.away}${comp}${when}. Only include what you can verify.`
  return {
    max_tokens: 3200,
    thinking: { type: 'adaptive' },
    system: BRIEF_SYSTEM,
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: 'user', content: ask }]
  }
}

/**
 * Compose the Discord message for a brief: a titled header, the researched
 * lines, then the sources. Signed by the research desk. Kept under Discord's
 * message limit.
 * @param {Fixture} fixture
 * @param {{ text: string, sources: {url:string,title:string}[] }} proposal
 * @returns {string}
 */
export function formatBriefMessage(fixture, proposal) {
  const f = fixture || {}
  const { text, sources } = proposal
  let msg = `📋 **Matchday brief — ${f.home} v ${f.away}**\n\n${text}`
  if (sources && sources.length) {
    const lines = sources.slice(0, 6).map((s) => `• ${s.title} — <${s.url}>`)
    msg += `\n\n**Sources:**\n${lines.join('\n')}`
  }
  msg += '\n\n_Research desk: Jonas · Rue · Vic · Ola · Finn — context, not a tip._'
  return msg.length > 1900 ? `${msg.slice(0, 1899)}…` : msg
}
