import test from 'node:test'
import assert from 'node:assert/strict'
import { apiKeysForSport, sgoEventIdForLeg, TENNIS_DYNAMIC_KEY, FOOTBALL_SPORT_KEYS, UFC_SPORT_KEY } from './sportsConfig.js'

test('apiKeysForSport returns the fixed key lists for football and UFC', () => {
  assert.deepEqual(apiKeysForSport('football'), FOOTBALL_SPORT_KEYS)
  assert.deepEqual(apiKeysForSport('ufc'), [UFC_SPORT_KEY])
})

test('apiKeysForSport returns the dynamic sentinel for tennis, not an empty list', () => {
  assert.deepEqual(apiKeysForSport('tennis'), [TENNIS_DYNAMIC_KEY])
})

test('apiKeysForSport returns the static list for a generic sport that has one', () => {
  assert.deepEqual(apiKeysForSport('cricket'), [
    'cricket_international_t20',
    'cricket_ipl',
    'cricket_big_bash',
    'cricket_the_hundred',
    'cricket_t20_blast'
  ])
})

test('apiKeysForSport returns an empty list for SGO-backed sports (they use sgoEventIdForLeg instead)', () => {
  assert.deepEqual(apiKeysForSport('basketball'), [])
  assert.deepEqual(apiKeysForSport('nfl'), [])
})

test('sgoEventIdForLeg returns the leg eventId for the four SGO sports', () => {
  assert.equal(sgoEventIdForLeg({ sport: 'basketball', eventId: 'abc123' }), 'abc123')
  assert.equal(sgoEventIdForLeg({ sport: 'hockey', eventId: 'xyz' }), 'xyz')
  assert.equal(sgoEventIdForLeg({ sport: 'baseball', eventId: 'x' }), 'x')
  assert.equal(sgoEventIdForLeg({ sport: 'nfl', eventId: 'x' }), 'x')
})

test('sgoEventIdForLeg returns null for non-SGO sports and legs missing an eventId', () => {
  assert.equal(sgoEventIdForLeg({ sport: 'football', eventId: 'abc' }), null)
  assert.equal(sgoEventIdForLeg({ sport: 'tennis', eventId: 'abc' }), null)
  assert.equal(sgoEventIdForLeg({ sport: 'basketball' }), null)
})
