import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEnabled } from './agentSettings.js'

test('agents default to enabled when there is no row (fail-open)', () => {
  assert.equal(isEnabled([], 'coco'), true)
  assert.equal(isEnabled(undefined, 'coco'), true)
  assert.equal(isEnabled([{ key: 'sage', enabled: false }], 'coco'), true)
})

test('only an explicit enabled=false disables an agent', () => {
  assert.equal(isEnabled([{ key: 'coco', enabled: false }], 'coco'), false)
  assert.equal(isEnabled([{ key: 'coco', enabled: true }], 'coco'), true)
})
