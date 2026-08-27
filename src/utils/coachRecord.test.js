import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCoachRecord, summariseCoachRecord } from './coachRecord.js'

const message = (over) => ({ role: 'assistant', body: 'lean', recommendation: { odds: 2.5 }, result: 'won', ...over })

test('computeCoachRecord returns null with no settled recommendations', () => {
  assert.equal(computeCoachRecord([]), null)
  assert.equal(computeCoachRecord([message({ recommendation: null, result: null })]), null)
})

test('computeCoachRecord ignores messages without a recommendation, even if settled somehow', () => {
  const messages = [message({ recommendation: null, result: null }), message({ result: 'won' })]
  const record = computeCoachRecord(messages)
  assert.equal(record.decidedCount, 1)
})

test('computeCoachRecord ignores an unsettled (result: null) recommendation', () => {
  const messages = [message({ result: null }), message({ result: 'won' })]
  const record = computeCoachRecord(messages)
  assert.equal(record.settledCount, 1)
})

test('computeCoachRecord scores wins/losses at a notional 1-unit stake', () => {
  const messages = [
    message({ recommendation: { odds: 3 }, result: 'won' }),
    message({ recommendation: { odds: 2 }, result: 'lost' })
  ]
  const record = computeCoachRecord(messages)
  assert.equal(record.winRate, 50)
  // +2 profit on the win (3 - 1 stake), -1 on the loss -> net +1
  assert.equal(record.profit, 1)
})

test('computeCoachRecord treats void recommendations as settled but not decided', () => {
  const messages = [message({ result: 'void' })]
  const record = computeCoachRecord(messages)
  assert.equal(record.settledCount, 1)
  assert.equal(record.decidedCount, 0)
  assert.equal(record.winRate, null)
})

test('summariseCoachRecord reports unavailable when nothing has settled', () => {
  assert.deepEqual(summariseCoachRecord([]), { available: false, reason: 'no settled picks yet' })
  assert.deepEqual(summariseCoachRecord([message({ result: null })]), { available: false, reason: 'no settled picks yet' })
  // A scope carries into the reason so the model can say "no football picks yet".
  assert.deepEqual(summariseCoachRecord([], 'football'), { available: false, reason: 'no settled football picks yet' })
})

test('summariseCoachRecord matches the scoreboard maths and splits by sport', () => {
  const messages = [
    message({ recommendation: { odds: 3, sport: 'football' }, result: 'won' }), // +2 units
    message({ recommendation: { odds: 2, sport: 'football' }, result: 'lost' }), // -1 unit
    message({ recommendation: { odds: 4, sport: 'ufc' }, result: 'won' }), // +3 units
    message({ recommendation: { odds: 2, sport: 'ufc' }, result: 'void' }) // wash
  ]
  const out = summariseCoachRecord(messages)
  assert.equal(out.available, true)
  assert.equal(out.settledPicks, 4)
  assert.equal(out.won, 2)
  assert.equal(out.lost, 1)
  assert.equal(out.void, 1)
  assert.equal(out.hitRate, '67%') // 2 of 3 decided
  assert.equal(out.unitsProfit, 4) // +2 -1 +3 +0
  // Overall figure agrees with the scoreboard's own computeCoachRecord.
  assert.equal(out.unitsProfit, Math.round(computeCoachRecord(messages).profit * 100) / 100)
  const football = out.bySport.find((s) => s.name === 'football')
  assert.deepEqual(football, { name: 'football', picks: 2, won: 1, units: 1 })
  const ufc = out.bySport.find((s) => s.name === 'ufc')
  assert.deepEqual(ufc, { name: 'ufc', picks: 2, won: 1, units: 3 })
})

test('summariseCoachRecord flags a small sample as an early read', () => {
  const out = summariseCoachRecord([message({ result: 'won' })])
  assert.match(out.note, /early read/)
})
