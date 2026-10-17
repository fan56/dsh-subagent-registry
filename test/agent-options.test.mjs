// Verification for the native effort carrier and the `use_agent` tool's
// dispatch branches — no LLM, no cordis runtime. Covers: buildStartRequest
// projects the frontmatter `thinking` natively as
// `agentOptions.reasoningEffort` (alpha hosts take it from there — there is
// no out-of-band carrier anymore); fresh / resume dispatch the right options,
// resume failures never start fresh work, and a failing run surfaces as a
// tool error while still disposing.
// Run: node test/agent-options.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildStartRequest, runAgentTool } from '../lib/tool-run-agent.js'

// Hermetic model-profile environment: `composeAgentRuntime` (inside the tool
// execute) reads `$DSH_HOME/model-profiles.json` and walks `.dsh-profile`
// pins from the cwd. Point DSH_HOME at a scratch home so every dispatch
// below resolves the frontmatter baseline deterministically, independent of
// the machine's real profile store and pins.
const HERMETIC_HOME = mkdtempSync(join(tmpdir(), 'registry-agent-options-home-'))
const PREV_DSH_HOME = process.env.DSH_HOME
process.env.DSH_HOME = HERMETIC_HOME

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ev = (type, data = {}) => ({ type, data })
const ERROR_LOG = [
  ev('turn/start', { turn: 1 }),
  ev('step/start', { turn: 1, step: 0 }),
  ev('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'boom' } } }),
]

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-agent-options-'))
writeFileSync(
  join(AGENTS_DIR, 'thinker.md'),
  '---\nname: thinker\ndescription: "demo agent with a thinking level"\nthinking: max\n---\nYou are the thinker body.\n',
)
writeFileSync(
  join(AGENTS_DIR, 'plain.md'),
  '---\nname: plain\ndescription: "demo agent without a thinking level"\n---\nYou are the plain body.\n',
)

const PARENT = { id: 'session-parent', options: {}, session: { header: { delegationDepth: 0 }, requestHeader: () => undefined } }
const EXEC = { agent: PARENT, signal: new AbortController().signal }

/** Fake ctx for the tool: resume seams + a scripted fresh-dispatch seam. */
function toolCtx({ children = [], events = {}, resume, start } = {}) {
  const started = []
  let freshSeq = 0
  return {
    started,
    subagents: {
      async listChildren() { return children },
      async waitForChildren() {},
      async drainDescendants() {},
      async startActivation(spec) {
        started.push(spec)
        if (start !== undefined) return start(spec)
        return {
          childId: `fresh-child-${++freshSeq}`,
          messageId: 'fresh-message',
          result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'fresh done' }] }),
          async dispose() {},
        }
      },
    },
    get(name) {
      if (name !== 'sessionPersistence') return undefined
      return { open: async (id) => ({ read: async () => ({ events: events[id] ?? [] }), close: async () => {} }) }
    },
    agents: resume === undefined ? undefined : { resume, get: (id) => id === PARENT.id ? PARENT : undefined },
  }
}

/** A resumed-run backend double: replayed prior events + scripted continuation. */
function fakeResumeBackend(prior, scriptTurn) {
  const applied = { persona: undefined, restrict: undefined, agentOptions: undefined }
  const scope = {
    get() { return undefined },
    systemPrompt: {
      getContextOrder: () => 0,
      getSectionOrder: () => 0,
      context() {},
      section(sec) { if (sec.name === 'deployment:persona-prefix' || sec.name === 'deployment:persona') applied.persona = sec.text },
    },
    tools: { restrict(filter) { applied.restrict = filter } },
  }
  const childLog = [...prior]
  const child = {
    status: 'idle',
    session: { header: { parentSession: PARENT.id }, events: childLog, get seq() { return childLog.length }, snapshotEvents: (from = 0) => childLog.slice(from) },
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
      applied.agentOptions = options.agentOptions
      assert.equal(options.parentAgent, PARENT, 'resume keeps the exact calling parent')
      const transaction = options.setup?.(scope, child)
      transaction?.commit?.()
      return { agent: child, async dispose() {} }
    },
  }
}

