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
  foregroundLabel,
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
    ['completed then inbox work cancelled unrun', [...COMPLETED_LOG, ev('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' })], 'resumable'],
    ['completed then next turn crashed before step', [...COMPLETED_LOG, ev('turn/start', { turn: 2 })], 'resumable'],
    ['completed then next turn crashed after step', [...COMPLETED_LOG, ...turn(2, undefined)], 'resumable'],
    ['drop absorbed by later completed turn', [...COMPLETED_LOG, ev('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' }), ...turn(2, 'completed')], 'completed'],
    ['completed then balanced no-op turn', [...COMPLETED_LOG, ev('turn/start', { turn: 2 }), ev('turn/end', { turn: 2, reason: { kind: 'completed' } })], 'completed'],
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
  // 0.1.7 catalog row shape: { id, createdAt, mode, label? } — every row is a
  // child (no `kind` discriminator), liveness is no longer carried, and
  // `mode: 'unknown'` marks a row whose descriptor never folded.
  const child = (over) => ({ id: 'x', createdAt: 1, mode: 'one-shot', label: 'workhorse', ...over })
  const entries = [
    child({ id: 'old-ok', label: 'other-agent' }),
    child({ id: 'older-failed', label: 'workhorse' }),
    child({ id: 'continuable', mode: 'continuable', label: 'workhorse' }),
    child({ id: 'unknown-mode', mode: 'unknown' }),
    child({ id: 'newest-failed' }),
    child({ id: 'managed-foreground', mode: 'continuable', label: foregroundLabel('workhorse') }),
    child({ id: 'newest-background', mode: 'continuable', label: 'workhorse' }),
  ]
  assert.equal(foregroundLabel('workhorse'), '[use_agent foreground] workhorse')
  assert.equal(foregroundLabel('牛马狗'), '[use_agent foreground] 牛马狗')
  assert.equal(pickLatestLabeledChild(entries, 'workhorse')?.id, 'managed-foreground', 'managed foreground continuable wins over legacy one-shot')
  assert.equal(pickLatestLabeledChild(entries.slice(0, 5), 'workhorse')?.id, 'newest-failed', 'legacy one-shot remains selectable')
  assert.equal(pickLatestLabeledChild([child({ mode: 'one-shot', label: foregroundLabel('workhorse') })], 'workhorse'), undefined, 'marked label only belongs to continuable foreground')
  assert.equal(pickLatestLabeledChild(entries, 'other-agent')?.id, 'old-ok', 'label match filters')
  assert.equal(pickLatestLabeledChild(entries, 'missing'), undefined, 'no match -> undefined')
  assert.equal(pickLatestLabeledChild([], 'workhorse'), undefined, 'empty list -> undefined')
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

  // hostKnownTools intersection (dsh 0.1.7-rc.1 fail-fast restrict): the
  // DEFAULT list drops names the host no longer registers (e.g. ralph),
  // an explicit override is passed through verbatim.
  const hostWithoutRalph = new Set(['subagent', 'subagent_fork', 'workflow', 'use_agent'])
  assert.deepEqual(
    [...leafDenyList('use_agent', undefined, hostWithoutRalph)],
    ['subagent', 'subagent_fork', 'workflow', 'use_agent'],
    'default list drops host-unknown names (stale ralph)',
  )
  assert.deepEqual(
    [...leafDenyList('use_agent', ['ralph'], hostWithoutRalph)],
    ['ralph'],
    'explicit override is NOT intersected — host validation stays the caller feedback',
  )
  const fullHost = new Set(['subagent', 'subagent_fork', 'workflow', 'ralph', 'use_agent'])
  assert.deepEqual(
    [...leafDenyList('use_agent', undefined, fullHost)],
    [...leafDenyList('use_agent')],
    'full host registry keeps the whole default list',
  )
  console.log('PASS leafDenyList')
}

// ---------------------------------------------------------------------------
// findResumableRun — fake ctx doubles (lookup failures propagate)
// ---------------------------------------------------------------------------

