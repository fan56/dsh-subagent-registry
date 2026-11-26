// Lifecycle repeat probe: 100 consecutive fresh + resume drives with fake
// hosts, asserting A runs exactly ONE turn per drive and no per-run lock or
// record leaks. No LLM, no real host. Run: node test/lifecycle-repeat.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { driveResumedRun } from '../lib/resume.js'
import { runAgentTool } from '../lib/tool-run-agent.js'
import { isRegistryChild, recordRegistryChild, releaseRegistryChild } from '../lib/caller-guard.js'

const ROUNDS = 100
const dir = mkdtempSync(join(tmpdir(), 'registry-lifecycle-repeat-'))
writeFileSync(join(dir, 'worker.md'), '---\nname: worker\nmodel: probe/worker\n---\nworker persona\n')
const parent = {
  id: 'lifecycle-parent', options: {},
  session: { header: {}, requestHeader: () => undefined },
}
const signal = new AbortController().signal
const ev = (type, data = {}) => ({ type, data })
const PRIOR = [
  ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 0 }),
  ev('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'first attempt died' } } }),
]

/** Minimal child scope `applyChildComposition` writes into on resume. */
function childScope() {
  return {
    get() { return undefined },
    systemPrompt: { getContextOrder: () => 0, getSectionOrder: () => 0, context() {}, section() {} },
    tools: { restrict() {} },
  }
}

/** One resumed child: its log records exactly one continuation turn per followup. */
function resumeBackend(childId) {
  const events = [...PRIOR]
  const scope = childScope()
  let followups = 0
  const child = {
    status: 'idle',
    session: {
      header: { parentSession: parent.id, origin: 'subagent' },
      events,
      get seq() { return events.length },
      snapshotEvents(from = 0) { return events.slice(from) },
    },
    followup() {
      followups += 1
      const turn = 1 + followups
      events.push(ev('turn/start', { turn }), ev('step/start', { turn, step: 0 }))
      events.push({
        type: 'assistant/message',
        data: { message: { role: 'assistant', content: [{ type: 'text', text: `RESUMED_${childId}` }] }, stream: [] },
      })
      events.push(ev('turn/end', { turn, reason: { kind: 'completed' } }))
    },
    whenIdle() { return Promise.resolve() },
    cancel() {},
  }
  const ctx = {
    get() { return undefined },
    on() { return () => {} },
    agents: {
      get: id => id === parent.id ? parent : undefined,
      async resume(options) {
        options.setup?.(scope, child)?.commit?.()
        return { agent: child, async dispose() {} }
      },
    },
  }
  return { ctx, events, get followups() { return followups } }
}

try {
  for (let round = 0; round < ROUNDS; round += 1) {
    // Fresh foreground: one activation, one model turn, verbatim A output,
    // one disposal, no host seam left behind.
    const started = []
    const disposed = []
    const freshCtx = {
      logger: { warn() {} },
      started,
      subagents: {
        startActivation: async (spec) => {
          let resolve
          const result = new Promise(r => { resolve = r })
          started.push({ spec, resolve })
          return { childId: `fresh-${round}`, result, dispose: async () => { disposed.push(spec) } }
        },
      },
      get: () => undefined,
      agents: { get: () => undefined },
      on: () => () => {},
    }
    const pending = runAgentTool(freshCtx, { agentsDir: dir, provider: 'spawn', toolName: 'use_agent' })
      .execute({ agent: 'worker', prompt: 'p', fresh: true }, { agent: parent, signal })
    assert.equal(started.length, 1, `round ${round}: exactly one fresh activation`)
    started[0].resolve({ stopReason: 'completed', output: [{ type: 'text', text: `A_${round}` }] })
    assert.deepEqual((await pending).output, [{ type: 'text', text: `A_${round}` }], `round ${round}: A output verbatim`)
    assert.equal(disposed.length, 1, `round ${round}: activation disposed once`)

    // Resume: the recovered worker is a recorded registry child, but the
    // top-level parent drives it. Two back-to-back resumes prove the per-child
    // lock is released each round (no state leak across 100 runs).
    const childId = `resume-${round}`
    recordRegistryChild(childId)
    assert.equal(isRegistryChild(childId), true, `round ${round}: recovered worker is recorded`)
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const backend = resumeBackend(childId)
      const result = await driveResumedRun({
        ctx: backend.ctx, parent, childId, persona: 'worker persona',
        toolFilter: { deny: ['subagent', 'use_agent'] },
        continuationPrompt: 'continue', noticeSummary: 's', signal,
      })
      assert.equal(result.stopReason, 'completed', `round ${round}/${attempt}: resume completes`)
      assert.deepEqual(result.output, [{ type: 'text', text: `RESUMED_${childId}` }], `round ${round}/${attempt}: A output verbatim`)
      assert.equal(backend.followups, 1, `round ${round}/${attempt}: exactly ONE continuation turn`)
      assert.equal(backend.events.filter(e => e.type === 'turn/end').length, 2,
        `round ${round}/${attempt}: one prior turn + one continuation turn`)
    }
    releaseRegistryChild(childId)
    assert.equal(isRegistryChild(childId), false, `round ${round}: record released`)
  }
  console.log(`PASS ${ROUNDS} consecutive fresh+resume cycles: A exactly one turn per drive, no lock/record leak`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
