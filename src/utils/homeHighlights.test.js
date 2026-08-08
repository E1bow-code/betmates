import test from 'node:test'
import assert from 'node:assert/strict'

// computeHomeHighlights pulls in moneyLeftOnTable, which reads recorded
// price history out of localStorage (via src/lib/oddsMemory.js) - stub it
// before anything runs, same approach as lineValue.test.js.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}

const { computeHomeHighlights } = await import('./homeHighlights.js')
const { historyKey } = await import('../lib/oddsMemory.js')

function seedHistory(entries) {
  const obj = {}
  for (const { eventId, marketKey, outcomeName, series } of entries) {
    obj[historyKey(eventId, marketKey, outcomeName)] = series
  }
  store.set('betmates:oddsHistory', JSON.stringify(obj))
}

test('computeHomeHighlights returns nothing for a fresh account', () => {
  assert.deepEqual(computeHomeHighlights([]), [])
})

test('computeHomeHighlights surfaces a discipline streak once it clears 3', () => {
  const entries = [
    { stake: 10, status: 'lost', settledAt: '2026-08-01T12:00:00Z' },
    { stake: 10, status: 'won', settledAt: '2026-08-02T12:00:00Z' },
    { stake: 10, status: 'won', settledAt: '2026-08-03T12:00:00Z' },
    { stake: 10, status: 'won', settledAt: '2026-08-04T12:00:00Z' }
  ]
  const highlights = computeHomeHighlights(entries)
  const discipline = highlights.find((h) => h.key === 'discipline')
  assert.ok(discipline)
  assert.equal(discipline.value, '4 bets without chasing a loss')
  assert.equal(discipline.to, '/tracker')
})

test('computeHomeHighlights surfaces betting style once there are 4+ decided bets', () => {
  // Each loss is immediately chased (stake more than doubles), so the
  // discipline streak stays at 0 and only betting style should show up.
  const entries = [
    { stake: 10, status: 'lost', potentialReturn: 0, settledAt: '2026-08-01T12:00:00Z' },
    { stake: 25, status: 'won', potentialReturn: 50, settledAt: '2026-08-02T12:00:00Z' },
    { stake: 10, status: 'lost', potentialReturn: 0, settledAt: '2026-08-03T12:00:00Z' },
    { stake: 25, status: 'won', potentialReturn: 40, settledAt: '2026-08-04T12:00:00Z' }
  ]
  const highlights = computeHomeHighlights(entries)
  assert.equal(highlights.find((h) => h.key === 'discipline'), undefined)
  const style = highlights.find((h) => h.key === 'volatility')
  assert.ok(style)
  assert.equal(style.to, '/insights')
})

test('computeHomeHighlights surfaces money left on the table once the sample clears 3', () => {
  seedHistory([
    { eventId: 'a', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] },
    { eventId: 'b', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 3.0 }] },
    { eventId: 'c', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] }
  ])
  const leg = (eventId) => ({ eventId, marketKey: 'h2h', outcomeName: 'Home', odds: 2.0 })
  const entries = [
    { status: 'won', stake: 10, settledAt: '2026-08-01T12:00:00Z', selections: [leg('a')] },
    { status: 'won', stake: 5, settledAt: '2026-08-02T12:00:00Z', selections: [leg('b')] },
    { status: 'won', stake: 10, settledAt: '2026-08-03T12:00:00Z', selections: [leg('c')] }
  ]
  const highlights = computeHomeHighlights(entries)
  const money = highlights.find((h) => h.key === 'moneyLeftOnTable')
  assert.ok(money)
  assert.equal(money.to, '/insights')
})

test('computeHomeHighlights surfaces the worst bad beat', () => {
  seedHistory([])
  const entries = [
    {
      id: '1',
      status: 'lost',
      stake: 10,
      potentialReturn: 80,
      settledAt: '2026-08-01T12:00:00Z',
      selections: [
        { event: 'A v B', selection: 'A', odds: 2 },
        { event: 'C v D', selection: 'C', odds: 2 },
        { event: 'E v F', selection: 'E', odds: 2 }
      ],
      outcomes: ['won', 'lost', 'won']
    }
  ]
  const highlights = computeHomeHighlights(entries)
  const badBeat = highlights.find((h) => h.key === 'badBeat')
  assert.ok(badBeat)
  assert.match(badBeat.value, /missed C/)
  assert.equal(badBeat.to, '/insights')
})

test('computeHomeHighlights caps at 3, dropping the bad beat first when everything qualifies', () => {
  seedHistory([
    { eventId: 'a', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] },
    { eventId: 'b', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 3.0 }] },
    { eventId: 'c', marketKey: 'h2h', outcomeName: 'Home', series: [{ t: 1, p: 2.4 }] }
  ])
  const leg = (eventId) => ({ eventId, marketKey: 'h2h', outcomeName: 'Home', odds: 2.0 })
  const entries = [
    // discipline: a loss, then 3 non-chased wins
    { stake: 10, status: 'lost', potentialReturn: 0, settledAt: '2026-07-01T12:00:00Z' },
    { stake: 10, status: 'won', potentialReturn: 20, settledAt: '2026-07-02T12:00:00Z' },
    { stake: 10, status: 'won', potentialReturn: 20, settledAt: '2026-07-03T12:00:00Z' },
    { stake: 10, status: 'won', potentialReturn: 20, settledAt: '2026-07-04T12:00:00Z' },
    // betting style: 4 more decided bets with varied profit
    { stake: 10, status: 'lost', potentialReturn: 0, settledAt: '2026-07-05T12:00:00Z' },
    { stake: 10, status: 'won', potentialReturn: 15, settledAt: '2026-07-06T12:00:00Z' },
    { stake: 10, status: 'lost', potentialReturn: 0, settledAt: '2026-07-07T12:00:00Z' },
    { stake: 10, status: 'won', potentialReturn: 25, settledAt: '2026-07-08T12:00:00Z' },
    // money left on the table: 3 wins that didn't beat the recorded line
    { status: 'won', stake: 10, settledAt: '2026-07-09T12:00:00Z', selections: [leg('a')] },
    { status: 'won', stake: 5, settledAt: '2026-07-10T12:00:00Z', selections: [leg('b')] },
    { status: 'won', stake: 10, settledAt: '2026-07-11T12:00:00Z', selections: [leg('c')] },
    // bad beat: a multi that lost by one leg
    {
      id: 'beat',
      status: 'lost',
      stake: 10,
      potentialReturn: 80,
      settledAt: '2026-07-12T12:00:00Z',
      selections: [
        { event: 'A v B', selection: 'A', odds: 2 },
        { event: 'C v D', selection: 'C', odds: 2 }
      ],
      outcomes: ['won', 'lost']
    }
  ]
  const highlights = computeHomeHighlights(entries)
  assert.equal(highlights.length, 3)
  assert.deepEqual(
    highlights.map((h) => h.key),
    ['discipline', 'volatility', 'moneyLeftOnTable']
  )
})
