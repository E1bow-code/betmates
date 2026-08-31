import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCoachGptTurn, COACHGPT_MODELS, COACHGPT_TOOLS, isTransientError } from './coachgpt.js'

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

test('a transient blip is retried once and recovers', async () => {
  // A single flaky 429 on the answer call must NOT fail the turn - the one
  // bounded retry inside callClaudeModel re-fires the same request and gets the
  // real reply, so the second fetch answers. (Answer attempt 1 = 429, answer
  // attempt 2 = text, then the lock-in classifier call.)
  const calls = stubFetch([errReply(429, 'rate_limit_error'), textReply('Recovered, still got you.'), lockReply(false)])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'hi', callTool: noTool })
  assert.equal(res.text, 'Recovered, still got you.')
  assert.equal(res.error, null)
  assert.equal(calls[0].model, COACHGPT_MODELS[0]) // same model, not a fallback
  assert.equal(calls[1].model, COACHGPT_MODELS[0])
})

test('isTransientError only flags retryable failures', () => {
  assert.equal(isTransientError({ status: 429 }), true) // rate limit
  assert.equal(isTransientError({ status: 503 }), true) // provider 5xx
  assert.equal(isTransientError({ status: 0 }), true) // network/socket drop
  assert.equal(isTransientError({ status: 401 }), false) // auth - fails identically
  assert.equal(isTransientError({ status: 404 }), false) // model availability - switch, don't retry
  assert.equal(isTransientError({ status: 400 }), false) // bad request
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

test('the lock-in classifier falls back to a second model if its own is unavailable', async () => {
  // Answer, then the primary lock-in model 404s, then the fallback classifies.
  // The pick must still be recorded, not silently dropped from the scoreboard.
  stubFetch([textReply("I'd go with United here."), errReply(404, 'not_found_error'), lockReply(true)])
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'United?', callTool: noTool })
  assert.equal(res.text, "I'd go with United here.")
  assert.equal(res.recommendation?.hasPick, true)
})

test('get_my_record is offered to the model as a tool', () => {
  const record = COACHGPT_TOOLS.find((t) => t.name === 'get_my_record')
  assert.ok(record, 'get_my_record should be in COACHGPT_TOOLS')
  // Optional sport filter, nothing required - a bare "how am I doing" must work.
  assert.deepEqual(record.input_schema.required ?? [], [])
})

test('a personal-record question runs get_my_record then answers from it', async () => {
  stubFetch([
    toolReply('get_my_record', { sport: 'football' }),
    textReply("You're 3-7 on football, champ - those overs are bleeding you dry."),
    lockReply(false)
  ])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { available: true, settledBets: 10, won: 3, lost: 7, hitRate: '30%', netProfit: -42.5 }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'how am I doing on football?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'get_my_record', input: { sport: 'football' } })
  assert.equal(res.text, "You're 3-7 on football, champ - those overs are bleeding you dry.")
  assert.equal(res.error, null)
})

test('get_team_form is offered to the model, requiring a team', () => {
  const tool = COACHGPT_TOOLS.find((t) => t.name === 'get_team_form')
  assert.ok(tool, 'get_team_form should be in COACHGPT_TOOLS')
  assert.deepEqual(tool.input_schema.required, ['team'])
})

test('a "how are they doing" question runs get_team_form then answers from it', async () => {
  stubFetch([
    toolReply('get_team_form', { team: 'Arsenal' }),
    textReply('Arsenal are flying - won 2 of their last 3, champ.'),
    lockReply(false)
  ])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { available: true, team: 'Arsenal', played: 3, won: 2, drawn: 0, lost: 1 }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'how are arsenal doing?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'get_team_form', input: { team: 'Arsenal' } })
  assert.equal(res.text, 'Arsenal are flying - won 2 of their last 3, champ.')
  assert.equal(res.error, null)
})

test('get_my_open_bets is offered to the model, requiring no input', () => {
  const tool = COACHGPT_TOOLS.find((t) => t.name === 'get_my_open_bets')
  assert.ok(tool, 'get_my_open_bets should be in COACHGPT_TOOLS')
  assert.deepEqual(tool.input_schema.required ?? [], [])
})