// ---------------------------------------------------------------------------
// Anchor — the effort travels natively: frontmatter `thinking` becomes
// `agentOptions.reasoningEffort` on the start request (no out-of-band carrier).
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

  // With a model route: agentOptions = route split + native effort field.
  const routed = buildStartRequest(baseInput)
  assert.ok(routed.agentOptions !== undefined, 'model route produces agentOptions')
  assert.deepEqual(Object.keys(routed.agentOptions), ['provider', 'model', 'reasoningEffort'],
    'agentOptions holds the route split plus reasoningEffort')
  assert.equal(routed.agentOptions.reasoningEffort, 'max', 'effort value passes through verbatim')

  // thinking alone still produces agentOptions.
  const thinkOnly = buildStartRequest({ ...baseInput, model: undefined })
  assert.deepEqual(Object.keys(thinkOnly.agentOptions), ['reasoningEffort'],
    'thinking alone yields an effort-only agentOptions')

  // leaf children carry the effort the same way (deep only shapes spawn caps).
  const leaf = buildStartRequest({ ...baseInput, deep: 0 })
  assert.equal(leaf.agentOptions.reasoningEffort, 'max', 'leaf keeps the native effort field')

  // No model and no thinking → no agentOptions at all.
  assert.equal('agentOptions' in buildStartRequest({ ...baseInput, model: undefined, thinking: undefined }), false,
    'no model and no thinking never conjures agentOptions')
  console.log('PASS anchor: reasoningEffort rides natively in agentOptions')
}

// ---------------------------------------------------------------------------
// Fresh branch: one dispatch carrying the native effort; output collected.
// ---------------------------------------------------------------------------

{
  const ctx = toolCtx()
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'x' }, EXEC)
  assert.ok(result.output.map((b) => b.text ?? '').join('').includes('fresh done'), 'fresh result returned')
  assert.equal(ctx.started.length, 1, 'exactly one fresh dispatch')
  const spec = ctx.started[0]
  assert.equal(spec.provider, 'spawn')
  assert.equal(spec.delivery, 'caller', 'foreground result goes to its caller')
  assert.equal(spec.label, '[use_agent foreground] thinker', 'foreground label marks the managed conversation')
  assert.equal(spec.signal, EXEC.signal, 'activation receives caller cancellation')
  assert.equal('label' in spec.request, false, 'label belongs to activation, not its request')
  assert.equal('signal' in spec.request, false, 'signal belongs to activation, not its request')
  assert.equal(spec.request.parent, PARENT, 'request keeps the delegating parent')
  assert.equal(ctx.started[0].request.agentOptions?.reasoningEffort, 'max',
    'fresh dispatch stamps the frontmatter effort natively')
  console.log('PASS fresh branch: one dispatch with native agentOptions.reasoningEffort')
}

// ---------------------------------------------------------------------------
// Resume branch: the persisted child continues with the effort in its
// resume agentOptions; no fresh dispatch on the happy path.
// ---------------------------------------------------------------------------

{
  const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'thinker' }]
  const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued' }] }, stream: [] } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  })
  const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG }, resume: backend.resume })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'finish it' }, EXEC)
  const text = result.output.map((b) => b.text ?? '').join('')
  assert.ok(text.includes('Resumed from the interrupted prior run'), 'resume provenance present')
  assert.ok(text.includes('continued'), 'continuation output present')
  assert.equal(ctx.started.length, 0, 'no fresh dispatch on the happy resume path')
  assert.equal(backend.applied.agentOptions?.reasoningEffort, 'max',
    'resume drive receives the frontmatter effort in its agentOptions')
  console.log('PASS resume branch: continuation driven with the native effort option')
}

// ---------------------------------------------------------------------------
// Resume failure: both automatic and explicit resume preserve the failure
// instead of discarding prior work and starting a fresh task.
// ---------------------------------------------------------------------------

