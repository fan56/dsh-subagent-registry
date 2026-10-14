// Real 0.2.1-alpha.2 services, persistence, manager and spawn; only the model is scripted.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { runAgentTool } from '../lib/tool-run-agent.js'
import { askAgentTool } from '../lib/interactive.js'

class ScriptedAdapter extends LlmAdapter {
  script = []
  active
  async *stream(options) {
    const entry = options.model === 'parent' ? { text: 'settlement received' } : this.script.shift()
    assert(entry, 'unexpected child model call')
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
try {
  const agentsDir = join(root, 'agents')
  await mkdir(agentsDir)
  await writeFile(join(agentsDir, 'worker.md'), '---\nname: worker\nmodel: smoke/child\ndeep: 0\n---\nFollow the task.\n')
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SessionQueryEngine)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(FsLocal)
  await ctx.plugin(WorkingDirectory)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  ctx.llm.registerAdapter(['smoke'], adapter)
  const parent = await ctx.agentLoop.create(SessionId('registry-smoke-parent'), { provider: 'smoke', model: 'parent' })
  const signal = new AbortController().signal
  const tool = runAgentTool(ctx, { agentsDir, provider: 'spawn', toolName: 'use_agent' })
  const ask = askAgentTool(ctx, { agentsDir, toolName: 'ask_agent', pollMs: 1 })
  const call = (args, ownSignal = signal) => tool.execute({ agent: 'worker', prompt: 'smoke task', ...args }, { agent: parent, signal: ownSignal })
  const textOf = result => result.output.filter(b => b.type === 'text').map(b => b.text).join('\n')

  adapter.script.push({ text: 'FG_OK' })
  assert.equal(textOf(await call({ fresh: true })), 'FG_OK')
  let rows = await ctx.subagents.listChildren(parent.id)
  assert.equal(rows.at(-1).mode, 'continuable')
  assert.equal(rows.at(-1).label, '[use_agent foreground] worker')
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
  await ctx.subagents.waitForChildren(parent)
  await parent.whenIdle()
  adapter.script.push({ text: 'FOLLOWUP_OK' })
  const reply = await ask.execute({ agent_id: background.subagentId, message: 'follow-up task', timeout: 3 }, { agent: parent, signal })
  assert.equal(textOf(reply), 'FOLLOWUP_OK')
  await ctx.subagents.waitForChildren(parent)
  await parent.whenIdle()
  const bg = (await ctx.subagents.listChildren(parent.id)).find(row => String(row.id) === background.subagentId)
  assert.equal(bg.label, 'worker')

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
  console.log('host-activation: PASS — real manager foreground/background, cold resume, ask correlation, cancellation, persisted error diagnostic')
} finally {
  await ctx.fiber.dispose()
  assert.equal(resolve(root), root)
  assert(root.startsWith(join(tmpdir(), 'dsh-registry-host-')))
  await rm(root, { recursive: true, force: true })
}