test('an "am I already on this" question runs get_my_open_bets then answers from it', async () => {
  stubFetch([
    toolReply('get_my_open_bets', {}),
    textReply("You're already on Arsenal at 2.1, champ - no need to double up."),
    lockReply(false)
  ])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { available: true, openCount: 1, totalStaked: 10, positions: [{ legs: 1, picks: ['Arsenal'], events: ['Arsenal vs Chelsea'], stake: 10, potentialReturn: 21 }] }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'am I already on Arsenal?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'get_my_open_bets', input: {} })
  assert.equal(res.text, "You're already on Arsenal at 2.1, champ - no need to double up.")
  assert.equal(res.error, null)
})

test('get_my_group_standings is offered to the model, requiring no input', () => {
  const tool = COACHGPT_TOOLS.find((t) => t.name === 'get_my_group_standings')
  assert.ok(tool, 'get_my_group_standings should be in COACHGPT_TOOLS')
  assert.deepEqual(tool.input_schema.required ?? [], [])
})

test('a "how am I doing in my group" question runs get_my_group_standings then answers from it', async () => {
  stubFetch([
    toolReply('get_my_group_standings', {}),
    textReply("2nd in The Lads, £15 behind Dave - one good weekend and you're top, champ."),
    lockReply(false)
  ])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { available: true, groups: [{ group: 'The Lads', rank: 2, ranked: 4, profit: 35, isLeading: false, leader: { name: 'Dave', profit: 50 }, nextUp: { name: 'Dave', behindBy: 15 } }] }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'how am I doing in my group?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'get_my_group_standings', input: {} })
  assert.equal(res.text, "2nd in The Lads, £15 behind Dave - one good weekend and you're top, champ.")
  assert.equal(res.error, null)
})

test('get_coach_record is offered to the model as a tool', () => {
  const record = COACHGPT_TOOLS.find((t) => t.name === 'get_coach_record')
  assert.ok(record, 'get_coach_record should be in COACHGPT_TOOLS')
  // Optional sport filter, nothing required - a bare "what's your record" must work.
  assert.deepEqual(record.input_schema.required ?? [], [])
})

test("a question about the coach's own tips runs get_coach_record then answers from it", async () => {
  stubFetch([
    toolReply('get_coach_record', {}),
    textReply("I'm 6-4 with you this season, +3.2 units - and I'll stand by every one."),
    lockReply(false)
  ])
  let toolCalledWith = null
  const callTool = async (name, input) => {
    toolCalledWith = { name, input }
    return { available: true, scope: 'all sports', settledPicks: 10, won: 6, lost: 4, void: 0, hitRate: '60%', unitsProfit: 3.2, roi: '32%' }
  }
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'how have your tips done?', callTool })
  assert.deepEqual(toolCalledWith, { name: 'get_coach_record', input: {} })
  assert.equal(res.text, "I'm 6-4 with you this season, +3.2 units - and I'll stand by every one.")
  assert.equal(res.error, null)
})

// ── matchRecommendation: recover the full priced leg from the classifier's bare
// identity fields, robustly (the model can't be trusted to echo the exact
// selection string it wrote in prose). ──────────────────────────────────────
import { matchRecommendation } from './coachgpt.js'

const FIXTURE_GROUNDING = [
  { eventId: 'e1', marketKey: 'h2h', selection: 'Manchester City', odds: 1.8, sport: 'football' },
  { eventId: 'e1', marketKey: 'h2h', selection: 'Draw', odds: 3.6, sport: 'football' },
  { eventId: 'e1', marketKey: 'h2h', selection: 'Arsenal', odds: 4.2, sport: 'football' }
]