/** Minimal fake satisfying what findResumableRun reads from ctx. */
function fakeCtx({ children, stored, throwOnList = false, live } = {}) {
  return {
    subagents: {
      async listChildren() {
        if (throwOnList) throw new Error('projection registry not mounted')
        return children ?? []
      },
    },
    get(name) {
      if (name === 'agents') {
        // Live agent registry double: `live` is the set of resident child ids.
        return { get: (id) => (live?.has(String(id)) ? { id } : undefined) }
      }
      if (name !== 'sessionPersistence') return undefined
      if (stored === undefined) return undefined
      return {
        open: async (id) => ({
          read: async () => ({ events: await stored(id) }),
          close: async () => {},
        }),
      }
    },
  }
}

const PARENT = { id: 'session-parent' }

{
  // 0.1.7 catalog row shape (durable facts only — no kind/activity).
  const entries = [
    { id: 'child-completed', createdAt: 1, mode: 'one-shot', label: 'workhorse' },
    { id: 'child-failed', createdAt: 2, mode: 'one-shot', label: 'oldfox' },
  ]
  const events = { 'child-failed': ERROR_LOG, 'child-completed': COMPLETED_LOG }

  const run = await findResumableRun(
    fakeCtx({ children: entries, stored: (id) => events[id] ?? [] }),
    PARENT,
    'oldfox',
  )
  assert.equal(run?.childId, 'child-failed', 'failed run found by label')
  assert.equal(run?.mode, 'one-shot', 'candidate preserves legacy mode')
  assert.equal(run?.classification.status, 'resumable', 'failed run classified resumable')

  const done = await findResumableRun(
    fakeCtx({ children: entries, stored: (id) => events[id] ?? [] }),
    PARENT,
    'workhorse',
  )
  assert.equal(done, undefined, 'completed latest run is not a candidate')

  assert.equal(await findResumableRun(fakeCtx(), PARENT, 'oldfox'), undefined, 'no candidate needs no persistence')
  await assert.rejects(findResumableRun(fakeCtx({ children: entries }), PARENT, 'oldfox'), /cannot inspect.*fresh=true/, 'existing prior run requires inspection')
  await assert.rejects(findResumableRun(fakeCtx({ throwOnList: true }), PARENT, 'oldfox'), /projection registry not mounted/, 'list failure must not silently start fresh')
  await assert.rejects(findResumableRun(fakeCtx({ children: entries, stored: () => Promise.reject(new Error('unreadable')) }), PARENT, 'oldfox'), /unreadable/, 'read failure propagates')
  for (const operation of ['open', 'close']) {
    const ctx = fakeCtx({ children: entries, stored: () => ERROR_LOG })
    const get = ctx.get.bind(ctx)
    ctx.get = (name) => name === 'sessionPersistence' ? { open: async () => {
      if (operation === 'open') throw new Error('open failed')
      return { read: async () => ({ events: ERROR_LOG }), close: async () => { throw new Error('close failed') } }
    } } : get(name)
    await assert.rejects(findResumableRun(ctx, PARENT, 'oldfox'), new RegExp(`${operation} failed`))
  }
  const aborted = new AbortController()
  aborted.abort(new Error('lookup cancelled'))
  await assert.rejects(findResumableRun(fakeCtx({ children: entries, stored: () => ERROR_LOG }), PARENT, 'oldfox', aborted.signal), /lookup cancelled/)
  console.log('PASS findResumableRun strict lookup failures')

  // A catalog candidate still resident in the live registry is busy.
  {
    await assert.rejects(findResumableRun(
      fakeCtx({ children: entries, stored: (id) => events[id] ?? [], live: new Set(['child-failed']) }),
      PARENT, 'oldfox',
    ), /already in progress|busy/, 'a resident foreground child is busy, not a fresh-task opportunity')
    const managedEntries = [
      ...entries,
      { id: 'managed-failed', createdAt: 3, mode: 'continuable', label: foregroundLabel('oldfox') },
      { id: 'background-failed', createdAt: 4, mode: 'continuable', label: 'oldfox' },
    ]
    const managed = await findResumableRun(fakeCtx({ children: managedEntries, stored: () => ERROR_LOG }), PARENT, 'oldfox')
    assert.equal(managed?.childId, 'managed-failed', 'newer ordinary background child is excluded')
    assert.equal(managed?.mode, 'continuable', 'managed candidate preserves its catalog mode')
  }
  console.log('PASS findResumableRun liveness filter (replaces the dropped activity flag)')
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
      // dsh 0.1.5-rc.1 split the persona section into prefix/suffix — the
      // child composition shadows the PREFIX half.
      section(sec) { if (sec.name === 'deployment:persona-prefix' || sec.name === 'deployment:persona') applied.persona = sec.text },
    },
    tools: { restrict(filter) { applied.restrict = filter } },
  }
}

