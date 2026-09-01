import { test } from 'node:test'
import assert from 'node:assert/strict'
import { biggestSharpMove } from './marketSteam.js'

// A shortening series (price dropping ~17%) for one outcome, plus a smaller
// drift for another - biggestSharpMove should return the bigger move.
function series(fixture, selection, prices, bookmaker = 'bet365', market = 'h2h') {
  return prices.map((odds, i) => ({
    fixture_id: fixture,
    market,
    selection,
    bookmaker,
    odds,
    fetched_at: new Date(Date.UTC(2026, 0, 1, i)).toISOString()
  }))
}

test('picks the biggest qualifying sharp move across outcomes', () => {
  const rows = [
    ...series('f1', 'Arsenal', [2.5, 2.3, 2.08]),   // ~-17% shortening
    ...series('f2', 'Draw', [3.0, 3.15, 3.3])        // ~+10% drifting
  ]
  const move = biggestSharpMove(rows)
  assert.equal(move.fixtureId, 'f1')
  assert.equal(move.selection, 'Arsenal')
  assert.equal(move.direction, 'shortening')
  assert.ok(move.pct >= 15)
})

test('returns null when no series clears the sharp-money bar', () => {
  const rows = series('f1', 'Arsenal', [2.5, 2.49, 2.5]) // noise, under 8%
  assert.equal(biggestSharpMove(rows), null)
})

test('keeps bookmakers separate (does not merge series)', () => {
  const rows = [
    ...series('f1', 'Arsenal', [2.5, 2.5], 'bet365'),      // 2 points, no move
    ...series('f1', 'Arsenal', [2.5, 2.3, 2.05], 'willhill') // real shortening
  ]
  const move = biggestSharpMove(rows)
  assert.ok(move)
  assert.equal(move.bookmaker, 'willhill')
})

test('ignores malformed rows and empty input without throwing', () => {
  assert.equal(biggestSharpMove(undefined), null)
  assert.equal(biggestSharpMove([]), null)
  assert.equal(biggestSharpMove([{ fixture_id: 'f', selection: 'x', odds: 'nope', fetched_at: 'z' }]), null)
})
