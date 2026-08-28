import test from 'node:test'
import assert from 'node:assert/strict'
import { countByStatus, filterByStatus, trackerFilterLabel, TRACKER_FILTERS } from './trackerFilters.js'

const entries = [
  { id: 1, status: 'open' },
  { id: 2, status: 'won' },
  { id: 3, status: 'won' },
  { id: 4, status: 'lost' },
  { id: 5, status: 'void' }
]

test('countByStatus tallies all and each status', () => {
  assert.deepEqual(countByStatus(entries), { all: 5, open: 1, won: 2, lost: 1, void: 1 })
})

test('countByStatus handles null/empty and ignores junk rows', () => {
  assert.deepEqual(countByStatus(null), { all: 0, open: 0, won: 0, lost: 0, void: 0 })
  assert.deepEqual(countByStatus([null, { status: 'weird' }]).all, 2)
  assert.equal(countByStatus([{ status: 'weird' }]).won, 0)
})

test('filterByStatus returns only the matching status', () => {
  assert.deepEqual(filterByStatus(entries, 'won').map((e) => e.id), [2, 3])
  assert.deepEqual(filterByStatus(entries, 'open').map((e) => e.id), [1])
  assert.deepEqual(filterByStatus(entries, 'void').map((e) => e.id), [5])
})

test('filterByStatus passes everything through for all / unknown keys', () => {
  assert.equal(filterByStatus(entries, 'all').length, 5)
  assert.equal(filterByStatus(entries, 'bogus').length, 5) // never blanks the list
  assert.equal(filterByStatus(null, 'won').length, 0)
})

test('labels and filter set are stable', () => {
  assert.deepEqual(TRACKER_FILTERS, ['all', 'open', 'won', 'lost', 'void'])
  assert.equal(trackerFilterLabel('won'), 'Won')
  assert.equal(trackerFilterLabel('all'), 'All')
})
