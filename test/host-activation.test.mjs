// Real published SDK services, persistence, manager and spawn; only the model is scripted.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
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
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import * as Delegate from '@deepseek-ai/dsh-tool-subagent'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as Registry from '../lib/index.js'
import { createLegacyDescendantJoin } from '../lib/host-compat.js'

class ScriptedAdapter extends LlmAdapter {
  script = []
  active
  async resolveModel(provider, id) {
    return { provider, id, name: id, reasoning: { efforts: [{ id: 'high', name: 'High' }] } }
  }
  async *stream(options) {
    const entry = options.model === 'parent' ? { text: 'settlement received' } : this.script.shift()
    assert(entry, 'unexpected child model call')
    if (options.model !== 'parent') {
      assert.equal(options.model, 'child', 'fresh and resumed children use the configured model')
      assert.equal(options.reasoningEffort, 'high', 'frontmatter thinking survives resume')
      assert.match(JSON.stringify(options.messages.filter(message => message.role === 'system')), /Follow the task\./)
      assert.deepEqual((options.tools ?? []).filter(tool => ['subagent', 'subagent_fork', 'use_agent', 'scoped_custom'].includes(tool.name)).map(tool => tool.name), [], 'leaf tools stay restricted')
    }
    this.active?.()
    if (entry.error) throw new Error(entry.error)
    if (entry.hang) {
      await new Promise((_, reject) => {
        const cancel = () => reject(new Error('model aborted'))
        if (options.signal.aborted) cancel()
        else options.signal.addEventListener('abort', cancel, { once: true })
      })
    }
    const text = entry.text
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } }
    yield { type: 'finish', reason: { kind: entry.limit ? 'max-tokens' : 'stop' } }
  }
}

