// Unit verification for the effort-injection waterfall — mock cordis ctx,
// no LLM, no real event bus. Covers plan §6.1 group 2: map miss passes the
// next() result through untouched, a hit injects/overrides the registered
// effort, next() is always called (waterfall contract), and forget() stops
// injection for that id.
// Run: node test/effort-inject.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { getEffortRegistry, installEffortInjection } from '../lib/effort-inject.js'

/**
 * Minimal cordis ctx double: records `ctx.on` listeners and composes
 * `agent/request` waterfalls outermost-first, exactly like the real event
 * service (first-registered listener wraps the rest and the built-in next).
 */
function mockCtx() {
  const listeners = []
  return {
    listeners,
    on(name, listener) {
      listeners.push({ name, listener })
      return () => true
    },
    async waterfall(name, payload, next) {
      let chain = next
      for (const entry of [...listeners].reverse()) {
        if (entry.name !== name) continue
        const innerNext = chain
        chain = () => entry.listener(payload, innerNext)
      }
      return chain()
    },
  }
}

/** Payload shape of the harness `agent/request` event (structural minimum). */
const requestPayload = (id) => ({ agent: { id }, turn: 1, step: 0, signal: new AbortController().signal })

/** A plausible loop-proposed call config. */
const baseConfig = (over = {}) => ({ provider: 'spawn', model: 'deepseek-v4-flash', ...over })

// ---------------------------------------------------------------------------
// Group 2a — map miss: config identical to the next() result; an existing
// reasoningEffort is not touched.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  installEffortInjection(ctx)
  const nextConfig = baseConfig({ reasoningEffort: 'low', temperature: 0.7 })
  const seen = []
  const next = () => {
    seen.push(nextConfig)
    return Promise.resolve(nextConfig)
  }
  const result = await ctx.waterfall('agent/request', requestPayload('child-a'), next)
  assert.equal(result, nextConfig, 'miss: the exact next() result object is returned')
  assert.equal(result.reasoningEffort, 'low', 'miss: existing reasoningEffort untouched')
  assert.equal(result.temperature, 0.7, 'miss: other fields untouched')
  assert.equal(seen.length, 1, 'miss: next() called exactly once')

  // A registered sibling id must not leak onto a different session id.
  const reg = getEffortRegistry()
  reg.register('child-other', 'max')
  const result2 = await ctx.waterfall('agent/request', requestPayload('child-a'), () =>
    Promise.resolve(baseConfig({ reasoningEffort: 'low' })),
  )
  assert.equal(result2.reasoningEffort, 'low', 'miss: another id registration does not leak')
  console.log('PASS map miss: config === next() result, existing reasoningEffort untouched')
}

// ---------------------------------------------------------------------------
// Group 2b — map hit: effort injected when absent, overridden when present.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  const reg = installEffortInjection(ctx)

  // Absent -> injected.
  reg.register('child-b', 'max')
  const injected = await ctx.waterfall('agent/request', requestPayload('child-b'), () =>
    Promise.resolve(baseConfig()),
  )
  assert.equal(injected.reasoningEffort, 'max', 'hit: effort injected when config lacks one')
  assert.equal(injected.provider, 'spawn', 'hit: provider preserved')
  assert.equal(injected.model, 'deepseek-v4-flash', 'hit: model preserved')

  // Present -> overridden with the registered value.
  reg.register('child-c', 'high')
  const overridden = await ctx.waterfall('agent/request', requestPayload('child-c'), () =>
    Promise.resolve(baseConfig({ reasoningEffort: 'medium' })),
  )
  assert.equal(overridden.reasoningEffort, 'high', 'hit: existing reasoningEffort overridden')
  console.log('PASS map hit: reasoningEffort injected / overridden to the registered value')
}

// ---------------------------------------------------------------------------
// Group 2c — next() is always called (waterfall contract), on every path.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  const reg = installEffortInjection(ctx)
  let calls = 0
  const spyNext = () => {
    calls++
    return Promise.resolve(baseConfig())
  }
  await ctx.waterfall('agent/request', requestPayload('child-d'), spyNext) // miss
  assert.equal(calls, 1, 'next() called on miss')
  reg.register('child-d', 'off')
  await ctx.waterfall('agent/request', requestPayload('child-d'), spyNext) // hit
  assert.equal(calls, 2, 'next() called on hit too — short-circuit would break the chain')
  console.log('PASS next() always called (spy): miss and hit paths both delegate')
}

// ---------------------------------------------------------------------------
// Group 2d — forget: the same id is no longer injected afterwards.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  const reg = installEffortInjection(ctx)
  reg.register('child-e', 'high')
  const before = await ctx.waterfall('agent/request', requestPayload('child-e'), () =>
    Promise.resolve(baseConfig()),
  )
  assert.equal(before.reasoningEffort, 'high', 'forget: injection active before forget')

  reg.forget('child-e')
  const after = await ctx.waterfall('agent/request', requestPayload('child-e'), () =>
    Promise.resolve(baseConfig({ reasoningEffort: 'low' })),
  )
  assert.equal(after.reasoningEffort, 'low', 'forget: same id falls back to the loop config')
  assert.doesNotThrow(() => reg.forget('never-registered'), 'forget: unknown id is a no-op')
  console.log('PASS forget: same id no longer injected after settle')
}

// ---------------------------------------------------------------------------
// Wiring sanity — apply()-installed registry is reachable module-level.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  const reg = installEffortInjection(ctx)
  assert.equal(getEffortRegistry(), reg, 'getEffortRegistry returns the latest installed registry')
  console.log('PASS getEffortRegistry exposes the installed instance')
}
