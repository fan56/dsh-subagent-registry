// The ptcEnabled gate on the codemode tool registration: false (the default)
// mounts nothing extra; true registers the codemode tool at standing scope
// through the named effect; the volatile jev keys tolerate plain (non-ref)
// values so hand-built configs work like the loader's volatile refs.
// Run: node test/ptc-gating.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

/** Mock ctx in the apply-smoke shape, extended with a fake PTC runtime. */
function mockCtx({ providerNames = [], runtime } = {}) {
  const listeners = []
  const registeredTools = []
  const registeredSkillProviders = []
  const effects = []
  const providers = new Set(providerNames)
  return {
    listeners,
    registeredTools,
    registeredSkillProviders,
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
    skills: {
      registerProvider(create) {
        const provider = create({ signal: new AbortController().signal, invalidate() {} })
        registeredSkillProviders.push(provider)
        return () => {}
      },
    },
    ptcRuntime: runtime,
  }
}

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-ptc-gating-'))

// --- default (no ptcEnabled): no codemode tool, no codemode effect ---

{
  const ctx = mockCtx({ providerNames: ['spawn'] })
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
  assert.deepEqual(
    ctx.registeredTools.map((tool) => tool.name),
    ['use_agent', 'ask_agent'],
    'default mount registers only the dispatch pair',
  )
  assert.ok(!ctx.effects.includes('dsh-subagent-registry:codemode'), 'no codemode effect by default')
  // Explicit false is identical.
  const off = mockCtx({ providerNames: ['spawn'] })
  apply(off, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent', ptcEnabled: false })
  assert.ok(!off.effects.includes('dsh-subagent-registry:codemode'), 'ptcEnabled: false mounts nothing')
  console.log('PASS default/explicit-false: codemode tool not registered')
}

// --- ptcEnabled: true registers the codemode tool via the named effect ---

{
  const runtime = {
    resolve(request) {
      return { ...request, cwd: '/fake', timeoutMs: request.timeoutMs ?? 60000 }
    },
    async run(spec) {
      const storeNs = spec.bindings.find((ns) => ns.global === 'store')
      const jevNs = spec.bindings.find((ns) => ns.global === 'jev')
      // The bindings pair is assembled per run (jev + store), and the store
      // writes ride the executing agent's session.
      assert.ok(jevNs && typeof jevNs.functions.classify === 'function', 'jev binding present')
      return { value: { ok: 1, store: storeNs !== undefined }, logs: [] }
    },
  }
  const ctx = mockCtx({ providerNames: ['spawn'], runtime })
  apply(ctx, {
    agentsDir: AGENTS_DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    ptcEnabled: true,
    // Plain values (not volatile refs): the asVolatileRef normalization wraps
    // them — the same config shape tests and older loaders produce.
    jevEnabled: true,
    jevBackend: 'zen',
    jevModel: '',
    jevTimeoutMs: 3000,
    jevSecretFile: '',
    storageDir: join(AGENTS_DIR, 'usage-override'),
  })
  assert.ok(ctx.effects.includes('dsh-subagent-registry:codemode'), 'the codemode effect carries the stable label')
  const codemode = ctx.registeredTools.find((tool) => tool.name === 'codemode')
  assert.ok(codemode, 'the codemode tool is registered on the shared registry')
  assert.match(codemode.description, /jev/)
  assert.match(codemode.description, /store/)
  // The tool actually runs against the injected runtime seam.
  const exec = { signal: new AbortController().signal, agent: { id: 'a', session: { append() {}, snapshotEvents() { return [] } } } }
  const out = await codemode.execute({ program: 'return 1' }, exec)
  assert.equal(out.value.ok, 1, 'the program ran through the public runtime seam')
  assert.equal(out.storeWrites, 0)
  console.log('PASS ptcEnabled: true registers and runs the codemode tool at standing scope')
}

// --- enabled without a mounted runtime: registration succeeds, the call errors clearly ---

{
  const ctx = mockCtx({ providerNames: ['spawn'] }) // no ptcRuntime
  apply(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent', ptcEnabled: true })
  const codemode = ctx.registeredTools.find((tool) => tool.name === 'codemode')
  assert.ok(codemode, 'registration does not require the runtime (no static inject)')
  const exec = { signal: new AbortController().signal, agent: { id: 'a', session: undefined } }
  await assert.rejects(
    () => codemode.execute({ program: 'return 1' }, exec),
    /no PTC runtime is mounted/,
    'the runtime guard stays at call time with the friendly misconfiguration error',
  )
  console.log('PASS missing runtime: loud at the call, not at the mount')
}

rmSync(AGENTS_DIR, { recursive: true, force: true })

console.log('\nAll ptc-gating assertions passed.')
