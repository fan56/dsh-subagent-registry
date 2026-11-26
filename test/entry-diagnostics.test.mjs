// Release hardening: mandatory spawn-tool deny diagnostics, deprecation
// warnings for inert nesting fields, and the agent-tool-only entry surface.
// No LLM, no real host. Run: node test/entry-diagnostics.test.mjs (after build).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import {
  delegationDeprecationMessage,
  deprecatedDelegationFields,
  leafDenyList,
  missingSpawnTools,
  spawnToolWarningMessage,
  warnDeprecatedDelegation,
  warnMissingSpawnTools,
  SPAWN_TOOL_NAMES,
} from '../lib/tool-run-agent.js'
import { installChildCompositionListener, reserveChildComposition } from '../lib/host-compat.js'
import * as Public from '../lib/index.js'

const MANDATORY = [...SPAWN_TOOL_NAMES]

// ---------------------------------------------------------------------------
// 1. Every mandatory name present at the top level is absent on the child.
// ---------------------------------------------------------------------------
{
  const known = new Set([...MANDATORY, 'use_agent', 'read', 'write'])
  const deny = leafDenyList('use_agent', [], known)
  assert.deepEqual(deny, [...MANDATORY, 'use_agent'], 'all mandatory names survive when the host registers them')
  for (const name of MANDATORY) assert.ok(known.has(name), `top level exposes ${name}`)

  const child = {
    id: 'child-deny',
    ctx: {
      systemPrompt: { getSectionOrder: () => 0, section() {} },
      tools: {
        view: () => ({ restrictableNames: known }),
        restrict(filter) { for (const name of filter.deny ?? []) known.delete(name) },
        get(name) { return known.has(name) ? { execute: async () => 'SPAWNED' } : undefined },
      },
    },
  }
  const listeners = new Map()
  const ctx = {
    subagents: { startActivation: async () => ({}) },
    agents: { get: id => id === child.id ? child : undefined },
    on(name, cb) {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set); set.add(cb)
      return () => set.delete(cb)
    },
  }
  const release = installChildCompositionListener(ctx)
  reserveChildComposition(child.id, 'parent', { persona: 'b', toolFilter: { deny } })
  for (const cb of listeners.get('subagent/start') ?? []) cb({ id: child.id })
  for (const name of MANDATORY) {
    assert.equal(known.has(name), false, `child does not expose mandatory spawner ${name}`)
    assert.equal(child.ctx.tools.get(name), undefined, `child has no ${name} handle`)
  }
  assert.equal(known.has('use_agent'), false, 'child does not expose the registry tool')
  assert.deepEqual([...known].sort(), ['read', 'write'], 'non-spawn tools survive')
  release()
  console.log('PASS every mandatory name present at the top level is absent on the child')
}

// ---------------------------------------------------------------------------
// 2. A mandatory name missing at the top level WARNS (no silent ∩ drop).
// ---------------------------------------------------------------------------
{
  const known = new Set(['subagent', 'use_agent', 'read'])
  const missing = missingSpawnTools(known)
  assert.deepEqual(missing, MANDATORY.filter(name => name !== 'subagent'), 'reports exactly the dropped mandatory names')
  assert.ok(missing.includes('subagent_fork') && missing.includes('ralph'), 'fork and ralph are not silently lost')
  const message = spawnToolWarningMessage(missing)
  for (const name of missing) assert.ok(message.includes(name), `warning names ${name}`)
  assert.match(message, /deny list/, 'warning explains the deny-list consequence')

  const warnings = []
  const ctx = { logger: { warn(text) { warnings.push(text) } } }
  warnMissingSpawnTools(ctx, known)
  assert.deepEqual(warnings, [message], 'one actionable warning via ctx.logger.warn')
  // The intersection still drops them (fail-fast restrict); the difference is
  // that the drop is now reported instead of silent.
  assert.deepEqual(leafDenyList('use_agent', [], known), ['subagent', 'use_agent'], 'intersection unchanged')

  assert.deepEqual(warnings, [message], 'no warning when the full set is registered')
  warnMissingSpawnTools(ctx, new Set([...MANDATORY, 'use_agent']))
  assert.equal(warnings.length, 1, 'no warning when every mandatory name is present')
  warnMissingSpawnTools(ctx, undefined)
  assert.equal(warnings.length, 1, 'no warning when no host view exists (nothing was intersected)')

  const fallback = []
  const original = console.warn
  console.warn = (text) => fallback.push(String(text))
  try {
    warnMissingSpawnTools({}, known)
  } finally {
    console.warn = original
  }
  assert.deepEqual(fallback, [message], 'console.warn fallback when the host has no logger')
  console.log('PASS mandatory names missing at top level produce a warning, not a silent drop')
}

