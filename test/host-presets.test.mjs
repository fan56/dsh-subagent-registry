// Real published HTTP Connection/auth, scoped tools and live child manager; model is gated/scripted.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Query from '@deepseek-ai/dsh-session-query'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import FsLocal from '@deepseek-ai/dsh-fs-local'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Skills from '@deepseek-ai/dsh-skill'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as Registry from '../lib/index.js'

const root = await mkdtemp(join(tmpdir(), 'registry-presets-host-'))
const ctx = new Context()
let release
const gate = new Promise(resolve => { release = resolve })
let started
const entered = new Promise(resolve => { started = resolve })
let releaseGrand, enteredGrand, waitingSpawned = false, grandSignal, waitingSignal
const grandGate = new Promise(resolve => { releaseGrand = resolve })
const grandStarted = new Promise(resolve => { enteredGrand = resolve })
class Adapter extends LlmAdapter {
  async *stream(options) {
    if (options.model === 'child') {
      assert.match(JSON.stringify(options.messages), /original persona/)
      started()
      await gate
      assert.equal(options.signal.aborted, false, 'roster changes must not cancel a running child')
    }
    if (options.model === 'waiting') {
      assert.match(JSON.stringify(options.messages), /waiting persona/)
      waitingSignal = options.signal
      if (!waitingSpawned) {
        waitingSpawned = true
        const owner = ctx.agents.list().find(agent => agent.options.model === 'waiting')
        assert(owner)
        const request = { parent: owner, prompt: [{ type: 'text', text: 'grandchild' }], agentOptions: { provider: 'smoke', model: 'grandchild' } }
        const args = { provider: 'spawn', label: 'grandchild', request, signal: new AbortController().signal }
        if (typeof ctx.subagents.startActivation === 'function') await ctx.subagents.startActivation({ ...args, delivery: 'parent' })
        else await ctx.subagents.startContinuable(args)
      }
    } else if (options.model === 'grandchild') {
      grandSignal = options.signal
      enteredGrand()
      await grandGate
      assert.equal(options.signal.aborted, false, 'roster refresh preserves active descendants')
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'DONE' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'DONE' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
try {
  const directory = join(root, 'agents')
  await mkdir(directory)
  await writeFile(join(directory, 'worker.md'), '---\nname: worker\nmodel: smoke/child\ndeep: 0\n---\noriginal persona\n')
  await writeFile(join(directory, 'waiting.md'), '---\nname: waiting\nmodel: smoke/waiting\ndeep: 3\n---\nwaiting persona\n')
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Projection)
  await ctx.plugin(Query)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(FsLocal)
  if (process.env.DSH_TEST_HOST_VERSION !== '0.2.0-rc.2') await ctx.plugin((await import('@deepseek-ai/dsh-working-directory')).default)
  await ctx.plugin(Tools)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(Persistence, { root: join(root, 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Skills)
  ctx.llm.registerAdapter(['smoke'], new Adapter())
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Credentials, { dshHome: root, watch: false })
  await ctx.plugin(Connection)
  const base = `http://127.0.0.1:${ctx.webServer.port}`
  ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (ctx.connection.authorizeIndex(req, res)) { res.writeHead(200); res.end('ok') }
  } })
  const login = await fetch(ctx.connection.authenticatedUrl(`${base}/`), { redirect: 'manual' })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert(cookie)
  const parent = await ctx.agentLoop.create(SessionId('presets-parent'), { provider: 'smoke', model: 'parent' })
  const scope = scopeOf(parent.ctx)
  const registry = await ctx.plugin(Registry, { agentsDir: directory, provider: 'spawn', toolName: 'use_agent', askToolName: 'ask_agent' })
  for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) await fiber.await()
  const askBefore = ctx.tools.get('ask_agent', scope)
  const request = (endpoint, payload, headers = {}) => fetch(`${base}/api/subagent-presets/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: `subagent-presets/${endpoint}`, payload }),
  })
  const call = async (endpoint, payload) => {
    const response = await request(endpoint, payload)
    assert.equal(response.status, 200)
    const envelope = await response.json()
    assert.equal(envelope.result.ok, true)
    return envelope.result.value
  }
  const before = await readFile(join(directory, 'worker.md'), 'utf8')
  assert.equal((await request('remove', { id: 'worker', version: 'bad' }, { Cookie: '' })).status, 401)
  assert.equal((await request('save', { id: 'intruder', version: null }, { Origin: 'https://untrusted.example' })).status, 403)
  assert.equal(await readFile(join(directory, 'worker.md'), 'utf8'), before)
  assert.equal((await call('save', { id: '../escape', version: null, source: 'bad' })).ok, false)
  assert.equal((await call('list', { directory: root })).ok, false)
  const listed = await call('list', null)
  assert.equal(listed.ok, true)
  const worker = listed.value.entries.find(entry => entry.id === 'worker')
  const originalTool = ctx.tools.get('use_agent', scope)
  const background = await originalTool.execute({ agent: 'worker', prompt: 'run', background: true }, { agent: parent, signal: new AbortController().signal })
  await entered
  let foregroundSettled = false
  const foreground = originalTool.execute({ agent: 'waiting', prompt: 'run', fresh: true }, { agent: parent, signal: new AbortController().signal }).finally(() => { foregroundSettled = true })
  await grandStarted
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundSettled, false, 'foreground still waiting for its running grandchild')
  const saved = await call('save', { id: 'worker', version: worker.version, patch: { description: 'new role description' }, body: 'new persona' })
  assert.equal(saved.ok, true)
  const updatedTool = ctx.tools.get('use_agent', scope)
  assert.notEqual(updatedTool, originalTool, 'registration must invalidate the real tool cache')
  assert.equal(ctx.tools.get('ask_agent', scope), askBefore, 'follow-up registration is stable')
  assert.match(updatedTool.description, /new role description/)
  assert((await ctx.subagents.listChildren(parent.id)).some(row => String(row.id) === background.subagentId))
  const created = await call('save', { id: 'new-role', version: null, patch: { name: 'new-role', description: 'newly created' }, body: 'new role' })
  assert.equal(created.ok, true)
  const assemble = () => ctx.systemPrompt.assemble({ scope })
  const native = await assemble()
  assert.match(native.tools.find(tool => tool.name === 'use_agent').description, /newly created/)
  class Ptc extends Service { language = 'typescript'; constructor(ctx) { super(ctx, 'ptcRuntime') } }
  await ctx.plugin(Ptc)
  const restorePtc = parent.ctx.tools.presentAs('ptc')
  assert.deepEqual((await assemble()).tools.map(tool => tool.name), ['run_code'])
  assert.match(ctx.tools.schemas(scope).find(tool => tool.name === 'use_agent').description, /new-role/)
  const restoreDeny = parent.ctx.tools.restrict({ deny: ['use_agent'] })
  assert.doesNotMatch((await assemble()).sections.map(row => row.text).join('\n'), /from the `use_agent`/)
  await restoreDeny()
  await restorePtc()
  assert.equal((await call('remove', { id: 'new-role', version: created.value.version })).ok, true)
  assert.doesNotMatch(ctx.tools.get('use_agent', scope).description, /new-role/)
  assert.equal((await call('save', { id: 'worker', version: worker.version, patch: { description: 'stale' } })).code, 'conflict')
  assert.equal(foregroundSettled, false, 'CRUD must not end an already executing foreground tool')
  assert.equal(grandSignal.aborted, false)
  assert.equal(waitingSignal.aborted, false)
  assert(ctx.agents.list().some(agent => agent.options.model === 'grandchild'))
  releaseGrand()
  assert.match((await foreground).output.filter(block => block.type === 'text').map(block => block.text).join('\n'), /DONE/)
  release()
  const child = ctx.agents.get(SessionId(background.subagentId))
  if (child) await child.whenIdle()
  await registry.dispose()
  assert.equal((await request('list', null)).status, 404, 'unmount removes the exact authenticated channel')
  assert.equal(ctx.tools.get('use_agent', scope), undefined)
  console.log('host-presets: PASS — real HTTP auth/Origin, CRUD, next native/PTC schemas, stable ask, live child preserved, unmount')
} finally {
  releaseGrand()
  release()
  await ctx.fiber.dispose()
  assert(root.startsWith(join(tmpdir(), 'registry-presets-host-')))
  await rm(root, { recursive: true, force: true })
}
