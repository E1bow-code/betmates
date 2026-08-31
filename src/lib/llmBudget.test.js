import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withinLlmBudget } from './llmBudget.js'

// A stub Supabase client whose .rpc resolves to a chosen result (or throws).
function stubClient(result, capture) {
  return {
    rpc(name, args) {
      if (capture) capture.push({ name, args })
      if (typeof result === 'function') return result()
      return Promise.resolve(result)
    }
  }
}

test('no client -> allowed (unconfigured deploys are never gated)', async () => {
  assert.equal(await withinLlmBudget(null), true)
  assert.equal(await withinLlmBudget(undefined), true)
})

test('within budget when the RPC reports true', async () => {
  assert.equal(await withinLlmBudget(stubClient({ data: true, error: null })), true)
})

test('blocked only when the RPC reports false', async () => {
  assert.equal(await withinLlmBudget(stubClient({ data: false, error: null })), false)
})

test('fails OPEN on a DB error - a hiccup must not break the feature', async () => {
  assert.equal(await withinLlmBudget(stubClient({ data: null, error: { message: 'boom' } })), true)
})

test('fails OPEN when the RPC throws', async () => {
  assert.equal(
    await withinLlmBudget(
      stubClient(() => {
        throw new Error('network')
      })
    ),
    true
  )
})

test('a null RPC result is treated as allowed, not blocked', async () => {
  assert.equal(await withinLlmBudget(stubClient({ data: null, error: null })), true)
})

test('passes the cap and the cost through to bump_llm_budget', async () => {
  const calls = []
  await withinLlmBudget(stubClient({ data: true, error: null }, calls), 4)
  assert.equal(calls[0].name, 'bump_llm_budget')
  assert.equal(calls[0].args._n, 4)
  assert.equal(typeof calls[0].args._max, 'number')
  assert.ok(calls[0].args._max > 0)
})

// The DB-error path fails open but BOUNDED: a transient blip still allows (the
// two fail-OPEN tests above prove a single small call returns true on error),
// but it can't allow unbounded spend. A single call whose cost alone dwarfs the
// per-instance fallback ceiling must be refused - proving a DB outage degrades
// to a capped local ceiling, not "allow everything". Huge cost so this is
// independent of any small increments the earlier error-path tests added.
test('DB-error fallback is bounded - blocks once the per-instance ceiling is passed', async () => {
  const errored = stubClient({ data: null, error: { message: 'db down' } })
  assert.equal(await withinLlmBudget(errored, 100000), false)
})
