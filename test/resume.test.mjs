// Unit + integration verification for interrupted-run resume — no LLM, no
// cordis runtime; the integration cases drive the real resume module and the
// real `use_agent` tool execute() against fake ctx/parent/persistence doubles.
// Run: node test/resume.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  accountingTurnEnd,
  buildContinuationPrompt,
  classifyPriorRun,
  decideResume,
  describeTurnEnd,
  driveResumedRun,
  findResumableRun,
  lastTurnEnd,
  pickLatestLabeledChild,
  toStopReason,
} from '../lib/resume.js'
import { leafDenyList, runAgentTool } from '../lib/tool-run-agent.js'

// ---------------------------------------------------------------------------
// Event log fixtures (structural minimums of real persisted session events).
// Turns carry numbers and a step/start so foldConsumedWork accounts them,
// exactly like logs the real loop writes.
// ---------------------------------------------------------------------------

const ev = (type, data = {}) => ({ type, data })

/** One accounted turn: turn/start + step/start + turn/end(kind). */
function turn(n, endKind, extra = {}) {
  const events = [ev('turn/start', { turn: n }), ev('step/start', { turn: n, step: 0 })]
  if (endKind !== undefined) events.push(ev('turn/end', { turn: n, reason: { kind: endKind, ...extra } }))
  return events
}

const COMPLETED_LOG = turn(1, 'completed')
const ERROR_LOG = turn(1, 'error', { error: { message: 'boom' } })
const ABORTED_LOG = turn(1, 'aborted', { reason: { kind: 'user' } })
const MAXTOKENS_LOG = turn(1, 'max-tokens')
const CRASH_LOG = [ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 })] // no turn/end at all
const RECOVERED_LOG = [...turn(1, 'error', { error: { message: 'first attempt died' } }), ...turn(2, 'completed')]
// Real work errored, then a trailing no-op completed turn (a rejected or
// rewritten-away step) must NOT mask the error.
const NOOP_TRAILING_LOG = [
  ...turn(1, 'error', { error: { message: 'real failure' } }),
  ev('turn/start', { turn: 2 }),
  ev('turn/end', { turn: 2, reason: { kind: 'completed' } }),
]

// ---------------------------------------------------------------------------
// classifyPriorRun / lastTurnEnd / accountingTurnEnd / describeTurnEnd
// ---------------------------------------------------------------------------

{
  const cases = [
    ['completed run', COMPLETED_LOG, 'completed'],
    ['error run', ERROR_LOG, 'resumable'],
    ['aborted run', ABORTED_LOG, 'resumable'],
    ['max-tokens run', MAXTOKENS_LOG, 'resumable'],
    ['crash-interrupted run (no turn/end)', CRASH_LOG, 'resumable'],
    ['failed then completed (whole run finished)', RECOVERED_LOG, 'completed'],
    ['error followed by trailing no-op turn', NOOP_TRAILING_LOG, 'resumable'],
  ]
  for (const [label, log, expected] of cases) {
    const c = classifyPriorRun(log)
    assert.equal(c.status, expected, `${label}: status`)
    assert.ok(c.endedAs.length > 0, `${label}: endedAs phrase present`)
    console.log(`PASS classify ${label}: status=${c.status} endedAs="${c.endedAs}"`)
  }
  assert.equal(classifyPriorRun(COMPLETED_LOG).turnCount, 1, 'turnCount counts turn/end events')
  assert.equal(classifyPriorRun(NOOP_TRAILING_LOG).turnCount, 2, 'turnCount counts raw turn/ends')
  assert.equal(classifyPriorRun(CRASH_LOG).turnCount, 0, 'crash log has zero closed turns')

  // The accounting end skips the trailing no-op; the raw last does not.
  assert.equal(accountingTurnEnd(NOOP_TRAILING_LOG)?.data?.reason?.kind, 'error', 'accounting end is the real failure')
  assert.equal(lastTurnEnd(NOOP_TRAILING_LOG)?.data?.reason?.kind, 'completed', 'raw last sees the no-op')
  assert.equal(accountingTurnEnd(CRASH_LOG), undefined, 'accounting end: none in a crash log')

  assert.ok(describeTurnEnd('interrupted').includes('crash'), 'interrupted described as crash')
  assert.ok(describeTurnEnd(undefined).includes('no recorded turn result'), 'missing kind described as interrupted')
  console.log('PASS lastTurnEnd / accountingTurnEnd / describeTurnEnd')
}

