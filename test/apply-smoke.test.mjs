// Smoke test for the plugin entry point `apply()` — the only test that
// exercises src/index.ts itself. Every other file tests the pieces directly,
// so deleting the tool-registration wiring from apply() would leave them all
// green; this one fails if that wiring disappears. Asserts that a mock ctx
// gets the `use_agent` tool on both the provider-present (synchronous
// ctx.effect) and provider-deferred (subagent/provider-added listener) paths,
// and that nothing else leaks onto the ctx event bus.
// Run: node test/apply-smoke.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

/**
 * Minimal cordis ctx double for apply(): records event listeners, effects,
 * and tool registrations. `providerNames` models the live provider registry
 * so a test can register a provider after apply() (the deferred path
 * re-checks getProvider when the event fires).
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

  // The use_agent tool was registered under the configured name, once.
  assert.equal(ctx.registeredTools.length, 1, 'use_agent tool registered')
  assert.equal(ctx.registeredTools[0].name, 'use_agent', 'tool carries the configured name')
  assert.deepEqual(ctx.effects, ['dsh-subagent-registry:use_agent'], 'registration wrapped in a named effect')

  // No stray listeners: apply() must not wire anything onto the event bus.
  assert.equal(ctx.listeners.length, 0, 'no event-bus listeners on the synchronous path')
  console.log('PASS apply(): tool registered synchronously when the provider exists')
}

// ---------------------------------------------------------------------------
// Provider absent: tool registration defers to subagent/provider-added.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  assert.equal(ctx.registeredTools.length, 0, 'no tool before the provider exists')
  const added = ctx.listeners.find((l) => l.name === 'subagent/provider-added')
  assert.ok(added, 'waits on subagent/provider-added when the provider is missing')
  ctx.subagents.getProvider = () => ({ name: 'spawn' }) // provider shows up later
  added.listener()
  assert.equal(ctx.registeredTools.length, 1, 'tool registers once the provider appears')
  console.log('PASS apply(): deferred path registers the tool when the provider appears')
}

// ---------------------------------------------------------------------------
// Deferred path with a never-arriving provider: the listener stays armed and
// a spurious event for a different provider does not register anything.
// ---------------------------------------------------------------------------

{
  const ctx = mockCtx()
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'fork', toolName: 'use_agent' })
  const added = ctx.listeners.find((l) => l.name === 'subagent/provider-added')
  ctx.subagents.getProvider = (name) => (name === 'spawn' ? { name: 'spawn' } : undefined)
  added.listener()
  assert.equal(ctx.registeredTools.length, 0, 'a different provider appearing does not register the tool')
  console.log('PASS apply(): deferred path ignores unrelated providers')
}

rmSync(AGENTS_DIR, { recursive: true, force: true })

console.log('\nAll apply-smoke assertions passed.')
