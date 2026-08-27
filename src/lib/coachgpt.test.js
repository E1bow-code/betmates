import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCoachGptTurn, COACHGPT_MODELS } from './coachgpt.js'

// The orchestration loop talks to Anthropic over fetch; these tests stub
// global fetch with a scripted queue of responses so we can drive the model
// fallback and error-propagation paths without a real key or network. The
// error paths log via console.error by design - silence it so the suite output
// stays clean.
console.error = () => {}

// Each responder is called with the parsed request body (so a test can assert
// which model was used) and returns { status, json }. ok is derived from
// status; a non-2xx body is what callClaudeModel reads via res.text().
function stubFetch(responders) {
  const calls = []
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body)
    calls.push(body)
    const responder = responders[Math.min(calls.length - 1, responders.length - 1)]
    const r = responder(body)
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 400,
      status,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json ?? {})
    }
  }
  return calls
}

const textReply = (t) => () => ({ status: 200, json: { stop_reason: 'end_turn', content: [{ type: 'text', text: t }] } })
const toolReply = (name, input) => () => ({
  status: 200,
  json: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name, input }] }
})
const errReply = (status, type) => () => ({ status, json: { error: { type } } })
const lockReply = (hasPick) => () => ({ status: 200, json: { content: [{ type: 'tool_use', name: 'lock_in_recommendation', input: { hasPick } }] } })

const noTool = async () => ({})

test('no api key returns a no_key error without calling fetch', async () => {
  globalThis.fetch = () => {
    throw new Error('should not be called')
  }
  const res = await runCoachGptTurn({ apiKey: null, history: [], message: 'hi', callTool: noTool })
  assert.deepEqual(res, { text: null, recommendation: null, error: 'no_key' })
})

test('a straight answer on the preferred model returns text and no error', async () => {
  const calls = stubFetch([textReply('The value is on Arsenal, champ.'), lockReply(false)])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'Arsenal?', callTool: noTool })
  assert.equal(res.text, 'The value is on Arsenal, champ.')
  assert.equal(res.error, null)
  assert.equal(calls[0].model, COACHGPT_MODELS[0]) // preferred model tried first
})

test('an unavailable preferred model falls back to the next model', async () => {
  const calls = stubFetch([errReply(404, 'not_found_error'), textReply('Falling back, still got you.'), lockReply(false)])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'hi', callTool: noTool })
  assert.equal(res.text, 'Falling back, still got you.')
  assert.equal(res.error, null)
  assert.equal(calls[0].model, COACHGPT_MODELS[0])
  assert.equal(calls[1].model, COACHGPT_MODELS[1]) // fell through to the fallback
})

test('a bad key does NOT cycle models - it stops and reports auth', async () => {
  const calls = stubFetch([errReply(401, 'authentication_error')])
  const res = await runCoachGptTurn({ apiKey: 'bad', history: [], message: 'hi', callTool: noTool })
  assert.equal(res.text, null)
  assert.equal(res.error, 'auth')
  assert.equal(calls.length, 1) // no wasteful fallback attempt on a bad key
})

test('every model unavailable surfaces a model error', async () => {
  stubFetch([errReply(404, 'not_found_error'), errReply(404, 'not_found_error')])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'hi', callTool: noTool })
  assert.equal(res.text, null)
  assert.equal(res.error, 'model')
})

test('a rate limit surfaces as rate_limit', async () => {
  stubFetch([errReply(429, 'rate_limit_error')])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'hi', callTool: noTool })
  assert.equal(res.error, 'rate_limit')
})

test('a tool_use round runs the tool then answers from the result', async () => {
  stubFetch([toolReply('find_fixture', { query: 'Arsenal' }), textReply('Lean is Arsenal at 2.1.'), lockReply(false)])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { found: true, matches: [] }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'Arsenal?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'find_fixture', input: { query: 'Arsenal' } })
  assert.equal(res.text, 'Lean is Arsenal at 2.1.')
  assert.equal(res.error, null)
})

test('exhausting the tool-round budget forces a final no-tools answer', async () => {
  // Two tool_use rounds (the MAX_TOOL_ROUNDS budget), then a forced call with
  // no tools must still produce a real reply rather than nothing.
  stubFetch([
    toolReply('find_fixture', { query: 'x' }),
    toolReply('find_fixture', { query: 'x' }),
    textReply('Here is the read even without a clean lookup.'),
    lockReply(false)
  ])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'best value this weekend?', callTool: noTool })
  assert.equal(res.text, 'Here is the read even without a clean lookup.')
  assert.equal(res.error, null)
})

test('a named pick is captured via the forced lock-in follow-up', async () => {
  stubFetch([textReply("I'd go with United here."), lockReply(true)])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'United?', callTool: noTool })
  assert.equal(res.recommendation?.hasPick, true)
})
