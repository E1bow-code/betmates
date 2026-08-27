import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKMAKERS, BOOKMAKER_LINKS, withAffiliate, buildDeepLink } from './bookmakers.js'

test('BOOKMAKERS is the core UK bookmaker list', () => {
  assert.ok(Array.isArray(BOOKMAKERS) && BOOKMAKERS.length >= 10)
  for (const name of ['Bet365', 'William Hill', 'Sky Bet', 'Betfair']) {
    assert.ok(BOOKMAKERS.includes(name), `${name} should be listed`)
  }
})

test('every listed bookmaker has a valid https homepage link', () => {
  for (const name of BOOKMAKERS) {
    const link = BOOKMAKER_LINKS[name]
    assert.ok(link, `${name} should have a link`)
    assert.match(link, /^https:\/\//, `${name} link should be https`)
  }
})

test('buildDeepLink returns null - no bookmaker publishes a public bet-slip scheme', () => {
  // DEEP_LINK_BUILDERS is deliberately empty (see bookmakers.js): inventing a
  // scheme would produce silently-broken links, so the honest default is null
  // and Copy Bet falls back to homepage + clipboard.
  assert.equal(buildDeepLink('Bet365', { selection: 'Arsenal', odds: 2.1 }), null)
  assert.equal(buildDeepLink('Sky Bet', {}), null)
  assert.equal(buildDeepLink('Unknown Bookmaker', {}), null)
})

test('withAffiliate is a no-op when no affiliate params are configured', () => {
  // With VITE_AFFILIATE_PARAMS unset (the default, and the case under test),
  // there is no tracking param to append, so the resolved URL passes through
  // unchanged for every bookmaker - known or not.
  const url = 'https://www.bet365.com/event/123'
  assert.equal(withAffiliate('Bet365', url), url)
  assert.equal(withAffiliate('Unknown', url), url)
})

test('withAffiliate returns a falsy url untouched', () => {
  assert.equal(withAffiliate('Bet365', null), null)
  assert.equal(withAffiliate('Bet365', undefined), undefined)
  assert.equal(withAffiliate('Bet365', ''), '')
})
