import test from 'node:test'
import assert from 'node:assert/strict'
import { calibrateCrowdWisdom, tallyVotes } from './crowdWisdom.js'

test('tallyVotes counts vote-key reactions and ignores non-vote emoji', () => {
  const reactions = [
    { emoji: 'lock_in' },
    { emoji: 'lock_in' },
    { emoji: 'not_sure' },
    { emoji: '🔥' } // group-post emoji reaction, not a vote key
  ]
  assert.deepEqual(tallyVotes(reactions), { lock_in: 2, not_sure: 1, not_happening: 0 })
})

test('tallyVotes is safe on empty/missing input', () => {
  assert.deepEqual(tallyVotes([]), { lock_in: 0, not_sure: 0, not_happening: 0 })
  assert.deepEqual(tallyVotes(null), { lock_in: 0, not_sure: 0, not_happening: 0 })
})

function post(status, votes) {
  return { status, votes }
}

test('calibrateCrowdWisdom buckets by the dominant vote and reports win rate', () => {
  const posts = [
    post('won', { lock_in: 5, not_sure: 1, not_happening: 0 }),
    post('won', { lock_in: 4, not_sure: 0, not_happening: 0 }),
    post('lost', { lock_in: 3, not_sure: 1, not_happening: 0 }),
    post('lost', { lock_in: 0, not_sure: 0, not_happening: 4 }),
    post('lost', { lock_in: 0, not_sure: 0, not_happening: 3 }),
    post('won', { lock_in: 0, not_sure: 0, not_happening: 2 })
  ]
  const result = calibrateCrowdWisdom(posts)
  const lockIn = result.find((r) => r.key === 'lock_in')
  const notHappening = result.find((r) => r.key === 'not_happening')
  assert.deepEqual(lockIn, { key: 'lock_in', winRate: 67, sample: 3 })
  assert.deepEqual(notHappening, { key: 'not_happening', winRate: 33, sample: 3 })
})

test('calibrateCrowdWisdom excludes ties and posts nobody voted on', () => {
  const posts = [
    post('won', { lock_in: 2, not_sure: 2, not_happening: 0 }), // tie - excluded
    post('won', { lock_in: 0, not_sure: 0, not_happening: 0 }) // nobody voted - excluded
  ]
  assert.deepEqual(calibrateCrowdWisdom(posts), [])
})

test('calibrateCrowdWisdom excludes open/void posts and needs a minimum sample', () => {
  const posts = [
    post('open', { lock_in: 5 }),
    post('void', { lock_in: 5 }),
    post('won', { lock_in: 3 }),
    post('won', { lock_in: 2 })
  ]
  assert.deepEqual(calibrateCrowdWisdom(posts), [])
})

test('calibrateCrowdWisdom is safe on empty/missing input', () => {
  assert.deepEqual(calibrateCrowdWisdom([]), [])
  assert.deepEqual(calibrateCrowdWisdom(null), [])
})
