import test from 'node:test'
import assert from 'node:assert/strict'
import { computeOnboardingSteps } from './onboardingSteps.js'

test('a brand-new user has all three steps open', () => {
  const out = computeOnboardingSteps({ hasBet: false, inGroup: false, followsSomeone: false })
  assert.equal(out.total, 3)
  assert.equal(out.doneCount, 0)
  assert.equal(out.complete, false)
  assert.deepEqual(
    out.steps.map((s) => s.key),
    ['bet', 'group', 'follow']
  )
  assert.ok(out.steps.every((s) => s.done === false))
})

test('done flags track the signals', () => {
  const out = computeOnboardingSteps({ hasBet: true, inGroup: false, followsSomeone: true })
  assert.equal(out.doneCount, 2)
  assert.equal(out.complete, false)
  assert.equal(out.steps.find((s) => s.key === 'bet').done, true)
  assert.equal(out.steps.find((s) => s.key === 'group').done, false)
  assert.equal(out.steps.find((s) => s.key === 'follow').done, true)
})

test('all signals present marks the checklist complete', () => {
  const out = computeOnboardingSteps({ hasBet: true, inGroup: true, followsSomeone: true })
  assert.equal(out.doneCount, 3)
  assert.equal(out.complete, true)
})

test('missing argument object is treated as nothing done', () => {
  const out = computeOnboardingSteps()
  assert.equal(out.doneCount, 0)
  assert.equal(out.complete, false)
})
