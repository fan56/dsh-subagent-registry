// Nested-delegation guard: identity fails closed at every registry handler
// that can start or resume an agent. No LLM, no real host.
// Run: node test/caller-guard.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertTopLevelCaller,
  isRegistryChild,
  NestedDelegationError,
  NESTED_DELEGATION_ERROR_CODE,
  recordRegistryChild,
  REGISTRY_DELEGATION_ENTRY_POINTS,
  releaseRegistryChild,
} from '../lib/caller-guard.js'
import * as Public from '../lib/index.js'
import { runAgentTool, SPAWN_TOOL_NAMES } from '../lib/tool-run-agent.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const CODE = NESTED_DELEGATION_ERROR_CODE
assert.equal(CODE, 'DSH_REGISTRY_NESTED_DELEGATION_UNSUPPORTED')
assert.equal(Public.NESTED_DELEGATION_ERROR_CODE, CODE)
assert.deepEqual(Public.REGISTRY_DELEGATION_ENTRY_POINTS, [...REGISTRY_DELEGATION_ENTRY_POINTS])

const rejectsWithCode = async (fn, hint) => {
  await assert.rejects(Promise.resolve().then(fn), (error) => {
    assert.equal(error.code, CODE, `${hint}: stable error code`)
    assert.ok(error instanceof NestedDelegationError, `${hint}: guard error type`)
    assert.match(error.message, /main conversation/, `${hint}: actionable message`)
    return true
  }, hint)
}

// ---------------------------------------------------------------------------
// 1. Identity classification
// ---------------------------------------------------------------------------
{
  const topLevel = { id: 'root-1', session: { header: {} } }
  assert.doesNotThrow(() => assertTopLevelCaller({ agent: topLevel }), 'top-level agent passes')
  assert.doesNotThrow(
    () => assertTopLevelCaller({ agent: { id: 'root-2' }, session: { header: {} } }),
    'explicit exec.session is accepted when agent carries none',
  )
  assert.equal(isRegistryChild('root-1'), false)

  // A host-forked child: not one of ours, but its session has a parent.
  const forkChild = { id: 'fork-child', session: { header: { parentSession: 'root-1', origin: 'subagent' } } }
  assert.equal(isRegistryChild('fork-child'), false, 'a host fork is not a registry child record')
  await rejectsWithCode(() => assertTopLevelCaller({ agent: forkChild }), 'host subagent_fork child')

  // A registry child: even with a header that (hypothetically) lost its
  // parentSession, the registry child record alone refuses it.
  recordRegistryChild('registry-child')
  assert.equal(isRegistryChild('registry-child'), true)
  const registryChild = { id: 'registry-child', session: { header: {} } }
  await rejectsWithCode(() => assertTopLevelCaller({ agent: registryChild }), 'registry child record')
  releaseRegistryChild('registry-child')
  assert.equal(isRegistryChild('registry-child'), false)
  assert.doesNotThrow(() => assertTopLevelCaller({ agent: registryChild }), 'release forgets the child')

  // Indeterminate identity fails closed.
  for (const [label, value] of [
    ['no exec', undefined],
    ['no agent', { signal: new AbortController().signal }],
    ['no session', { agent: { id: 'x' } }],
    ['no header', { agent: { id: 'x', session: {} } }],
    ['no id', { agent: { session: { header: {} } } }],
    ['empty id', { agent: { id: '', session: { header: {} } } }],
  ]) {
    await rejectsWithCode(() => assertTopLevelCaller(value), label)
  }
  console.log('PASS guard admits only verified top-level identities; all others fail closed')
}

