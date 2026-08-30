import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { errorSignature, shouldSkipErrorLog, _resetErrorLogThrottle } from './errorLogThrottle.js'

// shouldSkipErrorLog holds module-level state, so reset it between cases. `now`
// is passed explicitly so the window is exercised without real waiting.
beforeEach(() => _resetErrorLogThrottle())

const err = (over = {}) => ({ message: 'boom', route: '/x', stack: 'Error: boom\n  at f (a.js:1)', ...over })

test('errorSignature keys on message + route + top stack frame only', () => {
  const a = errorSignature(err({ stack: 'Error: boom\n  at f (a.js:1)\n  at g (b.js:2)' }))
  const b = errorSignature(err({ stack: 'Error: boom\n  at f (a.js:1)\n  at h (c.js:9)' }))
  assert.equal(a, b) // differing stack tails collapse to the same signature
  assert.notEqual(errorSignature(err({ route: '/y' })), a) // route matters
  assert.notEqual(errorSignature(err({ message: 'other' })), a) // message matters
})

test('a distinct error always logs immediately', () => {
  assert.equal(shouldSkipErrorLog(err({ message: 'one' }), 0), false)
  assert.equal(shouldSkipErrorLog(err({ message: 'two' }), 0), false)
  assert.equal(shouldSkipErrorLog(err({ message: 'three' }), 0), false)
})

test('a repeat of the same error inside the window is skipped', () => {
  assert.equal(shouldSkipErrorLog(err(), 0), false) // first logs
  assert.equal(shouldSkipErrorLog(err(), 100), true) // 100ms later - skipped
  assert.equal(shouldSkipErrorLog(err(), 59_000), true) // still inside the minute
})

test('the same error logs again once the window has passed', () => {
  assert.equal(shouldSkipErrorLog(err(), 0), false)
  assert.equal(shouldSkipErrorLog(err(), 60_000), false) // window elapsed - logs again
  assert.equal(shouldSkipErrorLog(err(), 60_100), true) // and re-throttles from there
})

test('distinct errors are throttled independently, not globally', () => {
  assert.equal(shouldSkipErrorLog(err({ message: 'a' }), 0), false)
  assert.equal(shouldSkipErrorLog(err({ message: 'b' }), 10), false) // different sig still logs
  assert.equal(shouldSkipErrorLog(err({ message: 'a' }), 20), true) // 'a' repeat still suppressed
})

test('a per-session cap eventually drops everything as a runaway backstop', () => {
  // 500 distinct signatures fill the session budget; the 501st is dropped even
  // though it is brand new.
  for (let i = 0; i < 500; i++) {
    assert.equal(shouldSkipErrorLog(err({ message: 'm' + i }), i), false)
  }
  assert.equal(shouldSkipErrorLog(err({ message: 'brand-new' }), 999_999), true)
})
