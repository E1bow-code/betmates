import { test } from 'node:test'
import assert from 'node:assert/strict'
import { milestoneReached, newlyCrossedMilestone, milestoneMessage } from './communityMilestone.js'

test('milestoneReached returns the highest milestone at or below the count', () => {
  assert.equal(milestoneReached(0), 0)
  assert.equal(milestoneReached(4), 0)
  assert.equal(milestoneReached(5), 5)
  assert.equal(milestoneReached(9), 5)
  assert.equal(milestoneReached(10), 10)
  assert.equal(milestoneReached(60), 50)
  assert.equal(milestoneReached(5000), 1000)
})

test('newlyCrossedMilestone only fires when a higher milestone is reached', () => {
  assert.equal(newlyCrossedMilestone(5, 0), 5)      // first crossing
  assert.equal(newlyCrossedMilestone(9, 5), null)   // still at 5, already announced
  assert.equal(newlyCrossedMilestone(10, 5), 10)    // crossed the next one
  assert.equal(newlyCrossedMilestone(4, 0), null)   // not there yet
  assert.equal(newlyCrossedMilestone(60, 50), null) // 50 already announced
  assert.equal(newlyCrossedMilestone(60, 10), 50)   // jumped past several -> announce the top
})

test('milestoneMessage names the group and the milestone', () => {
  const msg = milestoneMessage('The Lads', 25)
  assert.match(msg, /Bea · Community/)
  assert.match(msg, /The Lads/)
  assert.match(msg, /25 members/)
})

test('milestoneMessage tolerates a missing name', () => {
  const msg = milestoneMessage('', 10)
  assert.match(msg, /A group/)
  assert.match(msg, /10 members/)
})