// ---------------------------------------------------------------------------
// 2. No side effects: a nested caller reaches no host seam at all
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'registry-guard-'))
  writeFileSync(join(dir, 'worker.md'), '---\nname: worker\nmodel: probe/worker\n---\nbody\n')
  const touched = []
  const boom = (name) => () => { touched.push(name); throw new Error(`${name} must not be called`) }
  const ctx = {
    tools: { view: boom('tools.view') },
    subagents: {
      startActivation: boom('startActivation'),
      start: boom('start'),
      startContinuable: boom('startContinuable'),
      getProvider: boom('getProvider'),
    },
    agents: { get: boom('agents.get'), resume: boom('agents.resume') },
    on: boom('on'),
    get: boom('get'),
  }
  const tool = runAgentTool(ctx, { agentsDir: dir, provider: 'spawn', toolName: 'use_agent' })
  const signal = new AbortController().signal
  const forked = { id: 'fork-child', session: { header: { parentSession: 'root-1' } } }
  await rejectsWithCode(
    () => tool.execute({ agent: 'worker', prompt: 'p' }, { agent: forked, signal }),
    'use_agent from a host-forked child',
  )
  assert.deepEqual(touched, [], 'no host seam, file roster, record or event was touched')
  assert.equal(isRegistryChild('fork-child'), false, 'no child record written for the rejected call')
  rmSync(dir, { recursive: true, force: true })
  console.log('PASS nested execute is rejected before any host call / record / event')
}

// ---------------------------------------------------------------------------
// 3. Static guard test: no new start/resume bypass may be added
// ---------------------------------------------------------------------------
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
// Only real invocations (a receiver before the dot), never an interface
// method declaration such as `startContinuable(spec: ...)`.
const SPAWN_CALLS = [
  '\\.startActivation\\s*\\(',
  '\\.startContinuable\\s*\\(',
  '\\.agents\\.resume\\s*\\(',
  'legacySubagents\\([^)]*\\)\\.start\\s*\\(',
]

/** Source text with line and block comments removed (strings are untouched). */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const codeOf = (name) => stripComments(readFileSync(join(SRC, name), 'utf8'))
const hasSpawnCall = (code) => SPAWN_CALLS.some(pattern => new RegExp(pattern).test(code))
const guardCalls = (code) => (code.match(/assertTopLevelCaller\s*\(/g) ?? []).length

const sourceFiles = readdirSync(SRC).filter(f => f.endsWith('.ts') && f !== 'caller-guard.ts')
const guarded = []
for (const name of sourceFiles) {
  const code = codeOf(name)
  if (!hasSpawnCall(code)) continue
  assert.match(code, /assertTopLevelCaller/, `${name} imports the guard`)
  assert.ok(guardCalls(code) > 0, `${name} calls the guard before every host start/resume`)
  guarded.push(name)
}
assert.ok(guarded.includes('tool-run-agent.ts'), 'dispatch source is covered')
assert.ok(guarded.includes('resume.ts'), 'resume source is covered')

const SYMBOL_TOKEN = {
  'use_agent.execute': 'async execute(args, exec)',
  'activateWithReservedComposition': 'function activateWithReservedComposition',
  'startLegacyForeground': 'function startLegacyForeground',
  'driveResumedRun': 'function driveResumedRun',
  'driveLegacyResume': 'function driveLegacyResume',
}
const manifest = new Map()
for (const entry of REGISTRY_DELEGATION_ENTRY_POINTS) {
  const [file, symbol] = entry.split('::')
  assert.ok(file && symbol, `manifest entry is file::symbol: ${entry}`)
  const code = codeOf(file)
  assert.ok(code.includes(SYMBOL_TOKEN[symbol] ?? symbol), `${entry}: named handler exists in source`)
  assert.match(code, /assertTopLevelCaller/, `${entry}: guarded source`)
  manifest.set(file, (manifest.get(file) ?? 0) + 1)
}
for (const [file, count] of manifest) {
  const calls = guardCalls(codeOf(file))
  assert.ok(calls >= count, `${file}: ${calls} guards cover ${count} manifest entry points`)
  assert.ok(guarded.includes(file), `${file}: manifest file actually dispatches/resumes`)
}
assert.deepEqual([...manifest.keys()].sort(), ['resume.ts', 'tool-run-agent.ts'], 'manifest files are exactly the guarded dispatchers')

const entrySource = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
assert.match(entrySource, /REGISTRY_DELEGATION_ENTRY_POINTS/, 'call-site manifest is exported from the package')
assert.ok(SPAWN_TOOL_NAMES.includes('subagent_fork'), 'the host fork spawner stays in the child deny list')
console.log('PASS static guard: every start/resume call site is guarded; manifest is exported')
