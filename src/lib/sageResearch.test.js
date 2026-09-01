import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSageBody,
  extractProposal,
  formatProposalMessage,
  buildIdeaIssue,
  SAGE_MODEL
} from './sageResearch.js'

test('buildSageBody wires the web_search tool and adaptive thinking', () => {
  const body = buildSageBody()
  assert.equal(SAGE_MODEL, 'claude-sonnet-5')
  assert.ok(Array.isArray(body.tools) && body.tools.length === 1)
  assert.equal(body.tools[0].type, 'web_search_20260209')
  assert.equal(body.tools[0].name, 'web_search')
  assert.deepEqual(body.thinking, { type: 'adaptive' })
  assert.ok(body.max_tokens > 0)
  assert.equal(body.messages[0].role, 'user')
  // Model is applied by buildAnthropicRequest, not baked into the body.
  assert.equal(body.model, undefined)
})

test('buildSageBody embeds the site context when given, web-only without', () => {
  const withCtx = buildSageBody('Users: 42, Groups: 8, most-bet sport: football')
  assert.match(withCtx.messages[0].content, /Users: 42/)
  assert.match(withCtx.messages[0].content, /site signals and the web/)
  const webOnly = buildSageBody()
  assert.doesNotMatch(webOnly.messages[0].content, /site signals/)
})

test('extractProposal concatenates text and prefers citations as sources', () => {
  const data = {
    content: [
      { type: 'thinking', thinking: 'ignored' },
      { type: 'server_tool_use', name: 'web_search', input: { query: 'x' } },
      {
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', url: 'https://searched.example/a', title: 'A' },
          { type: 'web_search_result', url: 'https://searched.example/b', title: 'B' }
        ]
      },
      {
        type: 'text',
        text: 'Great idea. ',
        citations: [{ url: 'https://cited.example/1', title: 'Cited One' }]
      },
      { type: 'text', text: 'More detail.' }
    ]
  }
  const { text, sources, searched } = extractProposal(data)
  assert.equal(text, 'Great idea. More detail.')
  assert.equal(searched, true)
  // Cited sources win over the raw search results.
  assert.deepEqual(sources, [{ url: 'https://cited.example/1', title: 'Cited One' }])
})

test('extractProposal falls back to search results when nothing is cited', () => {
  const data = {
    content: [
      {
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', url: 'https://ex.com/x', title: 'X' }]
      },
      { type: 'text', text: 'No citations here.' }
    ]
  }
  const { sources, searched } = extractProposal(data)
  assert.equal(searched, true)
  assert.deepEqual(sources, [{ url: 'https://ex.com/x', title: 'X' }])
})

test('extractProposal does not throw on a search error object', () => {
  const data = {
    content: [
      { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      { type: 'text', text: 'Fallback text.' }
    ]
  }
  const { text, sources, searched } = extractProposal(data)
  assert.equal(text, 'Fallback text.')
  assert.equal(searched, true)
  assert.deepEqual(sources, [])
})

test('extractProposal handles empty / malformed responses without throwing', () => {
  assert.deepEqual(extractProposal(undefined), { text: '', sources: [], searched: false })
  assert.deepEqual(extractProposal({}), { text: '', sources: [], searched: false })
  assert.deepEqual(extractProposal({ content: 'nope' }), { text: '', sources: [], searched: false })
})

test('extractProposal dedupes repeated citation urls', () => {
  const data = {
    content: [
      { type: 'text', text: 'a', citations: [{ url: 'https://dup.example', title: 'Dup' }] },
      { type: 'text', text: 'b', citations: [{ url: 'https://dup.example', title: 'Dup again' }] }
    ]
  }
  const { sources } = extractProposal(data)
  assert.equal(sources.length, 1)
  assert.equal(sources[0].title, 'Dup')
})

test('formatProposalMessage includes text and a source list', () => {
  const msg = formatProposalMessage({
    text: 'Launch a referral streak.',
    sources: [{ url: 'https://ex.com/r', title: 'Referral study' }]
  })
  assert.match(msg, /Sage proposes an idea/)
  assert.match(msg, /Launch a referral streak\./)
  assert.match(msg, /Referral study — <https:\/\/ex\.com\/r>/)
})

test('formatProposalMessage omits the sources block when there are none', () => {
  const msg = formatProposalMessage({ text: 'An idea with no sources.', sources: [] })
  assert.doesNotMatch(msg, /Sources/)
})

test('formatProposalMessage caps at Discord message length', () => {
  const msg = formatProposalMessage({ text: 'x'.repeat(5000), sources: [] })
  assert.ok(msg.length <= 1900)
})

test('buildIdeaIssue derives a clean title and a sourced body', () => {
  const { title, body } = buildIdeaIssue({
    body: '## Referral streaks\nGive mates a reward for inviting friends. It fits the social loop.',
    sources: [{ url: 'https://ex.com/a', title: 'A' }]
  })
  assert.equal(title, 'Referral streaks')
  assert.match(body, /Give mates a reward/)
  assert.match(body, /\[A\]\(https:\/\/ex\.com\/a\)/)
  assert.match(body, /Proposed by Sage/)
})

test('buildIdeaIssue survives an empty body', () => {
  const { title, body } = buildIdeaIssue({})
  assert.equal(title, 'BetMates idea')
  assert.ok(typeof body === 'string' && body.length > 0)
})