{
  assert.equal(toStopReason('completed'), 'completed')
  assert.equal(toStopReason('max-tokens'), 'max-tokens')
  assert.equal(toStopReason('aborted'), 'aborted')
  assert.equal(toStopReason('blocked'), 'refusal')
  assert.equal(toStopReason('error'), 'error')
  assert.equal(toStopReason(undefined), 'error')
  assert.equal(toStopReason('something-new'), 'error', 'unknown kinds map to error')
  console.log('PASS toStopReason mapping')
}

// ---------------------------------------------------------------------------
// pickLatestLabeledChild
// ---------------------------------------------------------------------------

{
  const child = (over) => ({ kind: 'child', id: 'x', activity: 'inactive', mode: 'one-shot', label: 'workhorse', ...over })
  const entries = [
    child({ id: 'old-ok', label: 'other-agent' }),
    child({ id: 'older-failed', label: 'workhorse' }),
    child({ id: 'running', activity: 'running' }),
    child({ id: 'continuable', mode: 'continuable', label: 'workhorse' }),
    { kind: 'diagnostic', id: 'broken', reason: 'corrupt' },
    child({ id: 'newest-failed' }),
  ]
  assert.equal(pickLatestLabeledChild(entries, 'workhorse')?.id, 'newest-failed', 'newest matching inactive one-shot wins')
  assert.equal(pickLatestLabeledChild(entries, 'other-agent')?.id, 'old-ok', 'label match filters')
  assert.equal(pickLatestLabeledChild(entries, 'missing'), undefined, 'no match -> undefined')
  assert.equal(pickLatestLabeledChild([], 'workhorse'), undefined, 'empty list -> undefined')
  // If the newest matching child is running, an older inactive one is picked.
  const runningNewest = [child({ id: 'a' }), child({ id: 'b', activity: 'running' })]
  assert.equal(pickLatestLabeledChild(runningNewest, 'workhorse')?.id, 'a', 'skips live children, falls back to older inactive')
  console.log('PASS pickLatestLabeledChild selection')
}

// ---------------------------------------------------------------------------
// decideResume
// ---------------------------------------------------------------------------

{
  const matrix = [
    // [mode, explicitResume, explicitFresh, hasCandidate, expected]
    ['auto', false, false, true, 'resume'],
    ['auto', false, false, false, 'fresh'],
    ['auto', false, true, true, 'fresh'],
    ['opt-in', false, false, true, 'fresh'],
    ['opt-in', true, false, true, 'resume'],
    ['opt-in', true, false, false, 'explicit-resume-unavailable'],
    ['off', false, false, true, 'fresh'],
    ['off', true, false, false, 'fresh'],
    ['auto', true, false, false, 'explicit-resume-unavailable'],
  ]
  for (const [mode, explicitResume, explicitFresh, hasCandidate, expected] of matrix) {
    const got = decideResume(mode, { explicitResume, explicitFresh, hasCandidate })
    assert.equal(got, expected, `decideResume(${mode}, resume=${explicitResume}, fresh=${explicitFresh}, cand=${hasCandidate})`)
  }
  console.log(`PASS decideResume matrix (${matrix.length} cases)`)
}

// ---------------------------------------------------------------------------
// buildContinuationPrompt / leafDenyList
// ---------------------------------------------------------------------------

