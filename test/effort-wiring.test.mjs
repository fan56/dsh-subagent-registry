// Wiring verification for the frontmatter `thinking` → effort-registry path
// in the `use_agent` tool (plan §6.1 groups 3 & 4) — no LLM, no cordis
// runtime. Covers: buildStartRequest never emits an effort field (regression
// anchor: the effort travels out of band, not via agentOptions); the fresh /
// resume / resume-failed-fallback branches each register the correct child
// session id; the mapping is forgotten once the run settles; and a fixture
// without `thinking` produces zero registry calls end to end.
// Run: node test/effort-wiring.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getEffortRegistry, installEffortInjection } from '../lib/effort-inject.js'
import { buildStartRequest, runAgentTool } from '../lib/tool-run-agent.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ev = (type, data = {}) => ({ type, data })
const ERROR_LOG = [
  ev('turn/start', { turn: 1 }),
  ev('step/start', { turn: 1, step: 0 }),
  ev('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'boom' } } }),
]

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-effort-wiring-'))
writeFileSync(
  join(AGENTS_DIR, 'thinker.md'),
  '---\nname: thinker\ndescription: "demo agent with a thinking level"\nthinking: max\n---\nYou are the thinker body.\n',
)
writeFileSync(
  join(AGENTS_DIR, 'plain.md'),
  '---\nname: plain\ndescription: "demo agent without a thinking level"\n---\nYou are the plain body.\n',
)

const PARENT = { id: 'session-parent', options: {}, session: { header: { delegationDepth: 0 } } }
const EXEC = { agent: PARENT, signal: new AbortController().signal }

/** Fake ctx for the tool: resume seams + a scripted fresh-dispatch seam. */
function toolCtx({ children = [], events = {}, resume } = {}) {
  const started = []
  let freshSeq = 0
  return {
    started,
    subagents: {
      async listChildren() { return children },
      async start(provider, request) {
        started.push({ provider, request })
        const id = `fresh-child-${++freshSeq}`
        return {
          id,
          localAgent: undefined,
          result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'fresh done' }] }),
          async dispose() {},
        }
      },
    },
    get(name) {
      if (name !== 'sessionPersistence') return undefined
      return { inspect: async (id) => ({ events: events[id] ?? [] }) }
    },
    agents: resume === undefined ? undefined : { resume },
  }
}

/** A resumed-run backend double: replayed prior events + scripted continuation. */
function fakeResumeBackend(prior, scriptTurn) {
  const applied = { persona: undefined, restrict: undefined }
  const scope = {
    get() { return undefined },
    systemPrompt: {
      context() {},
      section(sec) { if (sec.name === 'deployment:persona') applied.persona = sec.text },
    },
    tools: { restrict(filter) { applied.restrict = filter } },
  }
  const child = {
    session: { events: [...prior] },
    followup(message) {
      scriptTurn?.(child.session.events)
      void message
    },
    whenIdle() { return Promise.resolve() },
    cancel() {},
  }
  return {
    applied,
    resume: async (options) => {
      options.setup?.(scope)
      return { agent: child, async dispose() {} }
    },
  }
}

/**
 * Install the effort injection on a throwaway ctx and wrap the returned
 * registry's methods with call recorders. getEffortRegistry() hands the tool
 * the same object reference, so the patches are visible to the wiring under
 * test while the underlying map keeps working for behavioral checks.
 */
function spyRegistry() {
  const registry = installEffortInjection({ on() { return () => true } })
  const calls = []
  const rawRegister = registry.register.bind(registry)
  const rawForget = registry.forget.bind(registry)
  registry.register = (id, effort) => {
    calls.push(['register', String(id), effort])
    rawRegister(id, effort)
  }
  registry.forget = (id) => {
    calls.push(['forget', String(id)])
    rawForget(id)
  }
  return { registry, calls }
}

