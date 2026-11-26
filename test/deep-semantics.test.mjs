// `deep` is inert; every child loses all spawn tools; plain foreground returns
// A's own output verbatim (no join, no aggregation). No LLM, no real host.
// Run: node test/deep-semantics.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import {
  buildStartRequest,
  leafDenyList,
  runAgentTool,
  SPAWN_TOOL_NAMES,
} from '../lib/tool-run-agent.js'
import { installChildCompositionListener, reserveChildComposition } from '../lib/host-compat.js'

const MANDATORY = ['subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code', 'workflow', 'ralph']
const MD = (extra) => `---
name: workhorse
description: "demo agent"
model: opencode-go/deepseek-v4-flash
${extra}---
You are the body of the agent.
Line two.`

/** A fake delegating parent whose session header carries the delegation depth. */
const parentAtDepth = (depth) => ({ id: 'parent', options: {}, session: { header: { delegationDepth: depth }, requestHeader: () => undefined } })

// ---------------------------------------------------------------------------
// 1. `deep` parses (for compatibility) but produces no maxDepth / no nesting.
// ---------------------------------------------------------------------------
for (const [label, extra, expectedDeep] of [
  ['deep=0', 'deep: 0\n', 0],
  ['deep=1', 'deep: 1\n', 1],
  ['deep=2', 'deep: 2\n', 2],
  ['no deep key', '', 1],
]) {
  const parsed = parseAgentMarkdown(MD(extra), '/fake/workhorse.md')
  assert.equal(parsed.ok, true, `${label}: parse ok`)
  assert.equal(parsed.agent.meta.deep, expectedDeep, `${label}: deep still parsed as a compatibility field`)
  const req = buildStartRequest({
    agentName: 'workhorse', prompt: 'do the thing', parent: parentAtDepth(1),
    persona: parsed.agent.body, deep: parsed.agent.meta.deep, toolName: 'use_agent',
    model: parsed.agent.meta.model,
  })
  assert.equal(req.maxDepth, undefined, `${label}: no maxDepth — no nested spawn budget`)
  assert.ok(req.toolFilter, `${label}: every child gets a toolFilter`)
  for (const name of [...MANDATORY, 'use_agent']) {
    assert.ok(req.toolFilter.deny.includes(name), `${label}: deny includes ${name}`)
  }
  assert.equal(req.persona, parsed.agent.body, `${label}: persona is the body verbatim`)
  console.log(`PASS ${label}: deep parsed as ${expectedDeep}, no maxDepth, spawn tools denied`)
}

// ---------------------------------------------------------------------------
// 2. Deny list: mandatory ∪ config, deduped, intersected with host-known names.
// ---------------------------------------------------------------------------
{
  assert.deepEqual([...SPAWN_TOOL_NAMES], MANDATORY, 'mandatory spawn-tool names cover every spawner')
  const plain = leafDenyList('use_agent')
  assert.deepEqual(plain, [...MANDATORY, 'use_agent'], 'default = mandatory names + this tool')

  const custom = leafDenyList('my_agent', ['extra_spawner', 'subagent', 'use_agent'])
  assert.deepEqual(custom, [...MANDATORY, 'my_agent', 'extra_spawner', 'use_agent'],
    'extra names are unioned, not substituted; duplicates collapse')
  assert.ok(custom.includes('my_agent'), 'customized registry tool name is always denied')

  const onlyKnown = leafDenyList('use_agent', ['unknown_spawner'], new Set(['subagent', 'use_agent', 'read']))
  assert.deepEqual(onlyKnown, ['subagent', 'use_agent'],
    'host-known intersection avoids tools.restrict() fail-fast on unknown names')

  const req = buildStartRequest({
    agentName: 'x', prompt: 'p', parent: parentAtDepth(3), persona: 'b', deep: 2,
    toolName: 'use_agent', leafDenyTools: ['extra_spawner'],
    hostKnownTools: new Set(['subagent', 'use_agent', 'extra_spawner']),
  })
  assert.deepEqual([...req.toolFilter.deny], ['subagent', 'use_agent', 'extra_spawner'])
  assert.equal(req.maxDepth, undefined)
  console.log('PASS deny list = mandatory ∪ config, intersected with host-known names')
}

// ---------------------------------------------------------------------------
// 3. The installed child schema has no spawn tool; a direct execute is refused.
// ---------------------------------------------------------------------------
{
  const deny = leafDenyList('use_agent')
  const known = new Set([...MANDATORY, 'use_agent', 'read', 'write'])
  const child = {
    id: 'child-1',
    ctx: {
      systemPrompt: { getSectionOrder: () => 0, section() {} },
      tools: {
        view: () => ({ restrictableNames: known }),
        restrict(filter) { for (const name of filter.deny ?? []) known.delete(name) },
        get(name) { return known.has(name) ? { execute: async () => 'SHOULD_NOT_RUN' } : undefined },
      },
    },
  }
  const listeners = new Map()
  const ctx = {
    subagents: { startActivation: async () => ({}) },
    agents: { get: (id) => id === child.id ? child : undefined },
    on(name, cb) {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set); set.add(cb)
      return () => set.delete(cb)
    },
  }
  const release = installChildCompositionListener(ctx)
  reserveChildComposition(child.id, 'parent', { persona: 'b', toolFilter: { deny } })
  for (const cb of listeners.get('subagent/start') ?? []) cb({ id: child.id })
  for (const name of [...MANDATORY, 'use_agent']) {
    assert.equal(known.has(name), false, `child schema drops ${name}`)
  }
  assert.deepEqual([...known].sort(), ['read', 'write'], 'non-spawn tools survive')
  assert.equal(child.ctx.tools.get('use_agent'), undefined, 'no direct execute handle for a spawn tool')
  await assert.rejects(
    Promise.resolve().then(() => child.ctx.tools.get('use_agent').execute({}, {})),
    TypeError,
    'a child cannot execute a spawn tool directly',
  )
  release()
  console.log('PASS child schema has no spawn tool; direct execute refused')
}

