import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBriefBody, formatBriefMessage, BRIEF_MODEL } from './matchdayBrief.js'

test('buildBriefBody wires web_search + adaptive thinking and names the fixture', () => {
  const body = buildBriefBody({ home: 'Arsenal', away: 'Spurs', competition: 'Premier League', kickoff: 'Sun 16:30' })
  assert.equal(BRIEF_MODEL, 'claude-sonnet-5')
  assert.equal(body.tools[0].type, 'web_search_20260209')
  assert.deepEqual(body.thinking, { type: 'adaptive' })
  assert.match(body.messages[0].content, /Arsenal v Spurs/)
  assert.match(body.messages[0].content, /Premier League/)
  assert.match(body.messages[0].content, /Sun 16:30/)
  assert.equal(body.model, undefined)
})

test('buildBriefBody omits optional bits it was not given', () => {
  const body = buildBriefBody({ home: 'A', away: 'B' })
  assert.match(body.messages[0].content, /A v B/)
  assert.doesNotMatch(body.messages[0].content, /kicks off/)
  assert.doesNotMatch(body.messages[0].content, /in the /)
})

test('formatBriefMessage includes the fixture, text, sources and the desk sign-off', () => {
  const msg = formatBriefMessage(
    { home: 'A', away: 'B' },
    { text: 'Form: A on a good run.', sources: [{ url: 'https://ex.com/x', title: 'Report' }] }
  )
  assert.match(msg, /Matchday brief — A v B/)
  assert.match(msg, /A on a good run/)
  assert.match(msg, /Report — <https:\/\/ex\.com\/x>/)
  assert.match(msg, /Jonas · Rue · Vic · Ola · Finn/)
  assert.match(msg, /not a tip/)
})

test('formatBriefMessage omits the sources block when there are none', () => {
  const msg = formatBriefMessage({ home: 'A', away: 'B' }, { text: 'Nothing much to confirm.', sources: [] })
  assert.doesNotMatch(msg, /Sources/)
})

test('formatBriefMessage caps at Discord message length', () => {
  const msg = formatBriefMessage({ home: 'A', away: 'B' }, { text: 'x'.repeat(5000), sources: [] })
  assert.ok(msg.length <= 1900)
})