/**
 * A fake resumed child: replayed `prior` events plus a scripted continuation
 * turn. `followup` records the message and runs the fake loop turn.
 */
function fakeResumeBackend(prior, scriptTurn, { whenIdle = async () => {}, parent = DRIVE_PARENT } = {}) {
  const scope = fakeChildScope()
  const captured = { resumeOptions: undefined, followup: undefined, disposed: false, scope: scope.applied, drained: 0 }
  const childLog = [...prior]
  const child = {
    status: 'idle',
    session: { header: { parentSession: parent.id }, events: childLog, get seq() { return childLog.length }, snapshotEvents: (from = 0) => childLog.slice(from) },
    followup(message) {
      captured.followup = message
      scriptTurn?.(child.session.events)
    },
    whenIdle() { return whenIdle() },
    cancel() {},
  }
  const ctx = {
    subagents: {
      async waitForChildren() {},
      async drainDescendants() { captured.drained += 1 },
    },
    agents: {
      get: (id) => id === parent.id ? parent : undefined,
      async resume(options) {
        captured.resumeOptions = options
        const transaction = options.setup?.(scope, child)
        transaction?.commit?.()
        return { agent: child, async dispose() { captured.disposed = true } }
      },
    },
  }
  return { ctx, captured, child }
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
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'all done now' }] }, stream: [] } })
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
  assert.equal(captured.drained, 1, 'descendants drained before handle disposal')
  assert.equal(captured.resumeOptions.parentAgent, DRIVE_PARENT, 'resume carries the exact delegating parent')
  assert.ok(String(captured.resumeOptions.resumeSessionId) === 'child-failed', 'resumes the persisted child id')
  assert.equal(captured.resumeOptions.agentOptions.provider, 'parent-prov', 'parent provider inherited')
  assert.equal(captured.resumeOptions.agentOptions.subagentDepth, 1, 'child depth = parent depth + 1')
  // 0.1.7: no shared 'plugin' source kind — the notice carries this plugin's
  // own merge-extensible producer kind plus the official notice context form.
  assert.equal(captured.followup?.source?.kind, 'dsh-subagent-registry', 'followup carries the plugin producer kind')
  assert.equal(captured.followup?.source?.form, 'notice', 'followup uses the notice context form')
  assert.equal(captured.followup?.source?.summary, 'resume interrupted "workhorse" subagent run', 'followup notice summary present')
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
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'halfway there' }] }, stream: [] } })
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
  // Cancellation before acquisition starts neither resume nor fresh work.
  const { ctx, captured } = fakeResumeBackend([...ERROR_LOG], () => {
    throw new Error('script must not run when cancelled')
  })
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(driveResumedRun({
    ctx, parent: DRIVE_PARENT, childId: 'child-failed', persona: 'p',
    continuationPrompt: 'continue', noticeSummary: 's', signal: aborted.signal,
  }), (error) => error.name === 'AbortError', 'pre-aborted signal rejects before acquisition')
  assert.equal(captured.followup, undefined, 'no followup submitted when cancelled')
  assert.equal(captured.resumeOptions, undefined, 'cancelled drive never acquires the child')
  assert.equal(captured.disposed, false, 'no handle exists to dispose')
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
    { type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'OLD PARTIAL' }] }, stream: [] } },
    ev('turn/end', { turn: 1, reason: { kind: 'interrupted' } }),
  ]
  const script = (events) => {
    events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'NEW ANSWER' }] }, stream: [] } })
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

