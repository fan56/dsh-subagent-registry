// Unit + integration verification for the interactive-subagent feature
// (continuable background dispatch + ask_agent follow-ups) — no LLM, no
// cordis runtime; the integration cases drive the real modules against fake
// ctx / session / subagent doubles.
// Run: node test/interactive.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SubagentError } from '@deepseek-ai/dsh-subagent'
import {
  askAgentTool,
  childEventBoundary,
  decideBackgroundMode,
  getLiveSession,
  pickLatestContinuableChild,
  waitForChildReply,
} from '../lib/interactive.js'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { runAgentTool } from '../lib/tool-run-agent.js'

const ev = (type, data = {}) => ({ type, data })

/** One accounted turn appended to a log array (mirrors the real loop's events). */
function appendTurn(events, n, endKind, text) {
  events.push(ev('turn/start', { turn: n }), ev('step/start', { turn: n, step: 0 }))
  if (text !== undefined) {
    events.push({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } })
  }
  if (endKind !== undefined) events.push(ev('turn/end', { turn: n, reason: { kind: endKind } }))
}

// ---------------------------------------------------------------------------
// decideBackgroundMode
// ---------------------------------------------------------------------------

{
  const matrix = [
    // [explicit param, frontmatter, expected]
    [undefined, undefined, false],
    [undefined, true, true],
    [undefined, false, false],
    [true, false, true],
    [false, true, false],
    [true, undefined, true],
    [false, undefined, false],
  ]
  for (const [explicit, frontmatter, expected] of matrix) {
    assert.equal(decideBackgroundMode(explicit, frontmatter), expected, `decide(${explicit}, ${frontmatter})`)
  }
  console.log('PASS decideBackgroundMode matrix')
}

// ---------------------------------------------------------------------------
// `background` frontmatter parsing (fail-loud on a bad value, like `thinking`)
// ---------------------------------------------------------------------------

{
  const ok = parseAgentMarkdown('---\nname: a\nbackground: true\n---\nBody.\n', 'a.md')
  assert.equal(ok.ok, true)
  assert.equal(ok.agent.meta.background, true, 'background: true parsed')

  const off = parseAgentMarkdown('---\nname: a\nbackground: false\n---\nBody.\n', 'a.md')
  assert.equal(off.ok, true)
  assert.equal(off.agent.meta.background, false, 'background: false parsed')

  const absent = parseAgentMarkdown('---\nname: a\n---\nBody.\n', 'a.md')
  assert.equal(absent.ok, true)
  assert.equal(absent.agent.meta.background, undefined, 'absent background stays undefined')

  const bad = parseAgentMarkdown('---\nname: a\nbackground: True\n---\nBody.\n', 'a.md')
  assert.equal(bad.ok, false, 'non-canonical boolean marks the file broken')
  assert.match(bad.error, /invalid `background`/)
  console.log('PASS background frontmatter parsing')
}

// ---------------------------------------------------------------------------
// pickLatestContinuableChild
// ---------------------------------------------------------------------------

{
  const child = (over) => ({ kind: 'child', id: 'x', activity: 'inactive', mode: 'continuable', label: 'workhorse', ...over })
  const entries = [
    child({ id: 'old', label: 'other-agent' }),
    child({ id: 'one-shot', mode: 'one-shot', label: 'workhorse' }),
    child({ id: 'running', activity: 'running' }),
    { kind: 'diagnostic', id: 'broken', reason: 'corrupt' },
    child({ id: 'newest' }),
  ]
  assert.equal(pickLatestContinuableChild(entries, ['workhorse'])?.id, 'newest', 'newest matching continuable wins')
  assert.equal(pickLatestContinuableChild(entries, ['other-agent'])?.id, 'old', 'label match filters')
  assert.equal(pickLatestContinuableChild(entries, ['missing']), undefined, 'no match -> undefined')
  assert.equal(pickLatestContinuableChild([], ['workhorse']), undefined, 'empty list -> undefined')
  // Running children qualify too: delivery steers a live child.
  const live = [child({ id: 'a' }), child({ id: 'b', activity: 'running' })]
  assert.equal(pickLatestContinuableChild(live, ['workhorse'])?.id, 'b', 'a running continuable child is addressable')
  console.log('PASS pickLatestContinuableChild selection')
}

// ---------------------------------------------------------------------------
// getLiveSession / childEventBoundary — fake ctx doubles
// ---------------------------------------------------------------------------

function fakeSessions(map) {
  return { get(name) { return name === 'sessions' ? { get: (id) => map.get(id) } : undefined } }
}

