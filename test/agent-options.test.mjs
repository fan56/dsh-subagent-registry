// Verification for the native effort carrier and the `use_agent` tool's
// dispatch branches — no LLM, no cordis runtime. Covers: buildStartRequest
// projects the frontmatter `thinking` natively as
// `agentOptions.reasoningEffort` (alpha hosts take it from there — there is
// no out-of-band carrier anymore); the fresh / resume / resume-failed-fallback
// branches each dispatch the right request; and a failing run surfaces as a
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
      async start(provider, request) {
        started.push({ provider, request })
        if (start !== undefined) return start()
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
  const applied = { persona: undefined, restrict: undefined, agentOptions: undefined }
  const scope = {
    get() { return undefined },
    systemPrompt: {
      getContextOrder: () => 0,
      getSectionOrder: () => 0,
      context() {},
      section(sec) { if (sec.name === 'deployment:persona') applied.persona = sec.text },
    },
    tools: { restrict(filter) { applied.restrict = filter } },
  }
  const childLog = [...prior]
  const child = {
    session: { events: childLog, get seq() { return childLog.length }, snapshotEvents: () => childLog },
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
      options.setup?.(scope)
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
  assert.equal(ctx.started[0].request.agentOptions?.reasoningEffort, 'max',
    'fresh dispatch stamps the frontmatter effort natively')
  console.log('PASS fresh branch: one dispatch with native agentOptions.reasoningEffort')
}

// ---------------------------------------------------------------------------
// Resume branch: the persisted child continues with the effort in its
// resume agentOptions; no fresh dispatch on the happy path.
// ---------------------------------------------------------------------------

{
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
  assert.equal(backend.applied.agentOptions?.reasoningEffort, 'max',
    'resume drive receives the frontmatter effort in its agentOptions')
  console.log('PASS resume branch: continuation driven with the native effort option')
}

// ---------------------------------------------------------------------------
// Resume-failed fallback-to-fresh branch: a resume that cannot start degrades
// to a fresh dispatch (explicit resume=true must still fail loudly).
// ---------------------------------------------------------------------------

{
  const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'thinker' }]
  const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
  ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
  const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
  const result = await tool.execute({ agent: 'thinker', prompt: 'redo it' }, EXEC)
  const text = result.output.map((b) => b.text ?? '').join('')
  assert.ok(text.includes('started a fresh run instead'), 'fallback note present')
  assert.ok(text.includes('fresh done'), 'fallback fresh result returned')
  assert.equal(ctx.started.length, 1, 'exactly one fallback fresh dispatch')
  assert.equal(ctx.started[0].request.agentOptions?.reasoningEffort, 'max',
    'fallback fresh dispatch stamps the effort natively too')
  console.log('PASS fallback branch: resume failure degrades to a fresh native-effort dispatch')
}

// ---------------------------------------------------------------------------
// Failure surfacing: a non-completed run rejects the tool call.
// ---------------------------------------------------------------------------

{
  const ctx = toolCtx({
    start: () => ({
      id: 'failing-child',
      localAgent: undefined,
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