// A synchronous abort inside followup must also cancel its subsequent wake.
{
  const controller = new AbortController()
  const cancelledWhileActive = []
  let active = false
  const backend = fakeResumeBackend(ERROR_LOG, (events) => {
    controller.abort()
    // followup can wake its driver after synchronous listeners have returned.
    active = true
    backend.child.status = 'running'
    events.push(...turn(2, 'completed'))
  }, { whenIdle: async () => {
    assert.equal(active, false, 'post-followup cancellation covers the reactivated driver')
  } })
  backend.child.cancel = () => {
    cancelledWhileActive.push(active)
    active = false
    backend.child.status = 'idle'
  }
  const result = await driveResumedRun({
    ctx: backend.ctx, parent: DRIVE_PARENT, childId: 'synchronous-abort-wake', persona: 'p',
    continuationPrompt: 'continue', noticeSummary: 's', signal: controller.signal,
  })
  assert.deepEqual(cancelledWhileActive, [false, true], 'abort listener and post-followup check cancel before and after driver wake')
  assert.equal(result.stopReason, 'aborted', 'caller abort wins over the scripted completed turn')
  assert.equal(backend.captured.drained, 1, 'reentrant cancellation shares descendant drain')
  assert.equal(backend.captured.disposed, true)
  console.log('PASS resume synchronous followup abort cancels its reactivated driver')
}

// A parent scope effect that throws during setup must release the child lock.
{
  const childId = 'effect-setup-failure'
  const effectError = new Error('INACTIVE_EFFECT')
  const backend = fakeResumeBackend(ERROR_LOG, (events) => {
    events.push(...turn(2, 'completed'))
  })
  const input = {
    ctx: backend.ctx, parent: DRIVE_PARENT, childId, persona: 'p',
    continuationPrompt: 'continue', noticeSummary: 's', signal,
  }
  await assert.rejects(driveResumedRun({
    ...input,
    parent: { ...DRIVE_PARENT, ctx: { effect() { throw effectError } } },
  }), (error) => error === effectError, 'effect setup failure propagates unchanged')
  assert.equal(backend.captured.resumeOptions, undefined, 'failed parent effect never acquires a child')
  const result = await driveResumedRun(input)
  assert.equal(result.stopReason, 'completed', 'same child can resume after effect setup failure')
  assert.equal(backend.captured.disposed, true)
  console.log('PASS throwing parent effect releases resume lock')
}

// Resume validates both the stored parent and the exact live parent identity.
{
  for (const foreign of ['header', 'live-parent']) {
    const backend = fakeResumeBackend(ERROR_LOG, () => { throw new Error('foreign child must not run') })
    if (foreign === 'header') backend.child.session.header.parentSession = 'different-parent'
    else backend.ctx.agents.get = () => ({ ...DRIVE_PARENT })
    await assert.rejects(driveResumedRun({
      ctx: backend.ctx, parent: DRIVE_PARENT, childId: `foreign-${foreign}`, persona: 'p',
      continuationPrompt: 'continue', noticeSummary: 's', signal,
    }), foreign === 'header' ? /another parent/ : /exact live parent/)
    assert.equal(backend.captured.followup, undefined)
  }
  console.log('PASS resume rejects foreign stored or live parent')
}

// Cleanup still releases the acquired handle if draining descendants fails.
{
  const backend = fakeResumeBackend(ERROR_LOG, (events) => {
    events.push(...turn(2, 'completed'))
  })
  const drainError = new Error('descendant drain failed')
  backend.ctx.subagents.drainDescendants = async () => { throw drainError }
  await assert.rejects(driveResumedRun({
    ctx: backend.ctx, parent: DRIVE_PARENT, childId: 'drain-failure', persona: 'p',
    continuationPrompt: 'continue', noticeSummary: 's', signal,
  }), (error) => error instanceof AggregateError && error.errors.includes(drainError))
  assert.equal(backend.captured.disposed, true, 'drain failure cannot prevent handle disposal')
  console.log('PASS resume descendant drain failure still disposes handle')
}

// ---------------------------------------------------------------------------
// The `use_agent` tool execute() glue — real tool, fake ctx doubles
// ---------------------------------------------------------------------------

