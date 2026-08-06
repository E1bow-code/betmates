import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAchievements } from './achievements.js'

const e = (over) => ({
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  sport: 'football',
  settledAt: '2026-01-05T12:00:00Z',
  selections: [{ event: 'Test', odds: 2 }],
  ...over
})

const earned = (entries, id) => computeAchievements(entries).find((b) => b.id === id).earned

test('the full catalog is always returned, earned or not', () => {
  const all = computeAchievements([])
  assert.equal(all.length, 16)
  assert.ok(all.every((b) => typeof b.earned === 'boolean'))
})

test('first-win only needs one settled win', () => {
  assert.equal(earned([], 'first-win'), false)
  assert.equal(earned([e({ status: 'won' })], 'first-win'), true)
})

test('logged-N tiers count every entry, not just settled ones', () => {
  const ten = Array.from({ length: 10 }, () => e({ status: 'open' }))
  assert.equal(earned(ten, 'logged-10'), true)
  assert.equal(earned(ten, 'logged-50'), false)
})

test('profit tiers follow lifetime profit', () => {
  const entries = [e({ status: 'won', stake: 50, potentialReturn: 150 })] // +100
  assert.equal(earned(entries, 'profit-50'), true)
  assert.equal(earned(entries, 'profit-100'), true)
  assert.equal(earned(entries, 'profit-250'), false)
})

test('streak tiers follow the longest historical win run', () => {
  const threeWins = [
    e({ status: 'won', settledAt: '2026-01-01T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-02T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-03T00:00:00Z' })
  ]
  assert.equal(earned(threeWins, 'streak-3'), true)
  assert.equal(earned(threeWins, 'streak-5'), false)
})

test('multi-sport needs 3 distinct settled sports', () => {
  const twoSports = [e({ sport: 'football' }), e({ sport: 'racing' })]
  assert.equal(earned(twoSports, 'multi-sport'), false)
  const threeSports = [e({ sport: 'football' }), e({ sport: 'racing' }), e({ sport: 'tennis' })]
  assert.equal(earned(threeSports, 'multi-sport'), true)
})

test('high-roller looks at the single biggest stake, settled or not', () => {
  assert.equal(earned([e({ stake: 49, status: 'open' })], 'high-roller'), false)
  assert.equal(earned([e({ stake: 50, status: 'open' })], 'high-roller'), true)
})

test('underdog needs a win at combined odds of 5.00 or higher', () => {
  const shortOdds = [e({ status: 'won', selections: [{ event: 'A', odds: 4 }] })]
  assert.equal(earned(shortOdds, 'underdog'), false)
  const longOdds = [e({ status: 'won', selections: [{ event: 'A', odds: 2.5 }, { event: 'B', odds: 2 }] })] // 5.0 combined
  assert.equal(earned(longOdds, 'underdog'), true)
})

test('perfect-week and winning-week follow the underlying week computations', () => {
  const perfectWeek = [
    e({ status: 'won', settledAt: '2026-01-05T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-06T00:00:00Z' })
  ]
  assert.equal(earned(perfectWeek, 'perfect-week'), true)
  assert.equal(earned(perfectWeek, 'winning-week'), true)

  const losingWeek = [e({ status: 'lost', potentialReturn: 0, settledAt: '2026-01-05T00:00:00Z' })]
  assert.equal(earned(losingWeek, 'perfect-week'), false)
  assert.equal(earned(losingWeek, 'winning-week'), false)
})
