import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickLink } from './oddsLinks.js'

// pickLink chooses whichever link The Odds API actually returned, in the order
// outcome > market > bookmaker, and flags isBetslipLink only for the
// outcome-level case (a genuine pre-filled slip). Note: the deep-link/affiliate
// building lives in bookmakers.js (covered by bookmakers.test.js) - this is only
// the fallback picker.
const bm = (over = {}) => ({ link: null, ...over })
const mkt = (over = {}) => ({ link: null, ...over })
const out = (over = {}) => ({ link: null, ...over })

test('an outcome-level link wins and is flagged as a betslip', () => {
  const r = pickLink(bm({ link: 'https://book/event' }), mkt({ link: 'https://book/market' }), out({ link: 'https://book/slip' }))
  assert.equal(r.link, 'https://book/slip') // outcome beats market beats bookmaker
  assert.equal(r.isBetslipLink, true)
})

test('a market link is used when there is no outcome link, but is not a betslip', () => {
  const r = pickLink(bm({ link: 'https://book/event' }), mkt({ link: 'https://book/market' }), out())
  assert.equal(r.link, 'https://book/market')
  assert.equal(r.isBetslipLink, false)
})

test('the bookmaker event link is the last resort, also not a betslip', () => {
  const r = pickLink(bm({ link: 'https://book/event' }), mkt(), out())
  assert.equal(r.link, 'https://book/event')
  assert.equal(r.isBetslipLink, false)
})

test('no link anywhere yields null and not a betslip', () => {
  const r = pickLink(bm(), mkt(), out())
  assert.equal(r.link, null)
  assert.equal(r.isBetslipLink, false)
})

test('fallback is null/undefined-based: a missing outcome link falls through to market', () => {
  // outcome has no `link` key at all -> undefined -> ?? falls through to market.
  const r = pickLink(bm({ link: 'https://book/event' }), mkt({ link: 'https://book/market' }), {})
  assert.equal(r.link, 'https://book/market')
  assert.equal(r.isBetslipLink, false)
})