{
  const prompt = buildContinuationPrompt('the turn failed with an error')
  assert.ok(prompt.includes('the turn failed with an error'), 'prompt carries the interruption phrase')
  assert.ok(/without redoing completed steps/.test(prompt), 'prompt forbids redoing work')
  assert.ok(!prompt.includes('reworded request'), 'no caller-prompt section without a caller prompt')

  const withCaller = buildContinuationPrompt('the turn failed with an error', 'please finish the deploy checklist')
  assert.ok(withCaller.includes('please finish the deploy checklist'), 'caller prompt appended')
  assert.ok(withCaller.includes('usually the same task restated'), 'caller prompt framed as a restated request')

  assert.equal(buildContinuationPrompt('x', '   ').includes('reworded request'), false, 'blank caller prompt omitted')
  console.log('PASS buildContinuationPrompt')

  assert.deepEqual(
    [...leafDenyList('use_agent')],
    ['subagent', 'subagent_fork', 'workflow', 'ralph', 'use_agent'],
    'default leaf deny list',
  )
  assert.deepEqual([...leafDenyList('my_tool', ['only-this'])], ['only-this'], 'explicit override replaces the default')
  assert.deepEqual([...leafDenyList('use_agent', [])], [...leafDenyList('use_agent')], 'empty override falls back to default')
  console.log('PASS leafDenyList')
}

// ---------------------------------------------------------------------------
// findResumableRun — fake ctx doubles (fail-open paths included)
// ---------------------------------------------------------------------------

/** Minimal fake satisfying what findResumableRun reads from ctx. */
function fakeCtx({ children, inspect, throwOnList = false } = {}) {
  return {
    subagents: {
      async listChildren() {
        if (throwOnList) throw new Error('projection registry not mounted')
        return children ?? []
      },
    },
    get(name) {
      if (name !== 'sessionPersistence') return undefined
      if (inspect === undefined) return undefined
      return { inspect: (id) => inspect(id) }
    },
  }
}

const PARENT = { id: 'session-parent' }

{
  const entries = [
    { kind: 'child', id: 'child-completed', activity: 'inactive', mode: 'one-shot', label: 'workhorse' },
    { kind: 'child', id: 'child-failed', activity: 'inactive', mode: 'one-shot', label: 'oldfox' },
  ]
  const events = { 'child-failed': ERROR_LOG, 'child-completed': COMPLETED_LOG }

  const run = await findResumableRun(
    fakeCtx({ children: entries, inspect: (id) => Promise.resolve({ events: events[id] ?? [] }) }),
    PARENT,
    'oldfox',
  )
  assert.equal(run?.childId, 'child-failed', 'failed run found by label')
  assert.equal(run?.classification.status, 'resumable', 'failed run classified resumable')

  const done = await findResumableRun(
    fakeCtx({ children: entries, inspect: (id) => Promise.resolve({ events: events[id] ?? [] }) }),
    PARENT,
    'workhorse',
  )
  assert.equal(done, undefined, 'completed latest run is not a candidate')

  assert.equal(await findResumableRun(fakeCtx({ children: entries }), PARENT, 'oldfox'), undefined, 'no persistence -> no candidate')
  assert.equal(await findResumableRun(fakeCtx({ throwOnList: true }), PARENT, 'oldfox'), undefined, 'listChildren failure -> no candidate')
  assert.equal(
    await findResumableRun(
      fakeCtx({ children: entries, inspect: () => Promise.reject(new Error('unreadable')) }),
      PARENT,
      'oldfox',
    ),
    undefined,
    'inspect failure -> no candidate',
  )
  console.log('PASS findResumableRun (happy path + fail-open paths)')
}

// ---------------------------------------------------------------------------
// driveResumedRun — fake agents.resume / child / handle doubles
// ---------------------------------------------------------------------------

/** Fake unpublished child scope satisfying (and recording) applyChildComposition. */
function fakeChildScope() {
  const applied = { persona: undefined, restrict: undefined, contexts: [] }
  return {
    applied,
    get() { return undefined },
    systemPrompt: {
      getContextOrder: () => 0,
      getSectionOrder: () => 0,
      context(sec) { applied.contexts.push(sec) },
      section(sec) { if (sec.name === 'deployment:persona') applied.persona = sec.text },
    },
    tools: { restrict(filter) { applied.restrict = filter } },
  }
}

