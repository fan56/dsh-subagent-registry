// Real SDK lifecycle regression; model and descendant creation are scripted.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import FsLocal from '@deepseek-ai/dsh-fs-local'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as Registry from '../lib/index.js'
const deferred = () => Promise.withResolvers()
const ctx = new Context()
const root = await mkdtemp(join(tmpdir(), 'registry-verifier-lifecycle-'))
const signal = new AbortController().signal
let parent, scenario
const ids = []
async function startDescendant(owner, model) {
  const request = { parent: owner, prompt: [{ type: 'text', text: 'actual descendant' }], agentOptions: { provider: 'probe', model }, persona: 'descendant fixture' }
  const result = typeof ctx.subagents.startActivation === 'function'
    ? await ctx.subagents.startActivation({ provider: 'spawn', label: model, request, signal, delivery: 'parent' })
    : await ctx.subagents.startContinuable({ provider: 'spawn', label: model, request, signal })
  ids.push(result.childId)
  return result.childId
}
class Adapter extends LlmAdapter {
  scripts = []
  async resolveModel(provider, id) { return { provider, id, name: id, reasoning: { efforts: [{ id: 'high', name: 'High' }] } } }
  async *stream(options) {
    let entry
    if (options.model === 'parent') entry = { text: 'PARENT_SETTLEMENT' }
    else if (options.model === 'worker') {
      entry = this.scripts.shift() ?? { text: 'ROOT_AFTER_DESC' }
      assert.equal(options.reasoningEffort, 'high')
      assert.match(JSON.stringify(options.messages.filter(m => m.role === 'system')), /Worker persona retained/)
      const worker = ctx.agents.list().find(a => a.options.model === 'worker')
      assert(worker, 'real live worker identity')
      scenario.workerId = worker.id
      if (entry.tree) await startDescendant(worker, 'desc')
    } else if (options.model === 'desc') {
      const descendant = ctx.agents.list().find(a => a.options.model === 'desc')
      assert(descendant)
      // A settlement starts another model turn; create the tree only once.
      if (!scenario.spawned) { scenario.spawned = true; await startDescendant(descendant, 'grand') }
      entry = { text: 'DESC_EARLY' }
    } else if (options.model === 'grand' || options.model === 'unrelated') {
      const gate = options.model === 'grand' ? scenario.grand : scenario.unrelated
      gate.started.resolve()
      await new Promise((resolve, reject) => {
        const abort = () => { gate.aborted = true; reject(new Error('fixture model aborted')) }
        options.signal.addEventListener('abort', abort, { once: true })
        if (options.signal.aborted) abort()
        else gate.release.promise.then(resolve, reject)
      })
      entry = { text: 'DESC_DONE' }
    } else throw new Error('unexpected model ' + options.model)
    if (entry.hang) {
      scenario.workerStarted.resolve()
      await new Promise((_, reject) => {
        const abort = () => reject(new Error('fixture worker aborted'))
        if (options.signal.aborted) abort()
        else options.signal.addEventListener('abort', abort, { once: true })
      })
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: entry.text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: entry.text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: entry.limit ? 'max-tokens' : 'stop' } }
  }
}
const adapter = new Adapter()
const freshScenario = () => ({ spawned: false, grand: { started: deferred(), release: deferred(), aborted: false }, unrelated: { started: deferred(), release: deferred(), aborted: false }, workerStarted: deferred() })
const textOf = r => r.output.filter(b => b.type === 'text').map(b => b.text).join('\n')
const assertGone = () => { for (const id of [scenario.workerId, ...ids]) { assert.equal(ctx.agents.get(id), undefined, `Agent released ${id}`); assert.equal(ctx.sessions.get(id), undefined, `Session released ${id}`) } ids.length = 0 }
try {
  const agentsDir = join(root, 'agents'); await mkdir(agentsDir)
  await writeFile(join(agentsDir, 'worker.md'), '---\nname: worker\nmodel: probe/worker\nthinking: high\ndeep: 3\n---\nWorker persona retained\n')
  for (const Plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SessionQueryEngine, SystemPrompt, FsLocal]) await ctx.plugin(Plugin)
  if (process.env.DSH_TEST_HOST_VERSION !== '0.2.0-rc.2') await ctx.plugin((await import('@deepseek-ai/dsh-working-directory')).default)
  await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' }); await ctx.plugin(SkillRegistry)
  ctx.llm.registerAdapter(['probe'], adapter)
  await ctx.plugin(Registry, { agentsDir, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
  let parentHandle = await ctx.agents.create({ sessionId: SessionId('probe-parent'), agentOptions: { provider: 'probe', model: 'parent' } })
  parent = parentHandle.agent
  const call = (args, ownSignal = signal) => ctx.tools.get('use_agent', scopeOf(parent.ctx)).execute({ agent: 'worker', prompt: 'probe', ...args }, { agent: parent, signal: ownSignal })
  // A successful fresh foreground waits for a real two-level tree and reads the late suffix.
  scenario = freshScenario(); adapter.scripts.push({ text: 'ROOT_EARLY', tree: true })
  let completed = false
  const fresh = call({ fresh: true }).finally(() => { completed = true })
  await scenario.grand.started.promise
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(completed, false, 'foreground must wait for active grandchild')
  scenario.grand.release.resolve()
  assert.match(textOf(await fresh), /ROOT_AFTER_DESC/)
  assertGone()
  console.log('PASS actual foreground descendant wait and final output suffix')
  // Persist one interrupted run, then resume the same identity with a real tree.
  scenario = freshScenario(); adapter.scripts.push({ text: 'INTERRUPTED', limit: true })
  await assert.rejects(call({ fresh: true }), /token limit/)
  const interrupted = scenario.workerId
  assertGone()
  scenario = freshScenario(); adapter.scripts.push({ text: 'ROOT_EARLY', tree: true })
  completed = false
  const resumed = call({ resume: true }).finally(() => { completed = true })
  await scenario.grand.started.promise
  assert.equal(scenario.workerId, interrupted)
  const beforeBusy = (await ctx.subagents.listChildren(parent.id)).length
  await assert.rejects(call({ resume: true }), /already in progress|busy/)
  assert.equal((await ctx.subagents.listChildren(parent.id)).length, beforeBusy, 'busy resume must not create another task')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(completed, false, 'resume must wait for active grandchild')
  scenario.grand.release.resolve()
  assert.match(textOf(await resumed), /ROOT_AFTER_DESC/)
  assertGone()
  console.log('PASS actual foreground resume waits for descendants and retains session/persona/model/thinking')
  // Cancellation drains the exact resumed tree while preserving another parent's running child.
  scenario = freshScenario(); adapter.scripts.push({ text: 'INTERRUPTED', limit: true })
  await assert.rejects(call({ fresh: true }), /token limit/); assertGone()
  scenario = freshScenario()
  const otherHandle = await ctx.agents.create({ sessionId: SessionId('other-parent'), agentOptions: { provider: 'probe', model: 'parent' } })
  const unrelatedId = await startDescendant(otherHandle.agent, 'unrelated'); ids.splice(ids.indexOf(unrelatedId), 1)
  await scenario.unrelated.started.promise
  adapter.scripts.push({ text: 'ROOT_EARLY', tree: true })
  const cancel = new AbortController()
  const cancelled = call({ resume: true }, cancel.signal)
  const cancellationCheck = assert.rejects(cancelled, /cancel/)
  await scenario.grand.started.promise
  cancel.abort()
  await cancellationCheck
  assert.equal(scenario.grand.aborted, true); assertGone()
  assert(ctx.agents.get(unrelatedId), 'unrelated parent tree remains live')
  assert.equal(scenario.unrelated.aborted, false)
  const unrelated = scenario.unrelated
  unrelated.release.resolve(); await otherHandle.dispose()
  console.log('PASS actual resume cancellation drains exact tree without cancelling unrelated parent')
  // An independently owned parent's disposal aborts the resumed drive and removes every live resource.
  scenario = freshScenario(); adapter.scripts.push({ text: 'INTERRUPTED', limit: true })
  await assert.rejects(call({ fresh: true }), /token limit/); assertGone()
  scenario = freshScenario(); adapter.scripts.push({ text: 'ROOT_EARLY', tree: true, hang: true })
  const teardown = call({ resume: true })
  const teardownCheck = assert.rejects(teardown, /cancel|disposed|abort/)
  await scenario.grand.started.promise; await scenario.workerStarted.promise
  await parentHandle.dispose(); await teardownCheck
  assert.equal(scenario.grand.aborted, true); assertGone()
  assert.equal(ctx.agents.get(parent.id), undefined); assert.equal(ctx.sessions.get(parent.id), undefined)
  console.log('PASS actual parent disposal aborts resumed run and releases descendant agents/sessions')
  assert.equal(adapter.scripts.length, 0)
  console.log(`lifecycle probe: PASS SDK ${process.env.DSH_TEST_HOST_VERSION}; real services/persistence/manager, scripted model and harness descendant starts; no external model or PTC execution`)
} finally {
  await ctx.fiber.dispose()
  assert(root.startsWith(join(tmpdir(), 'registry-verifier-lifecycle-')))
  await rm(root, { recursive: true, force: true })
}