/** Recursively collect every object key of a JSON-ish value. */
function allKeys(value, out = []) {
  if (Array.isArray(value)) {
    value.forEach((v) => allKeys(v, out))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      out.push(key)
      allKeys(v, out)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Group 3a — REGRESSION ANCHOR: buildStartRequest emits no effort field.
// ---------------------------------------------------------------------------

{
  const baseInput = {
    agentName: 'thinker',
    prompt: 'do the thing',
    parent: PARENT,
    persona: 'body',
    deep: 1,
    toolName: 'use_agent',
    model: 'prov-x/model-y',
    displayName: 'Thinker',
    thinking: 'max',
  }

  // With a model route: agentOptions exists but carries ONLY the provider/model
  // split — never an effort field.
  const routed = buildStartRequest(baseInput)
  assert.ok(routed.agentOptions !== undefined, 'model route produces agentOptions')
  assert.deepEqual(Object.keys(routed.agentOptions), ['provider', 'model'], 'agentOptions holds only the route split')

  // Whole-request scan: no effort/thinking key anywhere in the payload.
  for (const [label, request] of [
    ['routed deep>=1', routed],
    ['unrouted', buildStartRequest({ ...baseInput, model: undefined })],
    ['leaf (deep=0)', buildStartRequest({ ...baseInput, deep: 0 })],
  ]) {
    const offending = allKeys(request).filter((k) => /effort|thinking/i.test(k))
    assert.equal(offending.length, 0, `${label}: no effort/thinking key in the request (got ${offending})`)
  }

  // Without a model route there is no agentOptions at all — thinking alone
  // must never conjure one.
  assert.equal('agentOptions' in buildStartRequest({ ...baseInput, model: undefined }), false,
    'thinking alone never adds agentOptions')
  console.log('PASS anchor: buildStartRequest output contains no effort/reasoningEffort field')
}

// ---------------------------------------------------------------------------
// Group 4 (pre-pass) — no-thinking fixture, NO registry installed yet: the
// whole flow tolerates getEffortRegistry() === undefined.
// ---------------------------------------------------------------------------

{
  assert.equal(getEffortRegistry(), undefined, 'precondition: no registry installed in this fresh process')
  const tool = runAgentTool(toolCtx(), { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'plain', prompt: 'x' }, EXEC)
  assert.equal(result.kind, 'agent-result', 'no-registry fresh run still succeeds')
  assert.ok(result.output.map((b) => b.text ?? '').join('').includes('fresh done'), 'no-registry fresh output intact')
  console.log('PASS no registry installed: fresh flow succeeds without crashing')
}

// ---------------------------------------------------------------------------
// Group 3b — fresh branch: register(run.id) right after start, forget on settle.
// ---------------------------------------------------------------------------

{
  const { calls } = spyRegistry()
  const ctx = toolCtx()
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'x' }, EXEC)
  assert.ok(result.output.map((b) => b.text ?? '').join('').includes('fresh done'), 'fresh result returned')
  assert.equal(ctx.started.length, 1, 'exactly one fresh dispatch')
  assert.deepEqual(calls, [['register', 'fresh-child-1', 'max'], ['forget', 'fresh-child-1']],
    'fresh branch registers run.id with the frontmatter level, then forgets it')
  console.log('PASS fresh branch: register(fresh-child-1, max) before settle, forget after')
}

// ---------------------------------------------------------------------------
// Group 3c — resume branch: register(candidate.childId) BEFORE the drive,
// forget however the branch exits.
// ---------------------------------------------------------------------------

{
  const { calls } = spyRegistry()
  const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'thinker' }]
  const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued' }] } } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  })
  const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG }, resume: backend.resume })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'finish it' }, EXEC)
  const text = result.output.map((b) => b.text ?? '').join('')
  assert.ok(text.includes('Resumed from the interrupted prior run'), 'resume provenance present')
  assert.ok(text.includes('continued'), 'continuation output present')
  assert.equal(ctx.started.length, 0, 'no fresh dispatch on the happy resume path')
  assert.deepEqual(calls, [['register', 'child-1', 'max'], ['forget', 'child-1']],
    'resume branch registers the persisted childId before driving, forgets after settle')
  console.log('PASS resume branch: register(child-1, max) before driveResumedRun, forget after settle')
}