{
  const log = [ev('turn/start', { turn: 1 })]
  const live = { seq: log.length, snapshotEvents: (from = 0) => log.slice(from) }
  const ctx = fakeSessions(new Map([['child-1', live]]))
  assert.equal(getLiveSession(ctx, 'child-1'), live, 'live session resolved from the store')
  assert.equal(getLiveSession({ get: () => undefined }, 'child-1'), undefined, 'no sessions service -> undefined')
  assert.equal(getLiveSession({ get: () => ({ get: () => undefined }) }, 'child-1'), undefined, 'unknown id -> undefined')

  assert.equal(await childEventBoundary(ctx, 'child-1'), 1, 'live boundary is the session seq')

  const persisted = [ev('a'), ev('b'), ev('c')]
  const coldCtx = {
    get(name) {
      if (name === 'sessionPersistence') return { inspect: async () => ({ events: persisted }) }
      return undefined
    },
  }
  assert.equal(await childEventBoundary(coldCtx, 'cold-child'), 3, 'cold boundary is the persisted event count')
  assert.equal(await childEventBoundary({ get: () => undefined }, 'x'), undefined, 'no store + no persistence -> undefined')
  const brokenCtx = {
    get(name) {
      if (name === 'sessionPersistence') return { inspect: async () => { throw new Error('unreadable') } }
      return undefined
    },
  }
  assert.equal(await childEventBoundary(brokenCtx, 'x'), undefined, 'inspect failure -> undefined (deliver without waiting)')
  console.log('PASS getLiveSession / childEventBoundary')
}

// ---------------------------------------------------------------------------
// waitForChildReply — live-session poll, persistence fallback, timeout, abort
// ---------------------------------------------------------------------------

{
  // A quiet session never yields a reply: the wait times out with undefined.
  const log = [ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 }), ev('turn/end', { turn: 1, reason: { kind: 'completed' } })]
  const live = { seq: log.length, snapshotEvents: (from = 0) => log.slice(from) }
  const ctx = fakeSessions(new Map([['c', live]]))
  const timed = await waitForChildReply({ ctx, childId: 'c', boundary: log.length, signal: new AbortController().signal, timeoutMs: 20, pollMs: 1 })
  assert.equal(timed, undefined, 'quiet session times out with undefined')

  appendTurn(log, 2, 'completed', 'here is the follow-up answer')
  const replied = await waitForChildReply({ ctx, childId: 'c', boundary: log.length - 3, signal: new AbortController().signal, pollMs: 1 })
  assert.equal(replied.stopReason, 'completed', 'completed reply turn')
  assert.deepEqual(replied.output, [{ type: 'text', text: 'here is the follow-up answer' }], 'reply output is the turn answer')

  // Boundary excludes prior turns only: a boundary of 0 sees the latest
  // accounting turn in the whole log.
  const whole = await waitForChildReply({ ctx, childId: 'c', boundary: 0, signal: new AbortController().signal, pollMs: 1 })
  assert.equal(whole.stopReason, 'completed', 'boundary 0 reads the latest accounting turn')
  console.log('PASS waitForChildReply live path (quiet timeout + reply + boundary)')
}

{
  // Abnormal turn end: the stop reason surfaces, partial output kept.
  const log = []
  const live = { seq: 0, snapshotEvents: (from = 0) => log.slice(from) }
  const ctx = fakeSessions(new Map([['c', live]]))
  appendTurn(log, 1, 'max-tokens', 'partial thoughts')
  const reply = await waitForChildReply({ ctx, childId: 'c', boundary: 0, signal: new AbortController().signal, pollMs: 1 })
  assert.equal(reply.stopReason, 'max-tokens', 'abnormal stop reason surfaces')
  assert.deepEqual(reply.output, [{ type: 'text', text: 'partial thoughts' }], 'partial output kept')
  console.log('PASS waitForChildReply abnormal turn end')
}

{
  // Persistence fallback: the child settled and left the registry mid-wait.
  const persisted = [
    ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 }),
    { type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'settled answer' }] } } },
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ]
  let liveGone = false
  const live = { seq: persisted.length, snapshotEvents: () => { if (liveGone) throw new Error('gone'); return [] } }
  const ctx = {
    get(name) {
      if (name === 'sessions') return { get: () => (liveGone ? undefined : live) }
      if (name === 'sessionPersistence') return { inspect: async () => ({ events: persisted }) }
      return undefined
    },
  }
  const quiet = await waitForChildReply({ ctx, childId: 'c', boundary: persisted.length, signal: new AbortController().signal, timeoutMs: 20, pollMs: 1 })
  assert.equal(quiet, undefined, 'empty post-boundary window -> no reply yet')
  liveGone = true
  const settled = await waitForChildReply({ ctx, childId: 'c', boundary: 0, signal: new AbortController().signal, pollMs: 1 })
  assert.equal(settled.stopReason, 'completed', 'persistence-backed window yields the settled turn')
  assert.deepEqual(settled.output, [{ type: 'text', text: 'settled answer' }], 'settled answer from persistence')
  console.log('PASS waitForChildReply persistence fallback')
}