// ---------------------------------------------------------------------------
// 3. `deep` / `maxDepth` deprecation warning; fields remain inert.
// ---------------------------------------------------------------------------
{
  const explicit = parseAgentMarkdown('---\nname: worker\ndeep: 2\n---\nbody\n', '/fake/worker.md')
  assert.equal(explicit.ok, true)
  assert.equal(explicit.agent.meta.deep, 2, 'deep still parsed')
  assert.equal(explicit.agent.meta.deepDeclared, true, 'explicit declaration is recorded')
  const implicit = parseAgentMarkdown('---\nname: worker\n---\nbody\n', '/fake/worker.md')
  assert.equal(implicit.agent.meta.deep, 1, 'default deep still 1')
  assert.equal(implicit.agent.meta.deepDeclared, undefined, 'no warning for an undeclared default')

  assert.deepEqual(deprecatedDelegationFields({ deepDeclared: true, maxDepth: 3 }), ['deep', 'maxDepth'])
  assert.deepEqual(deprecatedDelegationFields({}), [])
  const message = delegationDeprecationMessage(['deep', 'maxDepth'])
  assert.match(message, /deprecated and inert/, 'message states inertness')
  assert.match(message, /deep.*maxDepth/, 'message names both fields')

  const warnings = []
  const ctx = { logger: { warn(text) { warnings.push(text) } } }
  warnDeprecatedDelegation(ctx, { deepDeclared: true, maxDepth: 3 })
  assert.deepEqual(warnings, [message])
  warnDeprecatedDelegation(ctx, { deepDeclared: false })
  assert.equal(warnings.length, 1, 'no warning for an inert-but-undeclared field')
  console.log('PASS explicit deep/maxDepth warn; parser default stays quiet and fields stay inert')
}

// ---------------------------------------------------------------------------
// 4. Only the agent tool is an entry point — no CLI/API/direct export.
// ---------------------------------------------------------------------------
{
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(pkg.bin, undefined, 'no CLI binary entry')
  assert.deepEqual(Object.keys(pkg.exports).sort(), [
    '.', './client', './legacy-subagent-list-agents', './package.json',
  ], 'no start/resume subpath is exported')
  assert.equal(Public.runAgentTool, undefined, 'handler factory is not a package export')
  assert.equal(Public.driveResumedRun, undefined, 'resume driver is not a package export')
  assert.equal(Public.startActivation, undefined, 'host start seam is not a package export')
  assert.equal(Public.assertTopLevelCaller !== undefined, true, 'only the guard code/constant is exported')

  const entry = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
  assert.match(entry, /Entry surface: agent tools only/, 'entry-surface contract is documented in source')
  const sources = ['tool-run-agent.ts', 'resume.ts', 'caller-guard.ts']
  for (const name of sources) {
    const code = readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')
    assert.doesNotMatch(code, /process\.argv/, `${name}: no CLI argument parsing`)
    assert.doesNotMatch(code, /createServer|\.listen\(/, `${name}: no HTTP/API server`)
  }
  console.log('PASS entry surface: agent tool only, no CLI/API or direct handler export')
}

console.log('\nAll entry-diagnostics assertions passed.')
