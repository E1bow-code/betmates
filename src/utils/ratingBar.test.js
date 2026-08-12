import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ratingBar, pickRatingMetric } from './ratingBar.js'

test('ratingBar returns null for missing or invalid values', () => {
  assert.equal(ratingBar(null, 70, 92), null)
  assert.equal(ratingBar('', 70, 92), null)
  assert.equal(ratingBar(0, 70, 92), null)
  assert.equal(ratingBar(-3, 70, 92), null)
})

test('ratingBar returns null when the race max is missing or zero', () => {
  assert.equal(ratingBar(80, 70, 0), null)
  assert.equal(ratingBar(80, 70, null), null)
})

test('ratingBar scales across the race spread, not from zero', () => {
  // In a 70..92 band, 81 sits ~50% of the way up - not 88% (81/92).
  assert.equal(ratingBar(81, 70, 92).pct, 50)
})

test('ratingBar puts the top-rated horse at full width in the top tier', () => {
  assert.deepEqual(ratingBar(92, 70, 92), { pct: 100, tier: 'top', value: 92 })
})

test('ratingBar tiers step down across the spread', () => {
  assert.equal(ratingBar(88, 70, 92).tier, 'high') // ~82%
  assert.equal(ratingBar(80, 70, 92).tier, 'mid') //  ~45%
  assert.equal(ratingBar(72, 70, 92).tier, 'low') //   ~9%
})

test('ratingBar floors the lowest horse at a visible 14% stub', () => {
  assert.equal(ratingBar(70, 70, 92).pct, 14)
})

test('ratingBar coerces numeric strings (the racing API returns strings)', () => {
  assert.equal(ratingBar('80', '70', '92').pct, 45)
})

test('ratingBar treats a single-value race (min===max) as top', () => {
  assert.equal(ratingBar(90, 90, 90).tier, 'top')
})

test('pickRatingMetric prefers a real speed figure when most runners have one', () => {
  const runners = [
    { speedFigure: 112, racingPostRating: 98, officialRating: 96 },
    { speedFigure: 108, racingPostRating: 91, officialRating: 90 },
    { speedFigure: null, racingPostRating: 88, officialRating: 87 }
  ]
  const m = pickRatingMetric(runners)
  assert.equal(m.key, 'speedFigure')
  assert.equal(m.label, 'SPD')
  assert.deepEqual([m.min, m.max], [108, 112])
})

test('pickRatingMetric falls back to RPR when no speed figures (the live case)', () => {
  const runners = [
    { speedFigure: null, racingPostRating: 98, officialRating: 96 },
    { speedFigure: null, racingPostRating: 91, officialRating: 90 },
    { speedFigure: null, racingPostRating: 88, officialRating: 87 }
  ]
  const m = pickRatingMetric(runners)
  assert.equal(m.key, 'racingPostRating')
  assert.equal(m.label, 'RPR')
})

test('pickRatingMetric falls back to OR when RPR is also sparse', () => {
  const runners = [
    { speedFigure: null, racingPostRating: null, officialRating: 96 },
    { speedFigure: null, racingPostRating: null, officialRating: 90 },
    { speedFigure: null, racingPostRating: 87, officialRating: 87 }
  ]
  const m = pickRatingMetric(runners)
  assert.equal(m.key, 'officialRating')
  assert.equal(m.label, 'OR')
})

test('pickRatingMetric returns null when a race carries no ratings at all', () => {
  const runners = [
    { speedFigure: null, racingPostRating: null, officialRating: null },
    { speedFigure: null, racingPostRating: null, officialRating: null }
  ]
  assert.equal(pickRatingMetric(runners), null)
})

test('pickRatingMetric needs at least half the field before a metric qualifies', () => {
  // Only 1 of 4 has RPR -> not enough; OR present on 4/4 -> OR wins.
  const runners = [
    { racingPostRating: 100, officialRating: 96 },
    { officialRating: 90 },
    { officialRating: 88 },
    { officialRating: 85 }
  ]
  assert.equal(pickRatingMetric(runners).key, 'officialRating')
})
