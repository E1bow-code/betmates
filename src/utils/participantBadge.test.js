import { test } from 'node:test'
import assert from 'node:assert/strict'
import { participantBadge } from './participantBadge.js'

test('football moneyline pick gets a team badge', () => {
  const r = participantBadge({ sport: 'football', marketKey: 'h2h', market: 'Match Result', selection: 'Arsenal' })
  assert.deepEqual(r, { type: 'team', name: 'Arsenal', sport: 'football' })
})

test('UFC fight winner gets a player headshot', () => {
  const r = participantBadge({ sport: 'ufc', market: 'Moneyline', selection: 'Islam Makhachev' })
  assert.deepEqual(r, { type: 'player', name: 'Islam Makhachev', sport: 'ufc' })
})

test('generic team sport uses its configured participantType', () => {
  assert.equal(participantBadge({ sport: 'basketball', market: 'Moneyline', selection: 'Lakers' }).type, 'team')
  assert.equal(participantBadge({ sport: 'tennis', market: 'Winner', selection: 'Alcaraz' }).type, 'player')
})

test('falls back to the post sport when the leg has none', () => {
  const r = participantBadge({ market: 'Moneyline', selection: 'Celtics' }, 'basketball')
  assert.equal(r?.type, 'team')
})

test('the Draw outcome never gets a badge', () => {
  assert.equal(participantBadge({ sport: 'football', marketKey: 'h2h', market: 'Match Result', selection: 'Draw' }), null)
})

test('non-head-to-head markets get no badge (the selection is a line, not a team)', () => {
  assert.equal(participantBadge({ sport: 'football', market: 'Over/Under 2.5', selection: 'Over 2.5' }), null)
  assert.equal(participantBadge({ sport: 'nfl', market: 'Handicap', selection: 'Chiefs -3.5' }), null)
  assert.equal(participantBadge({ sport: 'football', market: 'Both Teams to Score', selection: 'Yes' }), null)
})

test('racing, mixed multis and pick-less posts get no badge', () => {
  assert.equal(participantBadge({ sport: 'racing', market: 'Win', selection: 'Thunder Chaser' }), null)
  assert.equal(participantBadge({ sport: 'multi', market: 'Moneyline', selection: 'Arsenal' }), null)
  assert.equal(participantBadge({ sport: 'post', market: 'Post', selection: '' }), null)
})

test('an unknown sport gets no badge', () => {
  assert.equal(participantBadge({ sport: 'darts', market: 'Moneyline', selection: 'Littler' }), null)
})

test('returns null on missing input rather than throwing', () => {
  assert.equal(participantBadge(null, 'football'), null)
  assert.equal(participantBadge({ market: 'Moneyline', selection: 'Arsenal' }, null), null)
})