// Hermetic model-profile environment (same as agent-options.test.mjs): the
// tool's execute composes the runtime from `$DSH_HOME/model-profiles.json`
// + `.dsh-profile` pins found from the cwd, so point DSH_HOME at a scratch
// home to keep these dispatches deterministic regardless of the machine's
// real profile store and pins.
const HERMETIC_HOME = mkdtempSync(join(tmpdir(), 'registry-resume-home-'))
const PREV_DSH_HOME = process.env.DSH_HOME
process.env.DSH_HOME = HERMETIC_HOME

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
      async waitForChildren() {},
      async drainDescendants() {},
      async startActivation(spec) {
        started.push(spec)
        return {
          childId: 'fresh-child', messageId: 'fresh-message',
          result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'fresh done' }] }),
          async dispose() {},
        }
      },
    },
    get(name) {
      if (name !== 'sessionPersistence') return undefined
      return { open: async (id) => ({ read: async () => ({ events: events[id] ?? [] }), close: async () => {} }) }
    },
    agents: resume === undefined ? undefined : { resume, get: (id) => id === DRIVE_PARENT.id ? DRIVE_PARENT : undefined },
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
    const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'workhorse' }]
    const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
      events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
      events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'continued' }] }, stream: [] } })
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
    const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'workhorse' }]
    const backend = fakeResumeBackend([...ERROR_LOG], (events) => {
      events.push(ev('turn/start', { turn: 2 }), ev('step/start', { turn: 2, step: 0 }))
      events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'still half done' }] }, stream: [] } })
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

  // Automatic resume propagates drive failure without starting fresh work.
  {
    const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'workhorse' }]
    const ctx = toolCtx({ children, events: { 'child-1': ERROR_LOG } })
    ctx.agents = { resume: async () => { throw new Error('session id already registered') } }
    const tool = runAgentTool(ctx, { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(tool.execute({ agent: 'workhorse', prompt: 'redo it' }, EXEC), /session id already registered/)
    assert.equal(ctx.started.length, 0, 'automatic resume failure never starts a fresh task')
    console.log('PASS tool glue: automatic resume propagates drive failure')
  }

  // Explicit resume does NOT swallow a drive failure.
  {
    const children = [{ id: 'child-1', createdAt: 1, mode: 'one-shot', label: 'workhorse' }]
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

  // The same child cannot be resumed concurrently, even by separate tool instances.
  {
    const childId = 'concurrent-child'
    const children = [{ id: childId, createdAt: 1, mode: 'continuable', label: foregroundLabel('workhorse') }]
    let entered
    const ready = new Promise((resolve) => { entered = resolve })
    let release
    const idle = new Promise((resolve) => { release = resolve })
    const backend = fakeResumeBackend(ERROR_LOG, (events) => {
      events.push(...turn(2, 'completed'))
    }, { whenIdle: () => { entered(); return idle } })
    const ctx = toolCtx({ children, events: { [childId]: ERROR_LOG }, resume: backend.ctx.agents.resume })
    const cfg = { agentsDir: AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' }
    const pending = runAgentTool(ctx, cfg).execute({ agent: 'workhorse', prompt: 'continue' }, EXEC)
    try {
      await ready
      await assert.rejects(runAgentTool(ctx, cfg).execute({ agent: 'workhorse', prompt: 'continue' }, EXEC), /already in progress|busy/)
      assert.equal(ctx.started.length, 0, 'busy resume never dispatches fresh work')
    } finally {
      release()
      await pending
    }
    assert.equal(backend.captured.disposed, true, 'first resume disposes after completion')
    // Completion releases the lock so a later call can acquire the same id.
    await runAgentTool(ctx, cfg).execute({ agent: 'workhorse', prompt: 'continue again' }, EXEC)
    assert.equal(ctx.started.length, 0)
    console.log('PASS tool glue: same child concurrent resume is busy without fresh fallback')
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
  if (PREV_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = PREV_DSH_HOME
  rmSync(HERMETIC_HOME, { recursive: true, force: true })
  rmSync(AGENTS_DIR, { recursive: true, force: true })
}

console.log('All resume tests passed.')
