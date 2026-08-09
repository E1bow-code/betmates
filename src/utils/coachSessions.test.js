import test from 'node:test'
import assert from 'node:assert/strict'
import { groupCoachSessions } from './coachSessions.js'

test('groupCoachSessions groups messages by sessionId and titles from the first user message', () => {
  const result = groupCoachSessions([
    { id: '1', sessionId: 'a', role: 'user', body: 'What’s the value bet for Arsenal?', createdAt: '2026-08-01T10:00:00Z' },
    { id: '2', sessionId: 'a', role: 'assistant', body: 'Arsenal at 2.10 looks fair.', createdAt: '2026-08-01T10:00:05Z' },
    { id: '3', sessionId: 'b', role: 'user', body: 'Tell me about Haaland', createdAt: '2026-08-02T09:00:00Z' }
  ])
  assert.equal(result.length, 2)
  assert.equal(result[0].sessionId, 'b')
  assert.equal(result[0].title, 'Tell me about Haaland')
  assert.equal(result[0].messageCount, 1)
  assert.equal(result[1].sessionId, 'a')
  assert.equal(result[1].title, 'What’s the value bet for Arsenal?')
  assert.equal(result[1].messageCount, 2)
  assert.equal(result[1].startedAt, '2026-08-01T10:00:00Z')
  assert.equal(result[1].lastMessageAt, '2026-08-01T10:00:05Z')
})

test('groupCoachSessions truncates a long title and sorts by most recent activity', () => {
  const longBody = 'a'.repeat(80)
  const result = groupCoachSessions([
    { id: '1', sessionId: 'old', role: 'user', body: 'first', createdAt: '2026-08-01T10:00:00Z' },
    { id: '2', sessionId: 'new', role: 'user', body: longBody, createdAt: '2026-08-05T10:00:00Z' }
  ])
  assert.equal(result[0].sessionId, 'new')
  assert.equal(result[0].title, `${'a'.repeat(60)}…`)
})

test('groupCoachSessions is safe on an empty or missing list', () => {
  assert.deepEqual(groupCoachSessions([]), [])
  assert.deepEqual(groupCoachSessions(undefined), [])
})
