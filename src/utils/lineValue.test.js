import test from 'node:test'
import assert from 'node:assert/strict'

// lineValue reads recorded price history out of localStorage (via
// src/lib/oddsMemory.js). node has no localStorage, so stand up a tiny stub
// before importing the module under test and seed it per-case.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}

const { legLineValue, betLineValue, beatTheLineRate, moneyLeftOnTable } = await import('./lineValue.js')
const { historyKey } = await import('../lib/oddsMemory.js')

const HISTORY_KEY = 'betmates:oddsHistory'

// Seed a recorded price series for one outcome; the last point is the "line".
function seedHistory(entries) {
  const obj = {}
  for (const { eventId, marketKey, outcomeName, series } of entries) {
    obj[historyKey(eventId, marketKey, outcomeName)] = series
  }
  store.set(HISTORY_KEY, JSON.stringify(obj))
}

const leg = (over) => ({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Home', odds: 2.0, ...over })

test('legLineValue reports beating the line when you took a bigger price', () => {
  seedHistory([{ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.0 }, { t: 2, p: 1.8 }] }])
  const value = legLineValue(leg({ odds: 2.0 })) // took 2.0, line drifted to 1.8
  assert.equal(value.bet, 2.0)
  assert.equal(value.line, 1.8)
  assert.equal(value.beat, true)
  assert.ok(Math.abs(value.deltaPct - 11.111) < 1e-2)
})

test('legLineValue reports NOT beating the line when the price drifted out', () => {
  seedHistory([{ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.0 }, { t: 2, p: 2.4 }] }])
  const value = legLineValue(leg({ odds: 2.0 }))
  assert.equal(value.beat, false)
  assert.ok(value.deltaPct < 0)
})

test('legLineValue is null without identity keys or without a recorded line', () => {
  seedHistory([])
  assert.equal(legLineValue({ odds: 2.0 }), null) // no eventId/marketKey/outcomeName
  assert.equal(legLineValue(leg({ odds: 2.0 })), null) // keys present but nothing recorded
})

test('betLineValue only scores single-leg bets', () => {
  seedHistory([{ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 1.8 }] }])
  assert.ok(betLineValue({ selections: [leg({ odds: 2.0 })] }).beat) // single leg -> scored
  assert.equal(betLineValue({ selections: [leg(), leg()] }), null) // accumulator -> not scored
  assert.equal(betLineValue({ selections: [] }), null)
})

test('beatTheLineRate needs a minimum sample and reports the hit rate', () => {
  seedHistory([
    { eventId: 'a', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 1.8 }] }, // beat (took 2.0)
    { eventId: 'b', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 1.9 }] }, // beat
    { eventId: 'c', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] } // did not beat
  ])
  const entries = [
    { selections: [leg({ eventId: 'a', odds: 2.0 })] },
    { selections: [leg({ eventId: 'b', odds: 2.0 })] },
    { selections: [leg({ eventId: 'c', odds: 2.0 })] }
  ]
  assert.deepEqual(beatTheLineRate(entries), { rate: 67, sample: 3 })
  // Below the minimum sample, a couple of data points aren't a track record.
  assert.equal(beatTheLineRate(entries.slice(0, 2)), null)
})

test('moneyLeftOnTable sums extra return only on wins that took a worse price than the line', () => {
  seedHistory([
    { eventId: 'a', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] }, // took 2.0, line 2.4 -> £10 * (2.4-2.0) = £4 left
    { eventId: 'b', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 3.0 }] }, // took 2.0, line 3.0 -> £5 * (3.0-2.0) = £5 left
    { eventId: 'c', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 1.8 }] } // took 2.0, beat the line -> excluded
  ])
  const entries = [
    { status: 'won', stake: 10, selections: [leg({ eventId: 'a', odds: 2.0 })] },
    { status: 'won', stake: 5, selections: [leg({ eventId: 'b', odds: 2.0 })] },
    { status: 'won', stake: 20, selections: [leg({ eventId: 'c', odds: 2.0 })] }
  ]
  assert.deepEqual(moneyLeftOnTable(entries, 2), { total: 9, sample: 2 })
})

test('moneyLeftOnTable ignores losses and needs a minimum sample', () => {
  seedHistory([{ eventId: 'a', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] }])
  const entries = [
    { status: 'lost', stake: 10, selections: [leg({ eventId: 'a', odds: 2.0 })] },
    { status: 'won', stake: 10, selections: [leg({ eventId: 'a', odds: 2.0 })] }
  ]
  assert.equal(moneyLeftOnTable(entries, 3), null)
})