{
  // Caller cancellation propagates out of the wait loop.
  const controller = new AbortController()
  const ctx = fakeSessions(new Map([['c', { seq: 0, snapshotEvents: () => [] }]]))
  const pending = waitForChildReply({ ctx, childId: 'c', boundary: 0, signal: controller.signal, pollMs: 5 })
  controller.abort()
  await assert.rejects(pending, undefined, 'abort rejects the wait')
  console.log('PASS waitForChildReply cancellation')
}

// ---------------------------------------------------------------------------
// `ask_agent` tool execute() — real tool, fake ctx doubles
// ---------------------------------------------------------------------------

const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-interactive-'))
writeFileSync(
  join(AGENTS_DIR, 'workhorse.md'),
  '---\nname: workhorse\ndisplay_name: 牛马狗\ndescription: "demo agent"\n---\nYou are the workhorse body.\n',
)

const PARENT = {
  id: 'session-parent',
  options: {},
  session: { header: { delegationDepth: 0 } },
}
const EXEC = { agent: PARENT, signal: new AbortController().signal }

/** Continuable child row with the display label the tool resolves by. */
const WORKHORSE_CHILD = (id, over = {}) => (
  { kind: 'child', id, activity: 'running', mode: 'continuable', label: '牛马狗', ...over }
)