{
  const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'thinker' }]
  const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
  ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  for (const resume of [undefined, true]) {
    await assert.rejects(tool.execute({ agent: 'thinker', prompt: 'redo it', ...(resume === undefined ? {} : { resume }) }, EXEC), /session id already registered/)
    assert.equal(ctx.started.length, 0, 'resume drive failure never starts a fresh task')
  }
  console.log('PASS resume failure propagates without fresh dispatch')
}

// ---------------------------------------------------------------------------
// Failure surfacing: a non-completed run rejects the tool call.
// ---------------------------------------------------------------------------

{
  const ctx = toolCtx({
    start: () => ({
      childId: 'failing-child',
      result: Promise.resolve({ stopReason: 'error', output: [{ type: 'text', text: 'halfway' }] }),
      async dispose() {},
    }),
  })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  await assert.rejects(
    tool.execute({ agent: 'thinker', prompt: 'x' }, EXEC),
    /subagent run failed/,
    'failed run surfaces as a tool error',
  )
  console.log('PASS failed fresh run: error surfaced to the caller')
}

// Foreground cancellation after activation acquisition releases the handle once.
{
  const controller = new AbortController()
  let acquired
  const ready = new Promise((resolve) => { acquired = resolve })
  let resolveResult
  const result = new Promise((resolve) => { resolveResult = resolve })
  let disposed = 0
  const ctx = toolCtx({ start: () => {
    acquired()
    return {
      childId: 'cancelled-child', result,
      async dispose() {
        disposed += 1
        resolveResult({ stopReason: 'aborted', output: [] })
      },
    }
  } })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const pending = tool.execute({ agent: 'plain', prompt: 'x' }, { agent: PARENT, signal: controller.signal })
  const rejected = assert.rejects(pending, /cancelled/)
  await ready
  // Let the startActivation await acquire its returned handle before aborting.
  await Promise.resolve()
  controller.abort()
  await rejected
  assert.equal(disposed, 1, 'abort and normal settlement share exactly one disposal')
  console.log('PASS foreground abort after activation acquisition disposes once')
}

// Activation diagnostics are sufficient without a local agent session.
{
  let disposed = 0
  const ctx = toolCtx({ start: () => ({
    childId: 'remote-failure',
    get localAgent() { throw new Error('retired localAgent must not be read') },
    result: Promise.resolve({ stopReason: 'error', output: [{ type: 'text', text: 'partial remote work' }], diagnostic: 'remote transport HTTP 503' }),
    async dispose() { disposed += 1 },
  }) })
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  await assert.rejects(tool.execute({ agent: 'plain', prompt: 'x' }, EXEC), (error) => {
    assert.match(error.message, /subagent run failed/)
    assert.match(error.message, /partial remote work/)
    assert.match(error.message, /remote transport HTTP 503/)
    return true
  })
  assert.equal(disposed, 1)
  console.log('PASS result diagnostic and partial output survive disposal')
}

// Persisted turn diagnostics are a fallback only for undiagnosed error results.
{
  for (const [stopReason, diagnostic, expectedReads] of [
    ['error', undefined, 1], ['error', 'provider diagnostic', 0], ['aborted', undefined, 0], ['completed', undefined, 0],
  ]) {
    let reads = 0
    const ctx = toolCtx({ start: () => ({
      childId: 'diagnostic-fallback',
      result: Promise.resolve({ stopReason, ...(diagnostic === undefined ? {} : { diagnostic }), output: [] }),
      async dispose() {},
    }) })
    ctx.get = (name) => name === 'sessionPersistence' ? { open: async (id) => {
      assert.equal(id, 'diagnostic-fallback', 'diagnostic reads the accepted activation child')
      reads += 1
      return { read: async () => ({ events: ERROR_LOG }), close: async () => {} }
    } } : undefined
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    const pending = tool.execute({ agent: 'plain', prompt: 'x', fresh: true }, EXEC)
    if (stopReason === 'completed') await pending
    else await assert.rejects(pending, (error) => {
      if (stopReason === 'error') assert.match(error.message, new RegExp(diagnostic ?? 'boom'))
      if (diagnostic) assert.equal(error.message.includes('boom'), false, 'provider diagnostic has priority')
      return true
    })
    assert.equal(reads, expectedReads, `${stopReason} diagnostic=${diagnostic}: persistence read count`)
  }
  console.log('PASS persisted diagnostic fallback applies only to undiagnosed errors')
}

