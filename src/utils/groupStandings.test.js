import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseGroupStanding, summariseGroupStandings } from './groupStandings.js'

// Shape mirrors computeGroupLeaderboard's output: sorted by profit desc, 1-based rank.
const rows = [
  { userId: 'a', name: 'Dave', profit: 50, rank: 1 },
  { userId: 'b', name: 'You', profit: 35, rank: 2 },
  { userId: 'c', name: 'Sam', profit: 10, rank: 3 }
]

test('mid-table standing reports leader gap and the person directly ahead', () => {
  const out = summariseGroupStanding(rows, 'b', { name: 'The Lads', memberCount: 4 })
  assert.equal(out.group, 'The Lads')
  assert.equal(out.memberCount, 4)
  assert.equal(out.ranked, 3)
  assert.equal(out.rank, 2)
  assert.equal(out.isLeading, false)
  assert.equal(out.profit, 35)
  assert.equal(out.gapToLeader, 15)
  assert.deepEqual(out.leader, { name: 'Dave', profit: 50 })
  assert.deepEqual(out.nextUp, { name: 'Dave', behindBy: 15 })
})

test('the leader gets no leader block and no one to chase', () => {
  const out = summariseGroupStanding(rows, 'a', { name: 'The Lads' })
  assert.equal(out.isLeading, true)
  assert.equal(out.gapToLeader, 0)
  assert.equal(out.leader, null)
  assert.equal(out.nextUp, null)
})

test('nextUp is the immediate rank above, not the overall leader, from 3rd', () => {
  const out = summariseGroupStanding(rows, 'c')
  assert.equal(out.rank, 3)
  assert.deepEqual(out.leader, { name: 'Dave', profit: 50 })
  assert.deepEqual(out.nextUp, { name: 'You', behindBy: 25 })
})

test('a user not ranked in the group yields null', () => {
  assert.equal(summariseGroupStanding(rows, 'zzz', { name: 'x' }), null)
  assert.equal(summariseGroupStanding([], 'b'), null)
})

test('money figures round to 2dp', () => {
  const messy = [
    { userId: 'a', name: 'Dave', profit: 50.255, rank: 1 },
    { userId: 'b', name: 'You', profit: 35.004, rank: 2 }
  ]
  const out = summariseGroupStanding(messy, 'b')
  assert.equal(out.profit, 35)
  assert.equal(out.gapToLeader, 15.25) // 50.255 - 35.004 = 15.251 -> 15.25
})

test('summariseGroupStandings collects ranked groups and drops the rest', () => {
  const out = summariseGroupStandings([
    { name: 'The Lads', memberCount: 4, userId: 'b', rows },
    { name: 'Empty', memberCount: 2, userId: 'b', rows: [] }
  ])
  assert.equal(out.available, true)
  assert.equal(out.groups.length, 1)
  assert.equal(out.groups[0].group, 'The Lads')
})

test('summariseGroupStandings reports unavailable when nothing is ranked', () => {
  const out = summariseGroupStandings([{ name: 'Empty', userId: 'b', rows: [] }])
  assert.equal(out.available, false)
  assert.match(out.reason, /no settled/)
})