test('matchRecommendation: exact selection name resolves the leg', () => {
  const leg = matchRecommendation({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Arsenal' }, FIXTURE_GROUNDING)
  assert.equal(leg?.odds, 4.2)
})

test('matchRecommendation: casing/spacing drift still resolves ("manchester  city")', () => {
  // Strict equality used to silently drop this correct pick over mechanical drift.
  const leg = matchRecommendation({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'manchester  city' }, FIXTURE_GROUNDING)
  assert.equal(leg?.selection, 'Manchester City')
})

test('matchRecommendation: a suffix ("Arsenal FC") still resolves "Arsenal"', () => {
  const leg = matchRecommendation({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Arsenal FC' }, FIXTURE_GROUNDING)
  assert.equal(leg?.odds, 4.2)
})

test('matchRecommendation: fuzzy match never crosses to a different event', () => {
  const other = [{ eventId: 'e2', marketKey: 'h2h', selection: 'Manchester City', odds: 2.0 }]
  const leg = matchRecommendation({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Man City' }, other)
  assert.equal(leg, null)
})

test('matchRecommendation: an ambiguous derby ("Manchester") resolves to null, not a mis-log', () => {
  const derby = [
    { eventId: 'd1', marketKey: 'h2h', selection: 'Manchester City', odds: 2.1 },
    { eventId: 'd1', marketKey: 'h2h', selection: 'Manchester United', odds: 3.3 }
  ]
  assert.equal(matchRecommendation({ eventId: 'd1', marketKey: 'h2h', outcomeName: 'Manchester' }, derby), null)
})

test('matchRecommendation: racing matches on opaque ids', () => {
  const racing = [{ raceId: 'r1', horseId: 'h1', selection: 'Some Horse', odds: 5 }]
  assert.equal(matchRecommendation({ raceId: 'r1', horseId: 'h1' }, racing)?.odds, 5)
  assert.equal(matchRecommendation({ raceId: 'r1', horseId: 'hX' }, racing), null)
})

test('matchRecommendation: null on no pick, empty grounding, or a missing event', () => {
  assert.equal(matchRecommendation(null, FIXTURE_GROUNDING), null)
  assert.equal(matchRecommendation({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Arsenal' }, []), null)
  assert.equal(matchRecommendation({ eventId: 'nope', marketKey: 'h2h', outcomeName: 'Arsenal' }, FIXTURE_GROUNDING), null)
})

// ── Nickname resolution: the lock-in classifier is shown the real grounded
// selections so it reconciles a prose nickname ("Spurs") against the canonical
// name ("Tottenham Hotspur"), instead of free-typing an unmatchable nickname. ──
import { formatLockInCandidates } from './coachgpt.js'

test('formatLockInCandidates: null when nothing is grounded', () => {
  assert.equal(formatLockInCandidates(null), null)
  assert.equal(formatLockInCandidates([]), null)
})

test('formatLockInCandidates: fixture legs carry selection + identity + price', () => {
  const out = formatLockInCandidates([
    { eventId: 'e1', marketKey: 'h2h', selection: 'Manchester City', odds: 1.8, event: 'Man City v Arsenal' }
  ])
  assert.ok(out.includes('selection="Manchester City"'))
  assert.ok(out.includes('eventId=e1'))
  assert.ok(out.includes('marketKey=h2h'))
})

test('formatLockInCandidates: racing legs use raceId/horseId', () => {
  const out = formatLockInCandidates([{ raceId: 'r1', horseId: 'h1', selection: 'Some Horse', odds: 5, event: 'Ascot - 3:15' }])
  assert.ok(out.includes('raceId=r1') && out.includes('horseId=h1'))
})

test('formatLockInCandidates: caps the list handed to the classifier', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ eventId: 'e' + i, marketKey: 'h2h', selection: 'Team ' + i }))
  assert.equal(formatLockInCandidates(many).split('\n').length, 40)
})

test('lock-in is shown the grounded selections so a nickname reply can be reconciled', async () => {
  const calls = stubFetch([textReply("I'm on Spurs here, champ."), lockReply(true)])
  const legs = [{ eventId: 'e9', marketKey: 'h2h', selection: 'Tottenham Hotspur', odds: 2.4, event: 'Tottenham Hotspur v Arsenal' }]
  const res = await runCoachGptTurn({ apiKey: 'k', history: [], message: 'Spurs?', callTool: noTool, getGrounding: () => legs })
  assert.equal(res.recommendation?.hasPick, true)
  const lockIn = calls[calls.length - 1]
  const last = lockIn.messages[lockIn.messages.length - 1]
  const content = typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
  assert.ok(content.includes('Tottenham Hotspur'), 'classifier should see the canonical selection')
  assert.ok(content.includes('eventId=e9'), 'classifier should see the identity fields to copy')
})

test('without getGrounding the lock-in prompt carries no candidate list (unchanged behaviour)', async () => {
  const calls = stubFetch([textReply('Leaning United.'), lockReply(true)])
  await runCoachGptTurn({ apiKey: 'k', history: [], message: 'United?', callTool: noTool })
  const lockIn = calls[calls.length - 1]
  const last = lockIn.messages[lockIn.messages.length - 1]
  const content = typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
  assert.ok(!content.includes('copy ITS identity fields'), 'no candidate block when grounding is not supplied')
})