// ---------------------------------------------------------------------------
// 4. Plain foreground: A's output verbatim, synchronous cancel, isolation.
// ---------------------------------------------------------------------------
const agentsDir = mkdtempSync(join(tmpdir(), 'registry-deep-inert-'))
writeFileSync(join(agentsDir, 'worker.md'), '---\nname: worker\nmodel: probe/worker\n---\nworker persona\n')
const PARENT = parentAtDepth(0)

function foregroundHost() {
  const runs = []
  const disposed = []
  const ctx = {
    started: runs,
    disposed,
    subagents: {
      // The descendant runtime is gone: even a host exposing the tree seam is
      // never asked to join, drain or resolve a tree root.
      waitForTreeWork: async () => { throw new Error('descendant join must not be used') },
      drainDescendants: async () => { throw new Error('descendant drain must not be used') },
      rootOf: () => { throw new Error('descendant root probe must not be used') },
      startActivation: async (spec) => {
        let resolve
        const result = new Promise((res) => { resolve = res })
        const run = { spec, result, resolve }
        runs.push(run)
        return { childId: `child-${runs.length}`, result, dispose: async () => { disposed.push(run) } }
      },
    },
    get: () => undefined,
    agents: { get: () => undefined },
    on: () => () => {},
  }
  return ctx
}

const toolOf = (ctx) => runAgentTool(ctx, { agentsDir, provider: 'spawn', toolName: 'use_agent' })
const call = (ctx, signal) => toolOf(ctx).execute(
  { agent: 'worker', prompt: 'p', fresh: true },
  { agent: PARENT, signal: signal ?? new AbortController().signal },
)

{
  const ctx = foregroundHost()
  const own = [{ type: 'text', text: 'A_ONLY' }, { type: 'json', data: { a: 1 } }]
  const pending = call(ctx)
  ctx.started[0].resolve({ stopReason: 'completed', output: own })
  const out = await pending
  assert.deepEqual(out.output, own, 'A output returned verbatim (no provenance, no aggregation)')
  assert.equal(ctx.disposed.length, 1, 'activation disposed once')
  console.log('PASS plain foreground returns A output verbatim')
}

{
  const ctx = foregroundHost()
  const controller = new AbortController()
  const pending = call(ctx, controller.signal)
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await assert.rejects(pending, (error) => error.name === 'AbortError', 'abort rejects synchronously with AbortError')
  // The result never settles: a rejected foreground cannot hang on it.
  assert.equal(ctx.disposed.length, 1, 'aborted activation disposed once')
  console.log('PASS abort rejects immediately and disposes idempotently')
}

{
  // Non-deep abort (worker.md has no `deep` key): the model turn is
  // interrupted, the caller rejects synchronously without waiting for A's
  // result, and the run settles exactly once.
  const ctx = foregroundHost()
  const controller = new AbortController()
  let callerSettles = 0
  const pending = call(ctx, controller.signal).then(
    () => { callerSettles += 1; throw new Error('abort must reject') },
    (error) => { callerSettles += 1; return error },
  )
  await new Promise(resolve => setImmediate(resolve))
  const hung = ctx.started[0].result
  let turnSettled = false
  void hung.then(() => { turnSettled = true }, () => { turnSettled = true })
  controller.abort()
  const error = await Promise.race([
    pending,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('abort did not reject synchronously')), 100)),
  ])
  assert.equal(error.name, 'AbortError', 'non-deep abort rejects with AbortError')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(turnSettled, false, 'the interrupted A model turn never settles')
  assert.equal(callerSettles, 1, 'the caller settles exactly once')
  assert.equal(ctx.disposed.length, 1, 'the activation is disposed exactly once')
  console.log('PASS non-deep abort: A turn interrupted, synchronous reject, single settle')
}

{
  const ctx = foregroundHost()
  const first = call(ctx)
  const second = call(ctx)
  assert.equal(ctx.started.length, 2, 'two independent activations')
  ctx.started[1].resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'SECOND' }] })
  assert.deepEqual((await second).output, [{ type: 'text', text: 'SECOND' }])
  ctx.started[0].resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'FIRST' }] })
  assert.deepEqual((await first).output, [{ type: 'text', text: 'FIRST' }])
  assert.equal(ctx.disposed.length, 2, 'each concurrent run disposes exactly its own activation')
  console.log('PASS concurrent foreground runs stay isolated')
}

rmSync(agentsDir, { recursive: true, force: true })
console.log('\nAll deep-inert / child-deny assertions passed.')