/**
 * A fake resumed child: replayed `prior` events plus a scripted continuation
 * turn. `followup` records the message and runs the fake loop turn.
 */
function fakeResumeBackend(prior, scriptTurn, { whenIdle = async () => {} } = {}) {
  const scope = fakeChildScope()
  const captured = { resumeOptions: undefined, followup: undefined, disposed: false, scope: scope.applied }
  const childLog = [...prior]
  const child = {
    session: { events: childLog, get seq() { return childLog.length }, snapshotEvents: () => childLog },
    followup(message) {
      captured.followup = message
      scriptTurn?.(child.session.events)
    },
    whenIdle() { return whenIdle() },
    cancel() {},
  }
  const ctx = {
    agents: {
      async resume(options) {
        captured.resumeOptions = options
        options.setup?.(scope)
        return { agent: child, async dispose() { captured.disposed = true } }
      },
    },
  }
  return { ctx, captured }
}

const DRIVE_PARENT = {
  id: 'session-parent',
  options: { provider: 'parent-prov', model: 'parent-model' },
  session: { header: { delegationDepth: 0 }, requestHeader: () => undefined },
}

const signal = new AbortController().signal

{
  // Happy path: continuation turn completes with a final assistant message.
  const prior = [...ERROR_LOG]
  const script = (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }), ev('user/message'))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'all done now' }] } } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  }
  const { ctx, captured } = fakeResumeBackend(prior, script)
  const result = await driveResumedRun({
    ctx,
    parent: DRIVE_PARENT,
    childId: 'child-failed',
    persona: 'You are the workhorse.',
    toolFilter: { deny: ['subagent', 'use_agent'] },
    continuationPrompt: buildContinuationPrompt('the turn failed with an error'),
    noticeSummary: 'resume interrupted "workhorse" subagent run',
    signal,
  })
  assert.equal(result.stopReason, 'completed', 'resumed run completes')
  assert.deepEqual(result.output, [{ type: 'text', text: 'all done now' }], 'output is the continuation turn answer')
  assert.equal(captured.disposed, true, 'handle disposed after the drive')
  assert.ok(String(captured.resumeOptions.resumeSessionId) === 'child-failed', 'resumes the persisted child id')
  assert.equal(captured.resumeOptions.agentOptions.provider, 'parent-prov', 'parent provider inherited')
  assert.equal(captured.resumeOptions.agentOptions.subagentDepth, 1, 'child depth = parent depth + 1')
  assert.equal(captured.followup?.source?.plugin, 'dsh-subagent-registry', 'followup arrives as a plugin notice')
  assert.ok(captured.followup?.content[0]?.text?.includes('without redoing completed steps'), 'followup is the continuation prompt')
  assert.equal(captured.scope.persona, 'You are the workhorse.', 'persona section re-applied on resume')
  assert.deepEqual(captured.scope.restrict, { deny: ['subagent', 'use_agent'] }, 'leaf tool restriction re-applied on resume')
  assert.ok(captured.scope.contexts.some((c) => c.name === 'subagent:delegation'), 'delegation context installed')
  console.log('PASS driveResumedRun happy path (composition asserted + followup + result + disposal)')
}

{
  // Failure path: the continuation turn itself errors — result reflects it,
  // disposal still happens, partial output is kept.
  const script = (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'halfway there' }] } } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'error', error: { message: 'api down' } } }))
  }
  const { ctx, captured } = fakeResumeBackend([...CRASH_LOG], script)
  const result = await driveResumedRun({
    ctx,
    parent: DRIVE_PARENT,
    childId: 'child-crashed',
    persona: 'p',
    continuationPrompt: 'continue',
    noticeSummary: 's',
    signal,
  })
  assert.equal(result.stopReason, 'error', 'error turn surfaces as stopReason error')
  assert.deepEqual(result.output, [{ type: 'text', text: 'halfway there' }], 'partial output survives')
  assert.equal(captured.disposed, true, 'failed drive still disposes')
  console.log('PASS driveResumedRun failure path (partial output kept, disposed)')
}