try {
  // Arg validation: exactly one of agent / agent_id; non-blank message.
  {
    const tool = askAgentTool({}, { agentsDir: AGENTS_DIR, toolName: 'ask_agent' })
    await assert.rejects(tool.execute({ message: 'x' }, EXEC), /exactly one of "agent"/, 'neither target fails')
    await assert.rejects(tool.execute({ agent: 'workhorse', agent_id: 'c1', message: 'x' }, EXEC), /exactly one of "agent"/, 'both targets fail')
    await assert.rejects(tool.execute({ agent: 'workhorse', message: '  ' }, EXEC), /"message" is required/, 'blank message fails')
    console.log('PASS ask_agent arg validation')
  }

  // By-name happy path: newest continuable child, delivery + awaited reply.
  {
    const log = []
    appendTurn(log, 1, 'completed', 'initial answer')
    const live = { seq: log.length, snapshotEvents: (from = 0) => log.slice(from) }
    const ctx = {
      sent: [],
      subagents: {
        async listChildren() {
          return [
            WORKHORSE_CHILD('old-one-shot', { mode: 'one-shot', activity: 'inactive' }),
            WORKHORSE_CHILD('older', { activity: 'inactive' }),
            WORKHORSE_CHILD('newest'),
          ]
        },
        async sendMessage(sender, targetId, content) {
          ctx.sent.push({ sender: sender.id, targetId: String(targetId), text: content[0]?.text })
          appendTurn(log, 2, 'completed', 'the follow-up reply')
          live.seq = log.length
          return 'msg-9'
        },
      },
      get(name) {
        return name === 'sessions' ? { get: (id) => (String(id) === 'newest' ? live : undefined) } : undefined
      },
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    const result = await tool.execute({ agent: 'workhorse', message: 'what is the status?' }, EXEC)
    assert.equal(result.kind, 'agent-reply', 'reply kind')
    assert.equal(ctx.sent[0]?.targetId, 'newest', 'newest continuable child addressed')
    assert.equal(ctx.sent[0]?.text, 'what is the status?', 'message delivered verbatim')
    assert.equal(ctx.sent[0]?.sender, 'session-parent', 'sender is the calling parent')
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('the follow-up reply'), 'reply text returned')
    console.log('PASS ask_agent by-name happy path (newest continuable + reply)')
  }

  // agent_id targets verbatim; a one-shot id fails with the background hint.
  {
    const ctx = {
      subagents: {
        async listChildren() { return [] },
        async sendMessage() {
          throw new SubagentError('subagent "c1" has no supported continuation state and cannot be resumed; choose a different target', 'NOT_RESUMABLE')
        },
      },
      get: () => undefined,
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    await assert.rejects(
      tool.execute({ agent_id: 'c1', message: 'x' }, EXEC),
      /only background dispatches/,
      'one-shot target explains the background requirement',
    )
    console.log('PASS ask_agent one-shot target hint')
  }

  // No candidate: the error names the background dispatch remedy.
  {
    const ctx = {
      subagents: {
        async listChildren() { return [WORKHORSE_CHILD('x', { mode: 'one-shot', activity: 'inactive' })] },
        async sendMessage() { throw new Error('must not be reached') },
      },
      get: () => undefined,
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    await assert.rejects(
      tool.execute({ agent: 'workhorse', message: 'x' }, EXEC),
      /no background run of agent "workhorse"/,
      'missing continuable candidate fails loudly',
    )
    console.log('PASS ask_agent no-candidate error')
  }

  // Timeout: delivery confirmed, reply not awaited.
  {
    const ctx = {
      sent: [],
      subagents: {
        async listChildren() { return [WORKHORSE_CHILD('newest')] },
        async sendMessage() { ctx.sent.push(true); return 'msg-1' },
      },
      get(name) {
        return name === 'sessions' ? { get: (id) => (String(id) === 'newest' ? { seq: 0, snapshotEvents: () => [] } : undefined) } : undefined
      },
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    const result = await tool.execute({ agent_id: 'newest', message: 'x', timeout: 0.05 }, EXEC)
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('Message delivered to subagent newest'), 'delivery confirmed on timeout')
    assert.ok(text.includes('no reply turn completed'), 'timeout accounted honestly')
    console.log('PASS ask_agent timeout delivery note')
  }

  // Cold child: boundary comes from persistence; the reply lands post-cold-resume.
  {
    const prior = [
      ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 }),
      ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    // A cold-resumed session replays the persisted prefix, so the live log
    // starts as a copy of `prior` and the reply window holds whole turns.
    const log = [...prior]
    const live = { seq: log.length, snapshotEvents: (from = 0) => log.slice(from) }
    const ctx = {
      sent: [],
      subagents: {
        async listChildren() { return [WORKHORSE_CHILD('cold', { activity: 'inactive' })] },
        async sendMessage(sender, targetId) {
          ctx.sent.push({ targetId: String(targetId) })
          appendTurn(log, 2, 'completed', 'resumed and answered')
          live.seq = log.length
          return 'msg-2'
        },
      },
      get(name) {
        if (name === 'sessions') return { get: (id) => (String(id) === 'cold' ? live : undefined) }
        if (name === 'sessionPersistence') return { inspect: async () => ({ events: prior }) }
        return undefined
      },
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    const result = await tool.execute({ agent: 'workhorse', message: 'continue please' }, EXEC)
    assert.equal(ctx.sent[0]?.targetId, 'cold', 'cold continuable child addressed')
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('resumed and answered'), 'post-resume reply returned')
    console.log('PASS ask_agent cold child (persistence boundary + cold-resume reply)')
  }

  // Abnormal reply turn: status line prefixes the partial output.
  {
    const log = []
    const live = { seq: 0, snapshotEvents: (from = 0) => log.slice(from) }
    const ctx = {
      subagents: {
        async listChildren() { return [WORKHORSE_CHILD('c')] },
        async sendMessage() {
          appendTurn(log, 3, 'error', 'half a sentence')
          live.seq = log.length
          return 'msg-3'
        },
      },
      get(name) { return name === 'sessions' ? { get: () => live } : undefined },
    }
    const tool = askAgentTool(ctx, { agentsDir: AGENTS_DIR, toolName: 'ask_agent', pollMs: 1 })
    const result = await tool.execute({ agent_id: 'c', message: 'x' }, EXEC)
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.match(text, /follow-up to subagent c/, 'status line names the target')
    assert.match(text, /half a sentence/, 'partial output preserved')
    console.log('PASS ask_agent abnormal reply turn')
  }
} finally {
  rmSync(AGENTS_DIR, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// `use_agent` background dispatch — real tool, fake ctx doubles
// ---------------------------------------------------------------------------

const HERMETIC_HOME = mkdtempSync(join(tmpdir(), 'registry-interactive-home-'))
const PREV_DSH_HOME = process.env.DSH_HOME
process.env.DSH_HOME = HERMETIC_HOME

const BG_AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-interactive-bg-'))
writeFileSync(
  join(BG_AGENTS_DIR, 'worker.md'),
  '---\nname: worker\ndescription: "bg agent"\nbackground: true\ndeep: 0\n---\nYou are the worker body.\n',
)
writeFileSync(
  join(BG_AGENTS_DIR, 'fg.md'),
  '---\nname: fg\ndescription: "fg agent"\n---\nYou are the foreground body.\n',
)

function bgCtx({ started = [] } = {}) {
  return {
    started,
    subagents: {
      async listChildren() { return [] },
      async start() { throw new Error('one-shot start must not run on the background path') },
      async startContinuable(spec) {
        started.push(spec)
        return { childId: 'durable-child-1', messageId: 'm-1' }
      },
    },
    get() { return undefined },
  }
}

try {
  // Frontmatter default: `background: true` dispatches continuable.
  {
    const ctx = bgCtx()
    const tool = runAgentTool(ctx, { agentsDir: BG_AGENTS_DIR, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
    const result = await tool.execute({ agent: 'worker', prompt: 'do the long task' }, EXEC)
    assert.equal(result.kind, 'agent-start', 'background dispatch returns agent-start')
    assert.equal(result.subagentId, 'durable-child-1', 'durable id surfaced')
    assert.equal(result.label, 'worker', 'label defaulted to the agent name')
    assert.equal(ctx.started.length, 1, 'exactly one continuable start')
    const spec = ctx.started[0]
    assert.equal(spec.provider, 'spawn', 'provider passed through')
    assert.equal(spec.label, 'worker', 'durable label = display_name ?? name')
    assert.equal(spec.request.persona, 'You are the worker body.', 'file body applied as persona')
    assert.deepEqual(spec.request.toolFilter, { deny: ['subagent', 'subagent_fork', 'workflow', 'ralph', 'use_agent'] }, 'leaf toolFilter carried onto the continuable child')
    assert.equal(spec.request.maxDepth, undefined, 'leaf carries no maxDepth (same deep semantics as one-shot)')
    assert.equal(spec.request.label, undefined, 'request-level label stripped (durable label lives on the spec)')
    const text = result.output.map((b) => b.text ?? '').join('')
    assert.ok(text.includes('durable subagent id durable-child-1'), 'id echoed in the guidance text')
    assert.ok(text.includes('ask_agent'), 'follow-up tool referenced')
    console.log('PASS use_agent background via frontmatter (persona + leaf filter + id)')
  }

  // Per-call override: explicit false on a background agent -> foreground.
  {
    const ctx = bgCtx()
    ctx.subagents.start = async (provider, request) => {
      ctx.started.push({ oneShot: true, provider, request })
      return {
        id: 'oneshot',
        localAgent: undefined,
        result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'done' }] }),
        async dispose() {},
      }
    }
    const tool = runAgentTool(ctx, { agentsDir: BG_AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    const result = await tool.execute({ agent: 'worker', prompt: 'x', background: false }, EXEC)
    assert.equal(result.kind, 'agent-result', 'explicit background:false -> foreground one-shot')
    assert.equal(ctx.started[0]?.oneShot, true, 'one-shot start used')
    console.log('PASS use_agent per-call background:false overrides frontmatter')
  }

  // Per-call override: explicit true on a foreground agent -> continuable.
  {
    const ctx = bgCtx()
    const tool = runAgentTool(ctx, { agentsDir: BG_AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    const result = await tool.execute({ agent: 'fg', prompt: 'x', background: true }, EXEC)
    assert.equal(result.kind, 'agent-start', 'explicit background:true -> continuable')
    assert.equal(ctx.started[0].request.persona, 'You are the foreground body.', 'persona from the right file')
    assert.equal(ctx.started[0].request.toolFilter, undefined, 'non-leaf continuable child has no toolFilter')
    assert.equal(typeof ctx.started[0].request.maxDepth, 'number', 'relative maxDepth carried')
    console.log('PASS use_agent per-call background:true')
  }

  // resume and background are mutually exclusive.
  {
    const ctx = bgCtx()
    const tool = runAgentTool(ctx, { agentsDir: BG_AGENTS_DIR, provider: 'spawn', toolName: 'use_agent' })
    await assert.rejects(
      tool.execute({ agent: 'fg', prompt: 'x', background: true, resume: true }, EXEC),
      /mutually exclusive/,
      'background+resume rejected',
    )
    assert.equal(ctx.started.length, 0, 'nothing started on the rejected call')
    console.log('PASS use_agent background/resume mutual exclusion')
  }
} finally {
  if (PREV_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = PREV_DSH_HOME
  rmSync(HERMETIC_HOME, { recursive: true, force: true })
  rmSync(BG_AGENTS_DIR, { recursive: true, force: true })
}

console.log('\nAll interactive tests passed.')