// Independent execution and teardown failures both remain visible.
{
  for (const structuredFailure of [false, true]) {
    const executionError = new Error('result rejected')
    const disposalError = new Error('dispose rejected')
    let disposed = 0
    const ctx = toolCtx({ start: () => ({
      childId: 'double-failure',
      result: structuredFailure
        ? Promise.resolve({ stopReason: 'error', output: [], diagnostic: 'remote diagnostic' })
        : Promise.reject(executionError),
      async dispose() { disposed += 1; throw disposalError },
    }) })
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(tool.execute({ agent: 'plain', prompt: 'x' }, EXEC), (error) => {
      assert.ok(error instanceof AggregateError, 'execution and disposal failures aggregate')
      assert.equal(error.errors.length, 2)
      if (structuredFailure) assert.match(error.errors[0].message, /remote diagnostic/)
      else assert.equal(error.errors[0], executionError)
      assert.equal(error.errors[1], disposalError)
      return true
    })
    assert.equal(disposed, 1)
  }
  console.log('PASS result rejection or diagnostic plus disposal failure preserves both errors')
}

// ---------------------------------------------------------------------------
// Profile-composed runtime: a workspace pin + profile override reach BOTH
// dispatch branches (fresh and resume) — the spawn uses the composed values,
// not the raw frontmatter baseline.
// ---------------------------------------------------------------------------

{
  const WS = mkdtempSync(join(tmpdir(), 'registry-agent-options-ws-'))
  const prevCwd = process.cwd()
  try {
    writeFileSync(join(WS, '.dsh-profile'), 'work\n')
    writeFileSync(join(HERMETIC_HOME, 'model-profiles.json'), JSON.stringify({
      version: 1,
      profiles: [{ name: 'work', agents: { thinker: { model: 'prov-x/overridden', thinking: 'low' } } }],
    }))
    process.chdir(WS)

    // Fresh branch: the start request carries the composed route/effort.
    {
      const ctx = toolCtx()
      const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
      await tool.execute({ agent: 'thinker', prompt: 'x' }, EXEC)
      assert.equal(ctx.started.length, 1, 'exactly one fresh dispatch')
      const options = ctx.started[0].request.agentOptions
      assert.equal(options?.provider, 'prov-x', 'fresh dispatch composes the overridden provider')
      assert.equal(options?.model, 'overridden', 'fresh dispatch composes the overridden model')
      assert.equal(options?.reasoningEffort, 'low', 'fresh dispatch composes the overridden effort')
      console.log('PASS composed fresh: profile override replaces the frontmatter baseline')
    }

    // Resume branch: the continuation drive receives the composed values too.
    {
      const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'thinker' }]
      const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
        events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
        events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued' }] }, stream: [] } })
        events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
      })
      const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG }, resume: backend.resume })
      const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
      const result = await tool.execute({ agent: 'thinker', prompt: 'finish it' }, EXEC)
      const text = result.output.map((b) => b.text ?? '').join('')
      assert.ok(text.includes('Resumed from the interrupted prior run'), 'resume provenance present')
      assert.equal(backend.applied.agentOptions?.provider, 'prov-x', 'resume drive receives the overridden provider')
      assert.equal(backend.applied.agentOptions?.model, 'overridden', 'resume drive receives the overridden model')
      assert.equal(backend.applied.agentOptions?.reasoningEffort, 'low', 'resume drive receives the overridden effort')
      console.log('PASS composed resume: continuation carries the profile override')
    }
  } finally {
    process.chdir(prevCwd)
    rmSync(WS, { recursive: true, force: true })
  }
}

if (PREV_DSH_HOME === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = PREV_DSH_HOME
rmSync(HERMETIC_HOME, { recursive: true, force: true })
rmSync(AGENTS_DIR, { recursive: true, force: true })

console.log('\nAll agent-options assertions passed.')
