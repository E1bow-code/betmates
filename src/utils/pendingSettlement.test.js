import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingSettlement } from './pendingSettlement.js'

const NOW = new Date('2026-08-28T20:00:00Z').getTime()
const hoursAgo = (h) => new Date(NOW - h * 60 * 60 * 1000).toISOString()
const hoursAhead = (h) => new Date(NOW + h * 60 * 60 * 1000).toISOString()

const leg = (kickoff) => ({ event: 'e', market: 'm', selection: 's', odds: 2, kickoff })

test('pendingSettlement flags an open bet whose event finished (kickoff > 4h ago)', () => {
  const entries = [{ id: '1', status: 'open', selections: [leg(hoursAgo(5))] }]
  assert.deepEqual(pendingSettlement(entries, NOW).map((e) => e.id), ['1'])
})

test('pendingSettlement ignores a bet that has not started or is mid-event', () => {
  const entries = [
    { id: 'future', status: 'open', selections: [leg(hoursAhead(2))] },
    { id: 'live', status: 'open', selections: [leg(hoursAgo(1))] } // within the 4h buffer
  ]
  assert.deepEqual(pendingSettlement(entries, NOW), [])
})

test('pendingSettlement uses the LATEST leg of a multi', () => {
  const entries = [
    // one leg long finished, but another only kicked off 1h ago -> not ready
    { id: 'multi', status: 'open', selections: [leg(hoursAgo(6)), leg(hoursAgo(1))] }
  ]
  assert.deepEqual(pendingSettlement(entries, NOW), [])
})

test('pendingSettlement skips bets with any leg missing a kickoff (never guesses)', () => {
  const entries = [{ id: 'manual', status: 'open', selections: [leg(hoursAgo(6)), { event: 'e', selection: 's', odds: 2 }] }]
  assert.deepEqual(pendingSettlement(entries, NOW), [])
})

test('pendingSettlement only considers open bets', () => {
  const entries = [
    { id: 'won', status: 'won', selections: [leg(hoursAgo(6))] },
    { id: 'open', status: 'open', selections: [leg(hoursAgo(6))] }
  ]
  assert.deepEqual(pendingSettlement(entries, NOW).map((e) => e.id), ['open'])
})