{
  // Cancelled before the drive: no followup is submitted, stopReason aborted.
  const { ctx, captured } = fakeResumeBackend([...ERROR_LOG], () => {
    throw new Error('script must not run when cancelled')
  })
  const aborted = new AbortController()
  aborted.abort()
  const result = await driveResumedRun({
    ctx,
    parent: DRIVE_PARENT,
    childId: 'child-failed',
    persona: 'p',
    continuationPrompt: 'continue',
    noticeSummary: 's',
    signal: aborted.signal,
  })
  assert.equal(result.stopReason, 'aborted', 'pre-aborted signal yields aborted')
  assert.equal(captured.followup, undefined, 'no followup submitted when cancelled')
  assert.equal(captured.disposed, true, 'cancelled drive still disposes')
  console.log('PASS driveResumedRun cancel branch')
}

{
  // whenIdle rejection: the original error propagates and disposal still runs.
  const boom = new Error('loop died')
  const { ctx, captured } = fakeResumeBackend([...ERROR_LOG], () => {}, { whenIdle: () => Promise.reject(boom) })
  await assert.rejects(
    driveResumedRun({
      ctx, parent: DRIVE_PARENT, childId: 'c', persona: 'p', continuationPrompt: 'continue', noticeSummary: 's', signal,
    }),
    (error) => error === boom || (error instanceof AggregateError && error.errors[0] === boom),
    'drive error propagates',
  )
  assert.equal(captured.disposed, true, 'rejected drive still disposes')
  console.log('PASS driveResumedRun whenIdle rejection path')
}

{
  // The continuation result is read from the post-resume boundary only: prior
  // events (including the interrupted turn's partial output) never leak into
  // the returned answer.
  const prior = [
    ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 }),
    { type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'OLD PARTIAL' }] } } },
    ev('turn/end', { turn: 1, reason: { kind: 'interrupted' } }),
  ]
  const script = (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'NEW ANSWER' }] } } })
    events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  }
  const { ctx } = fakeResumeBackend(prior, script)
  const result = await driveResumedRun({
    ctx, parent: DRIVE_PARENT, childId: 'c', persona: 'p', continuationPrompt: 'continue', noticeSummary: 's', signal,
  })
  assert.equal(result.stopReason, 'completed', 'accounted continuation turn reads as completed')
  assert.deepEqual(result.output, [{ type: 'text', text: 'NEW ANSWER' }], 'boundary slices prior work out of the result')
  console.log('PASS driveResumedRun resume boundary')
}

// ---------------------------------------------------------------------------
// The `use_agent` tool execute() glue — real tool, fake ctx doubles
// ---------------------------------------------------------------------------

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-agents-'))
writeFileSync(
  join(AGENTS_DIR, 'workhorse.md'),
  '---\nname: workhorse\ndescription: "demo agent"\n---\nYou are the workhorse body.\n',
)

