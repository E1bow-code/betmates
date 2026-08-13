import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMatchup } from './matchup.js'

test('parseMatchup splits a UFC leg into two player names', () => {
  assert.deepEqual(parseMatchup({ sport: 'ufc', event: 'Ian Garry v Islam Makhachev' }), {
    nameA: 'Ian Garry',
    nameB: 'Islam Makhachev',
    participantType: 'player'
  })
})

test('parseMatchup splits a football leg into two team names', () => {
  assert.deepEqual(parseMatchup({ sport: 'football', event: 'Arsenal v Chelsea' }), {
    nameA: 'Arsenal',
    nameB: 'Chelsea',
    participantType: 'team'
  })
})

test('parseMatchup covers GENERIC_SPORTS players (tennis) and teams (basketball)', () => {
  assert.deepEqual(parseMatchup({ sport: 'tennis', event: 'Carlos Alcaraz v Jannik Sinner' }), {
    nameA: 'Carlos Alcaraz',
    nameB: 'Jannik Sinner',
    participantType: 'player'
  })
  assert.deepEqual(parseMatchup({ sport: 'basketball', event: 'Lakers v Celtics' }), {
    nameA: 'Lakers',
    nameB: 'Celtics',
    participantType: 'team'
  })
})

test('parseMatchup returns null for racing - no head-to-head participant type', () => {
  assert.equal(parseMatchup({ sport: 'racing', event: 'Frankel' }), null)
})

test('parseMatchup returns null when the event has no v-delimiter or too many parts', () => {
  assert.equal(parseMatchup({ sport: 'football', event: 'Arsenal to win' }), null)
  assert.equal(parseMatchup({ sport: 'football', event: 'A v B v C' }), null)
})

test('parseMatchup returns null for an unknown or missing sport', () => {
  assert.equal(parseMatchup({ sport: 'multi', event: 'Arsenal v Chelsea' }), null)
  assert.equal(parseMatchup({ event: 'Arsenal v Chelsea' }), null)
})
