import test from 'node:test'
import assert from 'node:assert/strict'
import { leaderboardGap } from './leaderboardGap.js'

const rows = [
  { userId: 'a', name: 'Ace', profit: 100, rank: 1 },
  { userId: 'b', name: 'Bee', profit: 60, rank: 2 },
  { userId: 'c', name: 'Cee', profit: 60, rank: 3 }
]

test('leaderboardGap tells a chaser how far behind the next mate up they are', () => {
  assert.deepEqual(leaderboardGap(rows, 'b'), { type: 'behind', name: 'Ace', gap: 40 })
})

test('leaderboardGap reports a level gap of 0 for a tie with the mate above', () => {
  assert.deepEqual(leaderboardGap(rows, 'c'), { type: 'behind', name: 'Bee', gap: 0 })
})

test('leaderboardGap gives the leader their lead over the nearest chaser', () => {
  assert.deepEqual(leaderboardGap(rows, 'a'), { type: 'leading', name: 'Bee', gap: 40 })
})

test('leaderboardGap returns type alone for the only member on the board', () => {
  assert.deepEqual(leaderboardGap([{ userId: 'a', name: 'Ace', profit: 10, rank: 1 }], 'a'), { type: 'alone' })
})

test('leaderboardGap returns null when the user is not on the board', () => {
  assert.equal(leaderboardGap(rows, 'z'), null)
  assert.equal(leaderboardGap([], 'a'), null)
})

test('leaderboardGap rounds away float subtraction noise', () => {
  const noisy = [
    { userId: 'a', name: 'Ace', profit: 10.1, rank: 1 },
    { userId: 'b', name: 'Bee', profit: 10, rank: 2 }
  ]
  assert.equal(leaderboardGap(noisy, 'b').gap, 0.1) // not 0.09999999999999964
})