const root = await mkdtemp(join(tmpdir(), 'dsh-registry-host-'))
const ctx = new Context()
const adapter = new ScriptedAdapter()
let parentJoin
try {
  const agentsDir = join(root, 'agents')
  await mkdir(agentsDir)
  await writeFile(join(agentsDir, 'worker.md'), '---\nname: worker\nmodel: smoke/child\nthinking: high\ndeep: 0\n---\nFollow the task.\n')
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SessionQueryEngine)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(FsLocal)
  if (process.env.DSH_TEST_HOST_VERSION !== '0.2.0-rc.2') await ctx.plugin((await import('@deepseek-ai/dsh-working-directory')).default)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  ctx.llm.registerAdapter(['smoke'], adapter)
  await ctx.plugin(Fork, { providerName: 'fork' })
  await ctx.plugin(Delegate, { provider: 'spawn', toolName: 'subagent', backgroundMode: 'continuable', maxDepth: 1 })
  await ctx.plugin(Delegate, { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable', maxDepth: 1 })
  await ctx.plugin(SkillRegistry)
  const parent = await ctx.agentLoop.create(SessionId('registry-smoke-parent'), { provider: 'smoke', model: 'parent' })
  const scope = scopeOf(parent.ctx)
  const assemble = () => ctx.systemPrompt.assemble({ scope })
  const textOfAssembly = assembly => assembly.sections.map(section => section.text).join('\n')
  const baseline = await assemble()
  const registry = await ctx.plugin(Registry, { agentsDir, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
  const guided = await assemble()
  const guidance = guided.sections.find(section => section.text.startsWith('When delegating,'))?.text
  assert.equal(guidance, [
    'When delegating, use a matching role from the `use_agent` roster with a self-contained prompt. Use `subagent_fork` only when inheriting the current conversation is necessary.',
    'Start independent calls together; use `background=true` for custom agents and continue useful work. Wait in the foreground only when your next step depends on the result.',
    'Use `ask_agent` to follow up with a background custom agent and wait for its reply.',
  ].join('\n\n'))
  assert.doesNotMatch(guidance, /`subagent`/)
  assert.doesNotMatch(textOfAssembly(guided), /Handle simple tasks directly when delegation would add no value/)
  assert.equal((textOfAssembly(guided).match(/Start independent calls/g) ?? []).length, 1)
  assert.deepEqual(guided.tools.filter(tool => !['use_agent', 'ask_agent'].includes(tool.name)), baseline.tools)
  assert.deepEqual(guided.contexts, baseline.contexts)
  assert.deepEqual(guided.variables, baseline.variables)
  // Assembly-only runtime: no PTC program runs in this test.
  class PtcPresentation extends Service {
    language = 'typescript'
    constructor(ctx) { super(ctx, 'ptcRuntime') }
  }
  await ctx.plugin(PtcPresentation)
  const restorePtc = parent.ctx.tools.presentAs('ptc')
  const ptc = await assemble()
  assert.deepEqual(ptc.tools.map(tool => tool.name), ['run_code'])
  assert.match(textOfAssembly(ptc), /from the `use_agent`/)
  assert.match(textOfAssembly(ptc), /Use `ask_agent`/)
  const restorePtcRestriction = parent.ctx.tools.restrict({ deny: ['use_agent'] })
  assert.doesNotMatch(textOfAssembly(await assemble()), /from the `use_agent`/)
  await restorePtcRestriction()
  await restorePtc()
  const restoreRestriction = parent.ctx.tools.restrict({ deny: ['use_agent'] })
  assert.equal(textOfAssembly(await assemble()), textOfAssembly(baseline), 'hidden dispatch leaves native guidance unchanged')
  await restoreRestriction()
  const restoreAsk = parent.ctx.tools.restrict({ deny: ['ask_agent'] })
  assert.doesNotMatch(textOfAssembly(await assemble()), /Use `ask_agent`/)
  await restoreAsk()
  const restoreFork = parent.ctx.tools.restrict({ deny: ['subagent_fork'] })
  assert.match(textOfAssembly(await assemble()), /from the `use_agent`/)
  assert.doesNotMatch(textOfAssembly(await assemble()), /Use `subagent_fork` only/)
  await restoreFork()
  const signal = new AbortController().signal
  const activationHost = typeof ctx.subagents.startActivation === 'function'
  if (process.env.DSH_TEST_HOST_VERSION) assert.equal(activationHost, process.env.DSH_TEST_HOST_VERSION === '0.2.1-alpha.2')
  if (!activationHost) parentJoin = createLegacyDescendantJoin(ctx, signal)
  const waitForChildren = () => activationHost ? ctx.subagents.waitForChildren(parent) : parentJoin.wait(parent)
  const tool = ctx.tools.get('use_agent', scope)
  const ask = ctx.tools.get('ask_agent', scope)
  const shadow = parent.ctx.tools.register({ ...tool, description: 'Another scoped tool with the same name.' })
  assert.equal(textOfAssembly(await assemble()), textOfAssembly(baseline), 'a shadowed definition must not receive registry guidance')
  await shadow()
  const call = (args, ownSignal = signal) => tool.execute({ agent: 'worker', prompt: 'smoke task', ...args }, { agent: parent, signal: ownSignal })
  const textOf = result => result.output.filter(b => b.type === 'text').map(b => b.text).join('\n')

  adapter.script.push({ text: 'FG_OK' })
  assert.equal(textOf(await call({ fresh: true })), 'FG_OK')
  let rows = await ctx.subagents.listChildren(parent.id)
  assert.equal(rows.at(-1).mode, activationHost ? 'continuable' : 'one-shot')
  assert.equal(rows.at(-1).label, activationHost ? '[use_agent foreground] worker' : 'worker')
  const count = rows.length

  adapter.script.push({ text: 'PARTIAL', limit: true })
  await assert.rejects(call({ fresh: true }), /token limit.*[\s\S]*PARTIAL/)
  const interrupted = (await ctx.subagents.listChildren(parent.id)).at(-1).id
  adapter.script.push({ text: 'RESUME_OK' })
  assert.match(textOf(await call({ resume: true })), /Resumed from the interrupted prior run[\s\S]*\nRESUME_OK$/)
  rows = await ctx.subagents.listChildren(parent.id)
  assert.equal(rows.length, count + 1, 'resume must not create a new child')
  assert.equal(rows.at(-1).id, interrupted)

  adapter.script.push({ text: 'BG_OK' })
  const background = await call({ background: true })
  assert.equal(background.kind, 'agent-start')
  await waitForChildren()
  await parent.whenIdle()
  adapter.script.push({ text: 'FOLLOWUP_OK' })
  const reply = await ask.execute({ agent_id: background.subagentId, message: 'follow-up task', timeout: 3 }, { agent: parent, signal })
  assert.equal(textOf(reply), 'FOLLOWUP_OK')
  await waitForChildren()
  await parent.whenIdle()
  const bg = (await ctx.subagents.listChildren(parent.id)).find(row => String(row.id) === background.subagentId)
  assert.equal(bg.label, 'worker')
  adapter.script.push({ text: 'NEWER_FOREGROUND_OK' })
  assert.equal(textOf(await call({ fresh: true })), 'NEWER_FOREGROUND_OK')
  adapter.script.push({ text: 'BY_NAME_OK' })
  const byName = await ask.execute({ agent: 'worker', message: 'name follow-up', timeout: 3 }, { agent: parent, signal })
  assert.equal(textOf(byName), 'BY_NAME_OK', 'a newer foreground child cannot shadow the background target')
  await waitForChildren()
  await parent.whenIdle()

  const cancellation = new AbortController()
  let started
  const active = new Promise(resolve => { started = resolve })
  adapter.active = started
  adapter.script.push({ hang: true })
  const canceled = call({ fresh: true }, cancellation.signal)
  await active
  adapter.active = undefined
  cancellation.abort()
  await assert.rejects(canceled, /cancel/)

  adapter.script.push({ error: 'HOST_DIAGNOSTIC_TEST' })
  await assert.rejects(call({ fresh: true }), /HOST_DIAGNOSTIC_TEST/)
  assert.equal(adapter.script.length, 0)
  await registry.dispose()
  assert.deepEqual(await assemble(), baseline, 'unmount restores the entire native assembly')
  const renamed = await ctx.plugin(Registry, { agentsDir, provider: 'spawn', toolName: 'delegate_custom', askToolName: 'follow_custom' })
  const renamedText = textOfAssembly(await assemble())
  assert.match(renamedText, /from the `delegate_custom`/)
  assert.match(renamedText, /Use `follow_custom`/)
  assert.doesNotMatch(renamedText, /`use_agent`|`ask_agent`/)
  await renamed.dispose()
  assert.deepEqual(await assemble(), baseline)
  const scoped = await parent.ctx.plugin(Registry, { agentsDir, provider: 'spawn', toolName: 'scoped_custom', askToolName: 'scoped_ask' })
  assert.match(textOfAssembly(await assemble()), /from the `scoped_custom`/)
  assert.doesNotMatch(textOfAssembly(await ctx.systemPrompt.assemble()), /scoped_custom/)
  adapter.script.push({ text: 'SCOPED_FG_OK' })
  const scopedResult = await ctx.tools.get('scoped_custom', scope).execute({ agent: 'worker', prompt: 'scoped leaf task', fresh: true }, { agent: parent, signal })
  assert.equal(textOf(scopedResult), 'SCOPED_FG_OK', 'scoped leaf dispatch must also filter its own tool')
  await scoped.dispose()
  assert.deepEqual(await assemble(), baseline)
  console.log('host-activation: PASS — plugin mount, English guidance, native schemas, visibility, renamed tools, unmount, foreground/background, cold resume, ask, cancellation, persisted errors')
} finally {
  parentJoin?.dispose()
  await ctx.fiber.dispose()
  assert.equal(resolve(root), root)
  assert(root.startsWith(join(tmpdir(), 'dsh-registry-host-')))
  await rm(root, { recursive: true, force: true })
}