// ---------------------------------------------------------------------------
// Group 3d — resume-failed fallback-to-fresh branch: BOTH ids registered and
// both forgotten (persisted child + freshly minted run).
// ---------------------------------------------------------------------------

{
  const { calls } = spyRegistry()
  const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'thinker' }]
  const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
  ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'redo it' }, EXEC)
  const text = result.output.map((b) => b.text ?? '').join('')
  assert.ok(text.includes('started a fresh run instead'), 'fallback note present')
  assert.ok(text.includes('fresh done'), 'fallback fresh result returned')
  assert.equal(ctx.started.length, 1, 'exactly one fallback fresh dispatch')
  assert.deepEqual(calls, [
    ['register', 'child-1', 'max'],
    ['register', 'fresh-child-1', 'max'],
    ['forget', 'fresh-child-1'],
    ['forget', 'child-1'],
  ], 'fallback registers both childIds and forgets both after settlement')
  console.log('PASS fallback branch: register(child-1) then register(fresh-child-1), both forgotten')
}

// ---------------------------------------------------------------------------
// Group 3e — forget runs even when the run settles with a failure (the
// finally must fire on the error path too, not just on success).
// ---------------------------------------------------------------------------

{
  const { calls } = spyRegistry()
  const ctx = toolCtx()
  ctx.subagents.start = async () => ({
    id: 'failing-child',
    localAgent: undefined,
    result: Promise.resolve({ stopReason: 'error', output: [{ type: 'text', text: 'halfway' }] }),
    async dispose() {},
  })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  await assert.rejects(
    tool.execute({ agent: 'thinker', prompt: 'x' }, EXEC),
    /subagent run failed/,
    'failed run surfaces as a tool error',
  )
  assert.deepEqual(calls, [['register', 'failing-child', 'max'], ['forget', 'failing-child']],
    'failed run still drops its mapping')
  console.log('PASS failed fresh run: forget fires on the error path too')
}

// ---------------------------------------------------------------------------
// Group 4 — a fixture WITHOUT `thinking` produces zero register/forget calls
// across every branch (fresh, resume, fallback).
// ---------------------------------------------------------------------------

{
  const { calls } = spyRegistry()

  // Fresh.
  const freshCtx = toolCtx()
  const freshTool = runAgentTool(freshCtx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const freshResult = await freshTool.execute({ agent: 'plain', prompt: 'x' }, EXEC)
  assert.ok(freshResult.output.map((b) => b.text ?? '').join('').includes('fresh done'), 'plain fresh run works')

  // Resume.
  const children = [{ kind: 'child', id: 'child-plain', activity: 'inactive', mode: 'one-shot', label: 'plain' }]
  const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued plain' }] } } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  })
  const resumeCtx = toolCtx({ children, events: { 'child-plain': ERROR_LOG }, resume: backend.resume })
  const resumeTool = runAgentTool(resumeCtx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const resumeResult = await resumeTool.execute({ agent: 'plain', prompt: 'finish it' }, EXEC)
  assert.ok(resumeResult.output.map((b) => b.text ?? '').join('').includes('Resumed from'), 'plain resume works')

  // Fallback to fresh.
  const fbChildren = [{ kind: 'child', id: 'child-plain-2', activity: 'inactive', mode: 'one-shot', label: 'plain' }]
  const fbCtx = toolCtx({ children: fbChildren, events: { 'child-plain-2': ERROR_LOG } })
  fbCtx.agents = { resume: async () => { throw new Error('raced') } }
  const fbTool = runAgentTool(fbCtx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const fbResult = await fbTool.execute({ agent: 'plain', prompt: 'redo it' }, EXEC)
  assert.ok(fbResult.output.map((b) => b.text ?? '').join('').includes('started a fresh run instead'), 'plain fallback works')

  assert.equal(calls.length, 0, 'no-thinking fixture: zero registry calls across all three branches')
  console.log('PASS no-thinking fixture: zero register/forget calls across fresh/resume/fallback')
}

rmSync(AGENTS_DIR, { recursive: true, force: true })

console.log('\nAll effort-wiring assertions passed.')
