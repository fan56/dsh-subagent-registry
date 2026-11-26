// Real SDK lifecycle regression: model output is scripted. Subagents cannot
// spawn subagents, so this exercises fresh/resume/cancel/dispose without any
// descendant tree and asserts the child schema carries no spawn tool.
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
import * as JsonlPersistenceModule from '@deepseek-ai/dsh-session-persistence-jsonl'
const JsonlSessionPersistence = JsonlPersistenceModule.default ?? JsonlPersistenceModule
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as Registry from '../lib/index.js'

const hostVersion = process.env.DSH_TEST_HOST_VERSION ?? ''
const modernHost = hostVersion === '' || Number(/^0\.2\.(\d+)/.exec(hostVersion)?.[1] ?? 0) >= 2
const SPAWN_NAMES = ['subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code', 'workflow', 'ralph', 'use_agent']
const deferred = () => Promise.withResolvers()
const ctx = new Context()
const root = await mkdtemp(join(tmpdir(), 'registry-verifier-lifecycle-'))
const signal = new AbortController().signal
let parent
class Adapter extends LlmAdapter {
  scripts = []
  started
  workerTurns = 0
  async resolveModel(provider, id) { return { provider, id, name: id, reasoning: { efforts: [{ id: 'high', name: 'High' }] } } }
  async *stream(options) {
    let entry
    if (options.model === 'parent') entry = { text: 'PARENT_SETTLEMENT' }
    else if (options.model === 'worker') {
      this.workerTurns += 1
      entry = this.scripts.shift() ?? { text: 'WORKER_DEFAULT' }
      assert.equal(options.reasoningEffort, 'high', 'frontmatter thinking survives fresh and resumed runs')
      assert.match(JSON.stringify(options.messages.filter(m => m.role === 'system')), /Worker persona retained/)
      for (const name of SPAWN_NAMES) {
        assert.ok(!(options.tools ?? []).some(tool => tool.name === name), `child schema has no ${name}`)
      }
      const worker = ctx.agents.list().find(a => a.options.model === 'worker')
      assert(worker, 'real live worker identity')
      this.started?.resolve(worker.id)
      if (entry.hang) {
        await new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('fixture worker aborted')), { once: true })
        })
      }
    } else throw new Error('unexpected model ' + options.model)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: entry.text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: entry.text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: entry.limit ? 'max-tokens' : 'stop' } }
  }
}
const adapter = new Adapter()
const textOf = r => r.output.filter(b => b.type === 'text').map(b => b.text).join('\n')
const assertGone = async () => {
  const bound = Date.now() + 2000
  while (ctx.agents.list().some(a => a.options.model === 'worker') && Date.now() < bound) {
    await new Promise(resolve => setImmediate(resolve))
  }
  for (const agent of ctx.agents.list()) {
    if (agent.options.model === 'worker') assert.fail(`worker agent still live: ${agent.id}`)
  }
}
try {
  const agentsDir = join(root, 'agents'); await mkdir(agentsDir)
  await writeFile(join(agentsDir, 'worker.md'), '---\nname: worker\nmodel: probe/worker\nthinking: high\ndeep: 3\n---\nWorker persona retained\n')
  for (const Plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SessionQueryEngine, SystemPrompt, FsLocal]) await ctx.plugin(Plugin)
  if (hostVersion !== '0.2.0-rc.2') await ctx.plugin((await import('@deepseek-ai/dsh-working-directory')).default)
  await ctx.plugin(ToolRuntime)
  if (modernHost) await ctx.plugin((await import('@deepseek-ai/dsh-tool-executor-native')))
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' }); await ctx.plugin(SkillRegistry)
  ctx.llm.registerAdapter(['probe'], adapter)
  await ctx.plugin(Registry, { agentsDir, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
  const parentHandle = await ctx.agents.create({ sessionId: SessionId('probe-parent'), agentOptions: { provider: 'probe', model: 'parent' } })
  parent = parentHandle.agent
  const call = (args, ownSignal = signal) => ctx.tools.get('use_agent', scopeOf(parent.ctx)).execute({ agent: 'worker', prompt: 'probe', ...args }, { agent: parent, signal: ownSignal })

  // Fresh foreground: A's own output, verbatim — no provenance, no aggregation.
  adapter.scripts.push({ text: 'ROOT_OK' })
  const freshText = textOf(await call({ fresh: true }))
  assert.equal(freshText, 'ROOT_OK', 'fresh result is A output verbatim')
  assert.equal(adapter.workerTurns, 1, 'A runs exactly one model turn — no join or second round')
  await assertGone()
  console.log('PASS actual fresh foreground returns A output unchanged (one turn)')

  // Interrupted run then resume: persisted work is kept and the continuation
  // answer comes back with resume provenance.
  adapter.scripts.push({ text: 'INTERRUPTED', limit: true })
  await assert.rejects(call({ fresh: true }), /token limit/)
  assert.equal(adapter.workerTurns, 2, 'the interrupted run is exactly one A turn')
  await assertGone()
  adapter.scripts.push({ text: 'RESUME_OK' })
  const resumedText = textOf(await call({ resume: true }))
  assert.match(resumedText, /Resumed from the interrupted prior run/)
  assert.match(resumedText, /RESUME_OK$/)
  assert.equal(adapter.workerTurns, 3, 'resume drives exactly one continuation turn')
  await assertGone()
  console.log('PASS actual foreground resume retains session, persona, model and thinking (one turn)')

  // Caller cancellation rejects the foreground promptly and disposes the child.
  adapter.started = deferred()
  adapter.scripts.push({ text: 'HANG', hang: true })
  const controller = new AbortController()
  const startedAt = Date.now()
  const cancelled = call({ fresh: true }, controller.signal)
  const workerId = await adapter.started.promise
  controller.abort()
  await assert.rejects(cancelled, /abort|cancel/)
  assert.equal(adapter.workerTurns, 4, 'cancelled A started exactly one turn')
  assert.ok(Date.now() - startedAt < 2000, 'abort rejects the foreground promptly')
  await assertGone()
  assert.equal(ctx.sessions.get(workerId), undefined, 'cancelled child session released')
  console.log('PASS caller cancellation rejects foreground and releases resources')

  // Disposing the calling parent aborts its foreground run and releases every
  // live resource it owns.
  adapter.started = deferred()
  adapter.scripts.push({ text: 'HANG', hang: true })
  // A real host hands the tool the parent loop's signal, which aborts on
  // disposal. A direct tool call has no loop, so model that edge here.
  const teardownController = new AbortController()
  ctx.on('agent/disposed', ev => {
    if (ev.agent === parent) teardownController.abort(new DOMException('parent disposed', 'AbortError'))
  })
  const teardown = call({ fresh: true }, teardownController.signal)
  const teardownCheck = assert.rejects(teardown, /cancel|disposed|abort/)
  await adapter.started.promise
  await parentHandle.dispose(); await teardownCheck
  assert.equal(adapter.workerTurns, 5, 'parent teardown aborts the single live A turn')
  await assertGone()
  assert.equal(ctx.agents.get(parent.id), undefined); assert.equal(ctx.sessions.get(parent.id), undefined)
  console.log('PASS parent disposal aborts foreground run and releases live resources')
  assert.equal(adapter.scripts.length, 0)
  console.log(`lifecycle probe: PASS SDK ${hostVersion || 'pinned rc.5'}; real services/persistence/manager, scripted model; no external model or PTC execution`)
} finally {
  await ctx.fiber.dispose()
  assert(root.startsWith(join(tmpdir(), 'registry-verifier-lifecycle-')))
  await rm(root, { recursive: true, force: true })
}
