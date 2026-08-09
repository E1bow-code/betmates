import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSameGameCorrelation } from './sameGameCorrelation.js'

const leg = (over) => ({ event: 'Arsenal v Chelsea', eventId: 'fx1', market: '1X2', selection: 'Arsenal', odds: 2, ...over })

test('detectSameGameCorrelation flags two legs sharing an eventId', () => {
  const result = detectSameGameCorrelation([leg({ market: '1X2', selection: 'Arsenal' }), leg({ market: 'BTTS', selection: 'Yes' })])
  assert.equal(result.legCount, 2)
  assert.equal(result.events[0].event, 'Arsenal v Chelsea')
  assert.equal(result.events[0].legCount, 2)
})

test('detectSameGameCorrelation ignores legs from genuinely different events', () => {
  const result = detectSameGameCorrelation([leg({ eventId: 'fx1' }), leg({ eventId: 'fx2', event: 'Man City v Liverpool' })])
  assert.equal(result, null)
})

test('detectSameGameCorrelation falls back to the event string when eventId is missing (e.g. racing)', () => {
  const runner = (over) => ({ event: 'Ascot 3:15', market: 'Win', selection: 'Horse', odds: 5, ...over })
  const result = detectSameGameCorrelation([runner({ selection: 'Horse A' }), runner({ selection: 'Horse B' })])
  assert.equal(result.legCount, 2)
})

test('detectSameGameCorrelation returns null for a single leg or empty input', () => {
  assert.equal(detectSameGameCorrelation([leg()]), null)
  assert.equal(detectSameGameCorrelation([]), null)
  assert.equal(detectSameGameCorrelation(null), null)
})

test('detectSameGameCorrelation only reports the correlated group when mixed with independent legs', () => {
  const result = detectSameGameCorrelation([
    leg({ eventId: 'fx1', market: '1X2' }),
    leg({ eventId: 'fx1', market: 'BTTS' }),
    leg({ eventId: 'fx2', event: 'Man City v Liverpool', market: '1X2' })
  ])
  assert.equal(result.events.length, 1)
  assert.equal(result.legCount, 2)
})