/** Fake ctx for the tool: resume seams + a scripted fresh-dispatch seam. */
function toolCtx({ children = [], events = {}, resume } = {}) {
  const started = []
  return {
    started,
    subagents: {
      async listChildren() { return children },
      async start(provider, request) {
        started.push({ provider, request })
        return {
          id: 'fresh-child',
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

const EXEC = { agent: DRIVE_PARENT, signal: new AbortController().signal }

try {
  // Mutually exclusive resume+fresh.
  {
    const tool = runAgentTool(toolCtx(), { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(
      tool.execute({ agent: 'workhorse', prompt: 'x', resume: true, fresh: true }, EXEC),
      /mutually exclusive/,
      'resume+fresh rejected',
    )
    console.log('PASS tool glue: resume/fresh are mutually exclusive')
  }

  // Explicit resume with no candidate fails loudly (also covers the
  // off+resume=true -> opt-in override reaching the unavailable branch).
  {
    const tool = runAgentTool(toolCtx(), { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent', resume: 'off' })
    await assert.rejects(
      tool.execute({ agent: 'workhorse', prompt: 'x', resume: true }, EXEC),
      /no interrupted prior run/,
      'explicit resume without candidate fails',
    )
    console.log('PASS tool glue: explicit resume without candidate (off-mode override)')
  }

  // Auto resume happy path: provenance prefix, caller prompt in the followup.
  {
    const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'workhorse' }]
    const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
      events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
      events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued' }] } } })
      events.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }))
    })
    const tool = runAgentTool(toolCtx({ children, events: { 'child-1': ERROR_LOG }, resume: backend.ctx.agents.resume }), {
      agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent',
    })
    const result = await tool.execute({ agent: 'workhorse', prompt: 'finish the checklist' }, EXEC)
    assert.equal(result.kind, 'agent-result', 'result kind')
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('Resumed from the interrupted prior run of agent "workhorse"'), 'provenance prefix present')
    assert.ok(text.includes('continued'), 'continuation output present')
    assert.ok(String(backend.captured.followup?.content[0]?.text).includes('finish the checklist'), 'caller prompt reaches the followup')
    console.log('PASS tool glue: auto resume happy path (provenance + caller prompt)')
  }

  // A continuation turn that RAN but failed again settles as a tool error
  // (with partial output) — it must NOT fall back to a fresh dispatch and
  // throw the partial work away.
  {
    const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'workhorse' }]
    const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
      events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
      events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'still half done' }] } } })
      events.push(ev('turn/end', { turn: 2, reason: { kind: 'error', error: { message: 'api flaked' } } }))
    })
    const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG }, resume: backend.ctx.agents.resume })
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(
      tool.execute({ agent: 'workhorse', prompt: 'x' }, EXEC),
      (error) => {
        assert.match(error.message, /subagent run failed .*resumed from interrupted run/)
        assert.match(error.message, /still half done/)
        return true
      },
      'failed continuation surfaces as an error with partial output',
    )
    assert.equal(ctx.started.length, 0, 'no fresh dispatch after a settled failed continuation')
    console.log('PASS tool glue: failed continuation keeps partial work, no fresh fallback')
  }

  // Drive failure falls back to a fresh dispatch (auto mode, no explicit resume).
  {
    const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'workhorse' }]
    const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
    ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    const result = await tool.execute({ agent: 'workhorse', prompt: 'redo it' }, EXEC)
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('started a fresh run instead'), 'fallback note present')
    assert.ok(text.includes('fresh done'), 'fresh dispatch result returned')
    assert.equal(ctx.started.length, 1, 'exactly one fresh dispatch')
    console.log('PASS tool glue: drive failure falls back to fresh dispatch')
  }

  // Explicit resume does NOT swallow a drive failure.
  {
    const children = [{ kind: 'child', id: 'child-1', activity: 'inactive', mode: 'one-shot', label: 'workhorse' }]
    const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
    ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(
      tool.execute({ agent: 'workhorse', prompt: 'x', resume: true }, EXEC),
      /session id already registered/,
      'explicit resume propagates drive errors',
    )
    console.log('PASS tool glue: explicit resume propagates drive failure')
  }

  // fresh=true skips the lookup entirely (no children enumerable needed).
  {
    let listed = false
    const ctx = toolCtx()
    ctx.subagents.listChildren = async () => { listed = true; return [] }
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    const result = await tool.execute({ agent: 'workhorse', prompt: 'x', fresh: true }, EXEC)
    assert.equal(listed, false, 'fresh=true never enumerates children')
    assert.ok(result.output.map((b) => b.text ?? '').join('').includes('fresh done'), 'fresh path used')
    console.log('PASS tool glue: fresh=true skips resume lookup')
  }
} finally {
  rmSync(AGENTS_DIR, { recursive: true, force: true })
}

console.log('All resume tests passed.')
