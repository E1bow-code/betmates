import test from 'node:test'
import assert from 'node:assert/strict'
import { abbreviatePosition, flagFor, ageFrom } from './playerCard.js'

test('abbreviatePosition maps known football positions', () => {
  assert.equal(abbreviatePosition('Centre-Forward'), 'ST')
  assert.equal(abbreviatePosition('Goalkeeper'), 'GK')
  assert.equal(abbreviatePosition('Defensive Midfield'), 'CDM')
})

test('abbreviatePosition falls back to an initialism for unmapped positions', () => {
  assert.equal(abbreviatePosition('Fighter'), 'FTR')
  assert.equal(abbreviatePosition('Right Wing Attack'), 'RWA')
  assert.equal(abbreviatePosition('Setter'), 'SET')
})

test('abbreviatePosition is null without a position', () => {
  assert.equal(abbreviatePosition(null), null)
  assert.equal(abbreviatePosition(''), null)
})

test('flagFor renders the special England/Scotland/Wales tag-sequence flags', () => {
  assert.equal(flagFor('England'), '🏴󠁧󠁢󠁥󠁮󠁧󠁿')
  assert.equal(flagFor('Scotland'), '🏴󠁧󠁢󠁳󠁣󠁴󠁿')
  assert.equal(flagFor('wales'), '🏴󠁧󠁢󠁷󠁬󠁳󠁿')
})

test('flagFor renders a standard ISO flag for a mapped country', () => {
  assert.equal(flagFor('Brazil'), '🇧🇷')
  assert.equal(flagFor('ireland'), '🇮🇪')
})

test('flagFor is null for an unmapped nationality rather than guessing', () => {
  assert.equal(flagFor('Atlantis'), null)
  assert.equal(flagFor(null), null)
})

test('ageFrom computes whole years and accounts for the birthday not having happened yet this year', () => {
  const now = new Date()
  const notYetBirthday = new Date(now.getFullYear() - 30, now.getMonth() + 1, now.getDate())
  const alreadyHadBirthday = new Date(now.getFullYear() - 30, now.getMonth() - 1, now.getDate())
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.equal(ageFrom(iso(notYetBirthday)), 29)
  assert.equal(ageFrom(iso(alreadyHadBirthday)), 30)
})

test('ageFrom is null without a birth date', () => {
  assert.equal(ageFrom(null), null)
  assert.equal(ageFrom(''), null)
})

test('ageFrom is null for an age outside the plausible range for an active pro', () => {
  const now = new Date()
  const iso = (years) => `${now.getFullYear() - years}-01-01`
  assert.equal(ageFrom(iso(10)), null) // too young for a pro
  assert.equal(ageFrom(iso(80)), null) // too old for a pro
  assert.equal(ageFrom(iso(30)), 30) // plausible age still computes normally
})
