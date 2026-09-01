// Sage's research brain - the prompt, the request shape and the response
// parsing for a fact-checked BetMates idea proposal. Deliberately pure and
// I/O-free (like betEvaluation.js / coach.js) so `npm test` covers it and the
// scheduled netlify/functions/sage-propose.js can import it straight out of
// src/lib. The Claude call itself (fetch) lives in the function; everything
// decidable without a network - what to ask, how to read the answer - lives
// here so it's testable.
//
// "Fact-checked" is the whole point: Sage is given Claude's web_search server
// tool and prompted to ground each idea in REAL, current, cited sources rather
// than inventing statistics. extractProposal pulls both the written proposal
// and the source URLs that actually grounded it (the model's citations,
// falling back to the raw search results) so the operator can eyeball the
// evidence before approving.

// Same model as the ambient Coach takes - Sonnet is strong at grounded
// research-and-summarise at a fraction of Opus's per-token cost, and this runs
// unattended once a day, so it never needs the flagship chat model.
export const SAGE_MODEL = 'claude-sonnet-5'

// The web-search server tool. This exact type string is the current variant
// (Sonnet 5 / Opus 4.6+); older models take the basic `web_search_20250305`.
// max_uses bounds how many searches one proposal can run, keeping cost and
// latency predictable.
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

export const SAGE_SYSTEM = [
  'You are "Sage", the research & strategy agent inside BetMates - a social',
  'betting *tracker*. BetMates never places real bets: mates log their own',
  'wagers, compare odds and settle a trust-based leaderboard. Keep every idea',
  'inside that framing - never propose taking real money, placing bets for',
  'users, or anything that would turn BetMates into a bookmaker or a regulated',
  'operator.',
  '',
  'Your job: propose ONE concrete, fact-checked idea to grow or improve',
  'BetMates - a product feature, a growth or marketing tactic, a partnership,',
  'or a monetisation angle. Use web search to ground it in REAL, current facts',
  '(a market figure, a competitor move, a platform policy, a trend) and cite',
  'your sources. Do NOT invent statistics or sources - if you cannot verify a',
  'claim by searching, do not make it.',
  '',
  'Output plainly, no preamble and no sign-off:',
  '- A one-line title for the idea.',
  '- 2-3 sentences pitching it and why it fits BetMates.',
  '- 1-2 sentences on the researched evidence behind it, referencing what you',
  '  found.',
  'Keep the whole thing under ~180 words so it reads well in a chat message.',
  'British English.'
].join('\n')

const SAGE_USER_PROMPT = 'Research and propose today\'s BetMates idea, grounded in real cited sources.'

/**
 * The Messages API request body for a Sage proposal (model is applied
 * separately by buildAnthropicRequest). Adaptive thinking + the web_search
 * server tool: Claude searches, reasons over what it finds, and writes a cited
 * proposal. max_tokens is generous enough to cover the thinking budget plus the
 * short written output.
 * @returns {object}
 */
export function buildSageBody() {
  return {
    max_tokens: 3000,
    thinking: { type: 'adaptive' },
    system: SAGE_SYSTEM,
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: 'user', content: SAGE_USER_PROMPT }]
  }
}

/**
 * @typedef {{ url: string, title: string }} Source
 * @typedef {{ text: string, sources: Source[], searched: boolean }} Proposal
 */

/**
 * Pull the written proposal and its grounding sources out of a Messages API
 * response that used the web_search tool. The response interleaves the model's
 * text (with `citations` on grounded blocks), `server_tool_use` blocks, and
 * `web_search_tool_result` blocks whose `.content` is a LIST of
 * `web_search_result` on success but an OBJECT (e.g. `{ error_code }`) on a
 * search error - so this never assumes an array. Prefers the model's own
 * citations (the sources it actually used) and only falls back to the raw
 * search results when nothing was cited. Thinking blocks are ignored.
 *
 * @param {any} data  the parsed Messages API response
 * @returns {Proposal}
 */
export function extractProposal(data) {
  const content = Array.isArray(data?.content) ? data.content : []
  let text = ''
  const cited = []
  const searchedUrls = []
  const seenCited = new Set()
  const seenSearched = new Set()
  let searched = false

  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += block.text
      if (Array.isArray(block.citations)) {
        for (const c of block.citations) {
          const url = c?.url
          if (url && !seenCited.has(url)) {
            seenCited.add(url)
            cited.push({ url, title: c.title || url })
          }
        }
      }
    } else if (block?.type === 'web_search_tool_result') {
      searched = true
      // .content is the results list on success, an error object on failure.
      const results = Array.isArray(block.content) ? block.content : []
      for (const r of results) {
        const url = r?.url
        if (r?.type === 'web_search_result' && url && !seenSearched.has(url)) {
          seenSearched.add(url)
          searchedUrls.push({ url, title: r.title || url })
        }
      }
    }
  }

  return { text: text.trim(), sources: cited.length ? cited : searchedUrls, searched }
}

/**
 * Compose the Discord message body for a proposal: the idea text, then its
 * sources as a bullet list so the operator can check the evidence before
 * approving. Kept under Discord's 2000-char message limit.
 * @param {Proposal} proposal
 * @returns {string}
 */
export function formatProposalMessage(proposal) {
  const { text, sources } = proposal
  let msg = `🔎 **Sage proposes an idea:**\n\n${text}`
  if (sources && sources.length) {
    const lines = sources.slice(0, 6).map((s) => `• ${s.title} — <${s.url}>`)
    msg += `\n\n**Sources:**\n${lines.join('\n')}`
  }
  return msg.length > 1900 ? `${msg.slice(0, 1899)}…` : msg
}

/**
 * Turn an approved proposal row into a GitHub issue (title + body). The first
 * line of the proposal becomes the title; the rest, plus the sources, the
 * body. Pure so it's testable and the function only owns the HTTP call.
 * @param {{ body: string, sources?: Source[] }} row
 * @returns {{ title: string, body: string }}
 */
export function buildIdeaIssue(row) {
  const raw = String(row?.body ?? '').trim()
  const firstLine = raw.split('\n').find((l) => l.trim()) ?? 'BetMates idea'
  // Trim any leading markdown/label so the issue title is clean.
  const title = firstLine.replace(/^\s*(?:title\s*:|[#*>-]+)\s*/i, '').trim().slice(0, 120) || 'BetMates idea'

  const parts = [raw]
  const sources = Array.isArray(row?.sources) ? row.sources : []
  if (sources.length) {
    parts.push('', '### Sources', ...sources.map((s) => `- [${s.title || s.url}](${s.url})`))
  }
  parts.push('', '---', '_Proposed by Sage (BetMates research agent) and approved in Discord._')
  return { title, body: parts.join('\n') }
}
