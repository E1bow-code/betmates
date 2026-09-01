import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyPost } from './socialDraft.js'

test('leads with the leaderboard angle when a top member is given', () => {
  const post = buildDailyPost({ topMember: { name: 'Dex', profit: 42.5 } })
  assert.match(post, /Dex is topping the leaderboard \(\+£42\.5\)/)
  assert.match(post, /#BetMates$/)
})

test('formats a negative profit with a minus and 2dp', () => {
  const post = buildDailyPost({ topMember: { name: 'Mira', profit: -7.1 } })
  assert.match(post, /\(-£7\.1\)/)
})

test('omits the profit when it is not a number', () => {
  const post = buildDailyPost({ topMember: { name: 'Nova' } })
  assert.match(post, /Nova is topping the leaderboard\. Can/)
})

test('uses the match angle when no leaderboard leader', () => {
  const post = buildDailyPost({ nextMatch: { home: 'SPU', away: 'MUN' } })
  assert.match(post, /SPU v MUN coming up/)
})

test('uses the CoachGPT angle when only a record is given', () => {
  const post = buildDailyPost({ coachRecord: { w: 41, l: 29 } })
  assert.match(post, /CoachGPT is 41-29/)
})

test('falls back to a community line with nothing to report', () => {
  const post = buildDailyPost({})
  assert.match(post, /tracking their bets/)
  assert.match(post, /#BetMates$/)
})

test('pluralises the group count in the fallback', () => {
  assert.match(buildDailyPost({ groupCount: 1 }), /1 group is/)
  assert.match(buildDailyPost({ groupCount: 5 }), /5 groups are/)
})

test('always returns a non-empty post within the X 280-char limit', () => {
  for (const data of [{}, { topMember: { name: 'X'.repeat(400) } }, { nextMatch: { home: 'A', away: 'B' } }]) {
    const post = buildDailyPost(data)
    assert.ok(post.length > 0)
    assert.ok(post.length <= 280, `length ${post.length} should be <= 280`)
  }
})
