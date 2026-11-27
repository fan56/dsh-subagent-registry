// registry-acp provider lifecycle through the real plugin entry point:
// opt-in registration, effect-owned disposer, duplicate-name warning,
// bounded wait for in-flight activations, and re-registration after unload.
// Run: node test/provider-lifecycle.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, Config } from '../lib/index.js'

const DIR = mkdtempSync(join(tmpdir(), 'provider-lifecycle-'))

function mockCtx({ names = ['spawn'], warnings = [], resolveExecutable } = {}) {
  const providers = new Map(names.map((name) => [name, { name }]))
  const effects = new Map()
  const listeners = []
  const ctx = {
    providers,
    effects,
    listeners,
    warnings,
    logger: { warn: (line) => warnings.push(line) },
    on(name, listener) { listeners.push({ name, listener }); return () => {} },
    effect(fn, name) {
      const disposer = fn()
      effects.set(name, typeof disposer === 'function' ? disposer : () => {})
      return () => {}
    },
    subagents: {
      getProvider(name) { return providers.get(name) },
      registerProvider(provider) {
        if (providers.has(provider.name)) {
          throw new Error(`a subagent provider named "${provider.name}" is already registered`)
        }
        providers.set(provider.name, provider)
        return () => { providers.delete(provider.name) }
      },
      startActivation: async () => { throw new Error('no dispatch in the lifecycle test') },
    },
    tools: { register: () => () => {} },
    skills: {
      registerProvider(create) {
        create({ signal: new AbortController().signal, invalidate() {} })
        return () => {}
      },
    },
    get(name) {
      if (name === 'logger') return { warn: (line) => warnings.push(line) }
      return undefined
    },
    inject(deps, callback) {
      if (!deps.includes('subprocess')) return
      callback({
        subprocess: {
          resolveExecutable: resolveExecutable ?? (async () => '/usr/local/bin/agy'),
          spawn: () => { throw new Error('no spawn in the lifecycle test') },
        },
      })
    },
  }
  return ctx
}

function config(overrides = {}) {
  return {
    agentsDir: DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
    ...overrides,
  }
}

const PROVIDER_EFFECT = 'dsh-subagent-registry:acp-provider'
const disposeProvider = (ctx) => ctx.effects.get(PROVIDER_EFFECT)()

// --- schema defaults: five keys, only the master switch non-volatile --------

{
  const defaults = Config({})
  assert.equal(defaults.agyEnabled, false, 'master switch is a plain boolean (non-volatile)')
  assert.equal(defaults.agyPermission.get(), 'reject')
  assert.equal(defaults.agyTimeoutMs.get(), 600000)
  assert.equal(defaults.agyHandshakeTimeoutMs.get(), 20000)
  assert.equal(defaults.agyMaxConcurrent.get(), 1)
  assert.equal(typeof defaults.agyEnabled.get, 'undefined', 'only the four tuning keys are volatile')
  console.log('PASS Config: five agy keys with the specified defaults')
}

// --- switch off: no provider effect, no registry-acp registration -----------

{
  const ctx = mockCtx()
  apply(ctx, config())
  assert.equal(ctx.effects.has(PROVIDER_EFFECT), false)
  assert.equal(ctx.providers.has('registry-acp'), false)
  console.log('PASS switch off: no provider registered')
}

// --- switch on: effect-owned registration and clean unregister --------------

{
  const ctx = mockCtx()
  apply(ctx, config({ agyEnabled: true }))
  assert.equal(ctx.effects.has(PROVIDER_EFFECT), true, 'registration wrapped in a named effect')
  const provider = ctx.providers.get('registry-acp')
  assert.equal(provider?.name, 'registry-acp')
  for (const key of ['agentOptions', 'agentPreset', 'outputSchema', 'depthLimit']) {
    assert.equal(provider.capabilities[key], false, `one-shot provider advertises no ${key}`)
  }
  assert.equal(provider.inheritsParentContext, false)
  await disposeProvider(ctx)
  assert.equal(ctx.providers.has('registry-acp'), false, 'disposer unregisters the provider')
  console.log('PASS switch on: effect registration + unregister on dispose')
}

// --- duplicate name: warn, keep mounting, do not replace the twin ----------

{
  const twin = { name: 'registry-acp', marker: 'twin' }
  const warnings = []
  const ctx = mockCtx({ names: ['spawn', 'registry-acp'], warnings })
  // Seed the real object under the same key so the pre-check sees it.
  ctx.providers.set('registry-acp', twin)
  assert.doesNotThrow(() => apply(ctx, config({ agyEnabled: true })))
  assert.equal(ctx.providers.get('registry-acp'), twin, 'the existing provider is untouched')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /already taken/)
  console.log('PASS duplicate name: warning only, no crash')
}

// --- unload waits for in-flight activation (bounded) ------------------------

{
  const ctx = mockCtx()
  apply(ctx, config({ agyEnabled: true }))
  const provider = ctx.providers.get('registry-acp')
  provider.active = 1
  setTimeout(() => { provider.active = 0 }, 80)
  const started = Date.now()
  await disposeProvider(ctx)
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 60, `disposer waited for the active run (${elapsed}ms)`)
  assert.ok(elapsed < 9000, 'bounded by the 9s exit grace')
  assert.equal(ctx.providers.has('registry-acp'), false)
  console.log(`PASS unload: waited ${elapsed}ms for the active run before unregistering`)
}

// --- re-registration after unload does not throw DUPLICATE_PROVIDER ---------

{
  const ctx = mockCtx()
  apply(ctx, config({ agyEnabled: true }))
  await disposeProvider(ctx)
  let second
  assert.doesNotThrow(() => {
    apply(ctx, config({ agyEnabled: true }))
    second = ctx.providers.get('registry-acp')
  })
  assert.equal(second?.name, 'registry-acp', 're-registration succeeds')
  await disposeProvider(ctx)
  console.log('PASS re-registration: no DUPLICATE_PROVIDER after plugin unload')
}

rmSync(DIR, { recursive: true, force: true })
console.log('\nAll provider-lifecycle assertions passed.')
