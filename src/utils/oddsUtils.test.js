import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestWithinFilter } from './oddsUtils.js'

const odds = [
  { bookmaker: 'skybet', decimal: 2.1 },
  { bookmaker: 'bet365', decimal: 2.5 },
  { bookmaker: 'paddy', decimal: 2.3 }
]

test('with no filter, returns the highest decimal across all books', () => {
  assert.equal(bestWithinFilter(odds, null).bookmaker, 'bet365')
  assert.equal(bestWithinFilter(odds, []).bookmaker, 'bet365') // empty filter == no filter
})

test('with a filter, returns the best price within just those books', () => {
  assert.equal(bestWithinFilter(odds, ['skybet', 'paddy']).bookmaker, 'paddy') // 2.3 beats 2.1
  assert.equal(bestWithinFilter(odds, ['skybet']).bookmaker, 'skybet') // the only one in the pool
})

test('returns null when the filter matches no available book, or there are no odds', () => {
  assert.equal(bestWithinFilter(odds, ['williamhill']), null)
  assert.equal(bestWithinFilter([], null), null)
})
