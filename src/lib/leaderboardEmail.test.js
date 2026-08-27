import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLeaderboardDigest, money, escapeHtml } from './leaderboardEmail.js'

test('money formats a signed 2dp pound value', () => {
  assert.equal(money(12.5), '£12.50')
  assert.equal(money(-5), '-£5.00')
  assert.equal(money(0), '£0.00')
  assert.equal(money(3.005), '£3.01') // rounds to 2dp
})

test('escapeHtml neutralises angle brackets and quotes', () => {
  assert.equal(escapeHtml('<b>A & "B"</b>'), '&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;')
})

const rows = [
  { userId: 'u1', name: 'Sam', rank: 1, profit: 42.5, settledCount: 6, winRate: 0.5, isRecipient: true },
  { userId: 'u2', name: 'Alex', rank: 2, profit: -10, settledCount: 3, winRate: 0.33, isRecipient: false }
]

test('buildLeaderboardDigest returns null when no group has any rows', () => {
  assert.equal(buildLeaderboardDigest({ recipientName: 'Sam', groups: [] }), null)
  assert.equal(buildLeaderboardDigest({ recipientName: 'Sam', groups: [{ name: 'The Lads', rows: [] }] }), null)
})

test('buildLeaderboardDigest renders one group with the recipient flagged', () => {
  const out = buildLeaderboardDigest({ recipientName: 'Sam', weekLabel: '18 – 24 Aug', groups: [{ name: 'The Lads', rows }] })
  assert.ok(out)
  assert.equal(out.subject, "The Lads — this week's leaderboard")
  assert.match(out.html, /The Lads/)
  assert.match(out.html, /Sam/)
  assert.match(out.html, /\(you\)/) // recipient marked
  assert.match(out.html, /Alex/)
  assert.match(out.html, /£42\.50/) // leader profit shown
  assert.match(out.html, /Week of 18 – 24 Aug/)
})

test('buildLeaderboardDigest subject reflects multiple groups', () => {
  const out = buildLeaderboardDigest({
    recipientName: 'Sam',
    groups: [
      { name: 'The Lads', rows },
      { name: 'Work Crew', rows: [{ userId: 'u1', name: 'Sam', rank: 1, profit: 5, settledCount: 1, winRate: 1, isRecipient: true }] }
    ]
  })
  assert.equal(out.subject, 'Your 2 BetMates leaderboards this week')
  assert.match(out.html, /The Lads/)
  assert.match(out.html, /Work Crew/)
})

test('buildLeaderboardDigest skips groups with no activity but keeps active ones', () => {
  const out = buildLeaderboardDigest({
    recipientName: 'Sam',
    groups: [
      { name: 'Dead Group', rows: [] },
      { name: 'The Lads', rows }
    ]
  })
  assert.equal(out.subject, "The Lads — this week's leaderboard") // treated as single active group
  assert.doesNotMatch(out.html, /Dead Group/)
})
