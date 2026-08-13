import test from 'node:test'
import assert from 'node:assert/strict'
import { trackerEntriesToCsv, groupSubscribersToCsv } from './csvExport.js'

function entry(over) {
  return {
    createdAt: '2026-01-05T12:00:00Z',
    sport: 'football',
    marketType: '1X2',
    selections: [{ event: 'Arsenal v Chelsea', market: '1X2', selection: 'Arsenal', odds: 2, bookmaker: 'Bet365' }],
    stake: 10,
    potentialReturn: 20,
    status: 'won',
    settledAt: '2026-01-06T12:00:00Z',
    ...over
  }
}

test('trackerEntriesToCsv includes a header row', () => {
  assert.equal(
    trackerEntriesToCsv([]),
    'Date,Sport,Market,Selections,Combined Odds,Stake,Potential Return,Status,Settled At'
  )
})

test('trackerEntriesToCsv formats a single-leg row', () => {
  // toLocaleString() can itself contain a comma (e.g. "05/01/2026,
  // 12:00:00"), so the date fields go through the same csvEscape() quoting
  // as anything else - asserted separately in the escaping test below,
  // rather than hard-coding whatever quoting this locale happens to need.
  const e = entry({})
  const [, row] = trackerEntriesToCsv([e]).split('\n')
  const expectedCreated = new Date(e.createdAt).toLocaleString()
  const expectedSettled = new Date(e.settledAt).toLocaleString()
  assert.ok(row.includes(expectedCreated))
  assert.ok(row.includes(expectedSettled))
  assert.ok(row.includes('football,1X2,Arsenal v Chelsea - 1X2: Arsenal @ 2.00 (Bet365),2.00,10,20,won,'))
})

test('trackerEntriesToCsv multiplies odds across every leg for combined odds', () => {
  const e = entry({
    selections: [
      { event: 'A', market: 'M', selection: 'X', odds: 2, bookmaker: 'Bet365' },
      { event: 'B', market: 'M', selection: 'Y', odds: 1.5, bookmaker: 'Bet365' }
    ]
  })
  const [, row] = trackerEntriesToCsv([e]).split('\n')
  assert.ok(row.includes(',3.00,')) // 2 * 1.5
})

test('trackerEntriesToCsv leaves stake/potentialReturn blank rather than 0 when unset', () => {
  // Substring rather than a positional split(',') - the date fields can
  // themselves contain commas once quoted, which would otherwise throw off
  // a naive column index.
  const e = entry({ stake: null, potentialReturn: null })
  const [, row] = trackerEntriesToCsv([e]).split('\n')
  assert.ok(row.includes(',2.00,,,won,'))
})

test('trackerEntriesToCsv leaves settledAt blank for an open bet', () => {
  const e = entry({ settledAt: null, status: 'open' })
  assert.ok(trackerEntriesToCsv([e]).endsWith(',open,'))
})

test('trackerEntriesToCsv quotes and escapes commas, quotes, and newlines', () => {
  const e = entry({
    selections: [{ event: 'Team "A", the champs\nround 2', market: 'M', selection: 'X', odds: 2, bookmaker: 'Bet365' }]
  })
  const csv = trackerEntriesToCsv([e])
  assert.ok(csv.includes('"Team ""A"", the champs\nround 2 - M: X @ 2.00 (Bet365)"'))
})

test('groupSubscribersToCsv includes a header row', () => {
  assert.equal(groupSubscribersToCsv([]), 'Name,Status,Subscribed since')
})

test('groupSubscribersToCsv formats a subscriber row', () => {
  const s = { displayName: 'Reece', status: 'active', since: '2026-01-05T12:00:00Z' }
  const [, row] = groupSubscribersToCsv([s]).split('\n')
  const expectedSince = new Date(s.since).toLocaleDateString()
  assert.equal(row, `Reece,active,${expectedSince}`)
})

test('groupSubscribersToCsv escapes a comma in a display name', () => {
  const s = { displayName: 'Smith, Jane', status: 'trialing', since: '2026-01-05T12:00:00Z' }
  const [, row] = groupSubscribersToCsv([s]).split('\n')
  assert.ok(row.startsWith('"Smith, Jane",trialing,'))
})
