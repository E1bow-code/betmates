import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMatchup, resolveMatchupWinner } from './matchup.js'

test('parseMatchup splits a UFC leg into two player names, no draw possible', () => {
  assert.deepEqual(parseMatchup({ sport: 'ufc', event: 'Ian Garry v Islam Makhachev' }), {
    nameA: 'Ian Garry',
    nameB: 'Islam Makhachev',
    participantType: 'player',
    hasDraw: false
  })
})

test('parseMatchup splits a football leg into two team names, draw possible', () => {
  assert.deepEqual(parseMatchup({ sport: 'football', event: 'Arsenal v Chelsea' }), {
    nameA: 'Arsenal',
    nameB: 'Chelsea',
    participantType: 'team',
    hasDraw: true
  })
})

test('parseMatchup covers GENERIC_SPORTS players (tennis) and teams (basketball)', () => {
  assert.deepEqual(parseMatchup({ sport: 'tennis', event: 'Carlos Alcaraz v Jannik Sinner' }), {
    nameA: 'Carlos Alcaraz',
    nameB: 'Jannik Sinner',
    participantType: 'player',
    hasDraw: false
  })
  assert.deepEqual(parseMatchup({ sport: 'basketball', event: 'Lakers v Celtics' }), {
    nameA: 'Lakers',
    nameB: 'Celtics',
    participantType: 'team',
    hasDraw: false
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

test('resolveMatchupWinner returns the pick itself on a won, no-draw leg', () => {
  const matchup = parseMatchup({ sport: 'ufc', event: 'Islam Makhachev v Ian Garry' })
  assert.equal(resolveMatchupWinner({ selection: 'Islam Makhachev' }, matchup, 'won'), 'Islam Makhachev')
})

test('resolveMatchupWinner returns the other side on a lost, no-draw leg', () => {
  const matchup = parseMatchup({ sport: 'ufc', event: 'Islam Makhachev v Ian Garry' })
  assert.equal(resolveMatchupWinner({ selection: 'Ian Garry' }, matchup, 'lost'), 'Islam Makhachev')
})

test('resolveMatchupWinner never guesses on a draw-capable sport', () => {
  const matchup = parseMatchup({ sport: 'football', event: 'Arsenal v Chelsea' })
  assert.equal(resolveMatchupWinner({ selection: 'Chelsea' }, matchup, 'lost'), null)
  assert.equal(resolveMatchupWinner({ selection: 'Arsenal' }, matchup, 'won'), null)
})

test('resolveMatchupWinner returns null when unsettled, void, or matchup missing', () => {
  const matchup = parseMatchup({ sport: 'ufc', event: 'Islam Makhachev v Ian Garry' })
  assert.equal(resolveMatchupWinner({ selection: 'Islam Makhachev' }, matchup, 'open'), null)
  assert.equal(resolveMatchupWinner({ selection: 'Islam Makhachev' }, matchup, 'void'), null)
  assert.equal(resolveMatchupWinner({ selection: 'Islam Makhachev' }, null, 'won'), null)
})

test('resolveMatchupWinner returns null when the pick is not one of the two sides', () => {
  const matchup = parseMatchup({ sport: 'basketball', event: 'Lakers v Celtics' })
  assert.equal(resolveMatchupWinner({ selection: 'Over 220.5' }, matchup, 'won'), null)
})
