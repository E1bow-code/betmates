import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCoachRecord } from './coachRecord.js'

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
