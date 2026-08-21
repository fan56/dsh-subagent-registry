// Smoke test for the plugin entry point `apply()` — the only test that
// exercises src/index.ts itself. Every other file tests the pieces directly,
// so deleting the `installEffortInjection(ctx)` line from apply() would leave
// them all green; this one fails if that wiring disappears. Asserts that a
// mock ctx gets: an `agent/request` listener, a live module-level effort
// registry (register/forget usable end to end), and the `use_agent` tool —
// on both the provider-present and provider-deferred registration paths.
// Run: node test/apply-smoke.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getEffortRegistry } from '../lib/effort-inject.js'
import { apply } from '../lib/index.js'

// Fresh-process precondition: nothing has installed a registry yet, so any
// assertion below that finds one proves apply() put it there.
assert.equal(getEffortRegistry(), undefined, 'precondition: no registry before apply()')

/**
 * Minimal cordis ctx double for apply(): records event listeners, effects,
 * and tool registrations; composes `agent/request` waterfalls
 * outermost-first like the real event service. `providerNames` models the
 * live provider registry so a test can register a provider after apply()
 * (the deferred path re-checks getProvider when the event fires).
 */
function mockCtx({ providerNames = [] } = {}) {
  const listeners = []
  const registeredTools = []
  const effects = []
  const providers = new Set(providerNames)
  return {
    listeners,
    registeredTools,
    effects,
    on(name, listener) {
      listeners.push({ name, listener })
      return () => true
    },
    effect(fn, name) {
      effects.push(name)
      fn()
    },
    subagents: {
      getProvider: (name) => (providers.has(name) ? { name } : undefined),
    },
    tools: {
      register: (tool) => registeredTools.push(tool),
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

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-apply-smoke-'))
writeFileSync(
  join(AGENTS_DIR, 'smoke.md'),
  '---\nname: smoke\ndescription: "smoke agent"\nthinking: high\n---\nBody.\n',
)

// ---------------------------------------------------------------------------
// Provider already present: tool registers synchronously via ctx.effect.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx({ providerNames: ['spawn'] })
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })

  // The injection is wired: an agent/request listener sits on the ctx.
  assert.ok(
    ctx.listeners.some((l) => l.name === 'agent/request'),
    'apply() registered an agent/request listener',
  )

  // ...and the module-level registry is live and usable end to end.
  const reg = getEffortRegistry()
  assert.notEqual(reg, undefined, 'getEffortRegistry() returns a registry after apply()')
  assert.equal(typeof reg.register, 'function', 'registry.register is callable')
  assert.equal(typeof reg.forget, 'function', 'registry.forget is callable')
  reg.register('smoke-child', 'high')
  const stamped = await ctx.waterfall('agent/request', { agent: { id: 'smoke-child' } }, () =>
    Promise.resolve({ model: 'm' }),
  )
  assert.equal(stamped.reasoningEffort, 'high', 'registered child id gets its effort stamped')
  reg.forget('smoke-child')
  const cleared = await ctx.waterfall('agent/request', { agent: { id: 'smoke-child' } }, () =>
    Promise.resolve({ model: 'm' }),
  )
  assert.equal(cleared.reasoningEffort, undefined, 'forget() stops the injection')

  // The use_agent tool itself was registered under the configured name.
  assert.equal(ctx.registeredTools.length, 1, 'use_agent tool registered')
  assert.equal(ctx.registeredTools[0].name, 'use_agent', 'tool carries the configured name')
  console.log('PASS apply(): agent/request listener + usable registry + tool registered')
}

// ---------------------------------------------------------------------------
// Provider absent: tool registration defers to subagent/provider-added, but
// the effort injection must still be installed immediately.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  assert.equal(ctx.registeredTools.length, 0, 'no tool before the provider exists')
  assert.notEqual(getEffortRegistry(), undefined, 'injection installed even while tool waits')
  const added = ctx.listeners.find((l) => l.name === 'subagent/provider-added')
  assert.ok(added, 'waits on subagent/provider-added when the provider is missing')
  ctx.subagents.getProvider = () => ({ name: 'spawn' }) // provider shows up later
  added.listener()
  assert.equal(ctx.registeredTools.length, 1, 'tool registers once the provider appears')
  console.log('PASS apply(): deferred path still installs the injection, then registers the tool')
}

rmSync(AGENTS_DIR, { recursive: true, force: true })

console.log('\nAll apply-smoke assertions passed.')
