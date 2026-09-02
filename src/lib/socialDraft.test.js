import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyPost, composeSubjectPost, POST_SPORTS, POST_SUBJECTS } from './socialDraft.js'

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

test('composeSubjectPost names the chosen sport and always hashtags', () => {
  const post = composeSubjectPost({ sport: 'ufc', subject: 'hype' })
  assert.match(post, /UFC/)
  assert.match(post, /#BetMates$/)
})

test('composeSubjectPost coach angle uses the record when given, degrades without it', () => {
  assert.match(composeSubjectPost({ sport: 'football', subject: 'coach', coachRecord: { w: 3, l: 1 } }), /CoachGPT is 3-1/)
  assert.match(composeSubjectPost({ sport: 'football', subject: 'coach' }), /CoachGPT is calling/)
})

test('composeSubjectPost community angle pluralises the group count', () => {
  assert.match(composeSubjectPost({ sport: 'racing', subject: 'community', groupCount: 1 }), /1 group is/)
  assert.match(composeSubjectPost({ sport: 'racing', subject: 'community', groupCount: 4 }), /4 groups are/)
})

test('composeSubjectPost stays within 280 chars for every sport/subject pair', () => {
  for (const s of POST_SPORTS) {
    for (const sub of POST_SUBJECTS) {
      const post = composeSubjectPost({ sport: s.key, subject: sub.key, coachRecord: { w: 999, l: 999 }, groupCount: 100000 })
      assert.ok(post.length > 0 && post.length <= 280, `${s.key}/${sub.key} length ${post.length}`)
    }
  }
})

test('composeSubjectPost falls back to football + hype for unknown keys', () => {
  const post = composeSubjectPost({ sport: 'zzz', subject: 'zzz' })
  assert.match(post, /Football/)
  assert.match(post, /#BetMates$/)
})
