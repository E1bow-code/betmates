import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatKickoff,
  formatCountdown,
  formatDateTime,
  formatRelativeTime,
  formatGBP,
  formatSignedGBP,
} from './format.js'

// formatCountdown and formatRelativeTime read the wall clock (`new Date()`),
// so the fixtures here are built relative to Date.now() rather than a fixed
// calendar date - that keeps the assertions stable no matter when the suite
// runs. formatKickoff/formatDateTime go through toLocale*String, whose exact
// output depends on the runner's locale and timezone, so those are covered as
// shape/smoke checks rather than pinned strings.
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const ahead = (ms) => new Date(Date.now() + ms).toISOString()

// ---- formatCountdown ----

test('formatCountdown shows KO once kickoff is here or past', () => {
  assert.equal(formatCountdown(ago(MIN)), 'KO')
  assert.equal(formatCountdown(ago(0)), 'KO')
})

test('formatCountdown shows bare minutes under an hour', () => {
  assert.equal(formatCountdown(ahead(5 * MIN)), '5m')
  assert.equal(formatCountdown(ahead(59 * MIN)), '59m')
})

test('formatCountdown shows hours and minutes under a day', () => {
  assert.equal(formatCountdown(ahead(2 * HOUR + 15 * MIN)), '2h 15m')
})

test('formatCountdown shows days and hours once a day or more out', () => {
  assert.equal(formatCountdown(ahead(3 * DAY + 4 * HOUR)), '3d 4h')
})

// ---- formatRelativeTime ----

test('formatRelativeTime says "just now" under a minute', () => {
  assert.equal(formatRelativeTime(ago(20 * 1000)), 'just now')
})

test('formatRelativeTime treats a future timestamp as "just now"', () => {
  // A negative age rounds to <1 minute, so a clock skew or an about-to-happen
  // event reads as "just now" rather than a nonsensical negative label.
  assert.equal(formatRelativeTime(ahead(5 * MIN)), 'just now')
})

test('formatRelativeTime shows minutes', () => {
  assert.equal(formatRelativeTime(ago(70 * 1000)), '1m ago')
  assert.equal(formatRelativeTime(ago(5 * MIN)), '5m ago')
})

test('formatRelativeTime shows hours', () => {
  assert.equal(formatRelativeTime(ago(2 * HOUR + 30 * MIN)), '2h ago')
})

test('formatRelativeTime shows days up to the two-week cutoff', () => {
  assert.equal(formatRelativeTime(ago(3 * DAY)), '3d ago')
  assert.equal(formatRelativeTime(ago(13 * DAY)), '13d ago')
})

test('formatRelativeTime falls back to an absolute date past two weeks', () => {
  const label = formatRelativeTime(ago(20 * DAY))
  assert.doesNotMatch(label, /ago|just now/)
  assert.match(label, /\d/) // an actual date, e.g. "Aug 7"
})

// ---- formatKickoff / formatDateTime (locale-dependent smoke checks) ----

test('formatKickoff returns a time-of-day string', () => {
  const s = formatKickoff('2026-08-27T14:30:00Z')
  assert.equal(typeof s, 'string')
  assert.match(s, /\d/)
})

test('formatDateTime returns a non-empty string', () => {
  const s = formatDateTime('2026-08-27T14:30:00Z')
  assert.equal(typeof s, 'string')
  assert.ok(s.length > 0)
})

// ---- formatGBP / formatSignedGBP (money display) ----
// These must reproduce the exact strings the inline `£${Number(x).toFixed(2)}`
// and `${x >= 0 ? '+' : ''}£${x.toFixed(2)}` sites produced, so adoption is a
// no-op for what users see.

test('formatGBP renders 2dp with a £ sign', () => {
  assert.equal(formatGBP(5), '£5.00')
  assert.equal(formatGBP(2.5), '£2.50')
  assert.equal(formatGBP(1234.5), '£1234.50') // no thousands separator, by design
  assert.equal(formatGBP('10'), '£10.00') // string numerics coerce, as Number(x) did
  assert.equal(formatGBP(0), '£0.00') // a real zero still renders (only null/undefined are blank)
})

test('formatGBP returns empty string for a null/undefined/non-numeric value', () => {
  assert.equal(formatGBP(null), '')
  assert.equal(formatGBP(undefined), '')
  assert.equal(formatGBP(NaN), '')
  assert.equal(formatGBP('abc'), '')
})

test('formatSignedGBP keeps the app sign convention (+ on >= 0, minus after £)', () => {
  assert.equal(formatSignedGBP(5), '+£5.00')
  assert.equal(formatSignedGBP(0), '+£0.00')
  assert.equal(formatSignedGBP(-5), '£-5.00') // matches `${n>=0?'+':''}£${n.toFixed(2)}`
  assert.equal(formatSignedGBP(-0.5), '£-0.50')
})

test('formatSignedGBP returns empty string for a non-numeric value', () => {
  assert.equal(formatSignedGBP(null), '')
  assert.equal(formatSignedGBP(undefined), '')
  assert.equal(formatSignedGBP(NaN), '')
})

// The equivalence that makes the refactor safe: helper output == the old inline
// expression for a spread of values.
test('formatGBP/formatSignedGBP match the inline expressions they replaced', () => {
  for (const v of [0, 0.5, 2.5, 5, 10, 12.34, 1000, -0.5, -5, -12.34]) {
    assert.equal(formatGBP(v), `£${Number(v).toFixed(2)}`)
    assert.equal(formatSignedGBP(v), `${v >= 0 ? '+' : ''}£${v.toFixed(2)}`)
  }
})
