// registry-acp provider contract: capacity, top-level guard, lifecycle.
// Run: pnpm build && node test/acp-provider.test.mjs
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { AgyAcpProvider } from '../lib/acp/provider.js'
import { ACP_CODES } from '../lib/acp/errors.js'
import { NESTED_DELEGATION_ERROR_CODE, recordRegistryChild, releaseRegistryChild } from '../lib/caller-guard.js'

const FAKE = fileURLToPath(new URL('./fixtures/fake-acp-agent.mjs', import.meta.url))
const CWD = process.cwd()

function makeRequest(parent = { id: 'top-agent', session: { header: {} } }) {
  const controller = new AbortController()
  return {
    controller,
    request: {
      prompt: [{ type: 'text', text: 'do the task' }],
      parent,
      cwd: CWD,
      signal: controller.signal,
    },
  }
}

function makeProvider(opts = {}) {
  const state = { spawns: [], children: [], terminated: false }
  const provider = new AgyAcpProvider({
    maxConcurrent: opts.maxConcurrent,
    handshakeTimeoutMs: 1500,
    timeoutMs: 1500,
    eofGraceMs: 100,
    graceMs: 100,
    log: { log: () => {}, warn: () => {} },
    spawn: (spec) => {
      state.spawns.push(spec)
      const child = spawn(process.execPath, [FAKE, opts.scenario ?? 'ok'], {
        stdio: ['pipe', 'pipe', 'pipe'], cwd: spec.cwd,
      })
      state.children.push(child)
      child.stdin.on('error', () => {})
      const stdout = new PassThrough()
      let pending = ''
      child.stdout.on('data', (chunk) => {
        pending += chunk.toString()
        let index
        while ((index = pending.indexOf('\n')) >= 0) {
          let line = pending.slice(0, index)
          pending = pending.slice(index + 1)
          if (opts.transformLine) line = opts.transformLine(line)
          if (line !== '') stdout.write(line + '\n')
        }
      })
      child.on('close', () => stdout.end())
      const stdin = new PassThrough()
      stdin.on('data', (chunk) => child.stdin.write(chunk))
      stdin.on('end', () => child.stdin.end())
      return {
        stdin, stdout, stderr: child.stderr, control: undefined, collected: {},
        done: once(child, 'close').then(([code, signal]) => ({ exitCode: code, signal })),
        terminate: () => { state.terminated = true; child.kill('SIGKILL') },
        waitForExit: async (signal) => {
          if (child.exitCode !== null || child.signalCode !== null) return true
          const exited = once(child, 'exit').then(() => true)
          if (signal === undefined) return exited
          const aborted = new Promise((resolve) => {
            if (signal.aborted) resolve(false)
            else signal.addEventListener('abort', () => resolve(false), { once: true })
          })
          return Promise.race([exited, aborted])
        },
      }
    },
  })
  return { provider, state }
}

const exited = (child) => child.exitCode !== null || child.signalCode !== null
async function stopAll(children) {
  for (const child of children) {
    if (!exited(child)) { child.kill('SIGKILL'); await once(child, 'exit') }
  }
}

// 1. Contract surface: no start capabilities, no continuation method, fixed name.
{
  const { provider } = makeProvider()
  assert.equal(provider.name, 'registry-acp')
  assert.deepEqual({ ...provider.capabilities }, {
    agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: false,
  })
  assert.equal(provider.inheritsParentContext, false)
  assert.equal(provider.prepareContinuable, undefined)
  assert.equal(provider.active, 0)
  console.log('PASS contract: name, capabilities all false, no prepareContinuable')
}

// 2. Capacity: over-cap calls reject ACP_BUSY before spawn; slot frees after dispose.
{
  const { provider, state } = makeProvider({ scenario: 'hang' })
  const first = makeRequest()
  const run = await provider.start(first.request)
  const busy = makeRequest()
  await assert.rejects(provider.start(busy.request), (error) => {
    assert.equal(error.code, ACP_CODES.BUSY)
    assert.match(error.message, /An agy task is already running/)
    return true
  })
  assert.equal(state.spawns.length, 1, 'ACP_BUSY does not spawn')
  assert.equal(provider.active, 1)
  await run.dispose()
  assert.equal(provider.active, 0, 'slot returns to zero after teardown')
  await stopAll(state.children)

  const third = makeRequest()
  const next = await provider.start(third.request)
  assert.equal(state.spawns.length, 2)
  await next.dispose()
  await stopAll(state.children)
  console.log('PASS capacity: ACP_BUSY rejects without spawn; counter returns to zero')
}

// 3. Top-level guard reuses the registry check at provider edge.
{
  const { provider, state } = makeProvider()
  const nested = makeRequest({ id: 'child', session: { header: { parentSession: 'top' } } })
  await assert.rejects(provider.start(nested.request), (error) => error.code === NESTED_DELEGATION_ERROR_CODE)
  const unknown = makeRequest({})
  await assert.rejects(provider.start(unknown.request), (error) => error.code === NESTED_DELEGATION_ERROR_CODE)
  assert.equal(state.spawns.length, 0, 'guard runs before spawn')
  assert.equal(provider.active, 0, 'refused call does not consume a slot')
  console.log('PASS guard: nested and unverifiable callers rejected before spawn')

  recordRegistryChild('dsh-registry-child-1')
  const registryChild = makeRequest({ id: 'dsh-registry-child-1', session: { header: {} } })
  const guarded = makeProvider()
  await assert.rejects(guarded.provider.start(registryChild.request), (error) => error.code === NESTED_DELEGATION_ERROR_CODE)
  releaseRegistryChild('dsh-registry-child-1')
}

// 4. dispose is idempotent; result never rejects on a child crash.
{
  const { provider, state } = makeProvider({ scenario: 'crash-mid-prompt' })
  const { request } = makeRequest()
  const run = await provider.start(request)
  const result = await run.result
  assert.equal(result.stopReason, 'error')
  assert.match(result.output.map((b) => b.text).join(''), /partial before crash/)
  await run.dispose()
  await run.dispose()
  assert.equal(provider.active, 0)
  assert.ok(state.children.every(exited))
  console.log('PASS lifecycle: result resolves on crash; dispose idempotent')
}

// 5. Post-publication signal abort disposes the child by itself.
{
  const { provider, state } = makeProvider({ scenario: 'hang' })
  const { request, controller } = makeRequest()
  const run = await provider.start(request)
  await new Promise((resolve) => setTimeout(resolve, 40))
  controller.abort()
  const result = await run.result
  assert.equal(result.stopReason, 'aborted')
  assert.equal(result.diagnostic, undefined)
  await run.dispose()
  assert.ok(state.children.every(exited), 'abort disposes the real child')
  assert.equal(state.terminated, true)
  assert.equal(provider.active, 0)
  console.log('PASS abort: signal observed after startup, process exited, slot released')
}

// 6. Cancellation during handshake releases the capacity slot.
{
  const { provider, state } = makeProvider({
    scenario: 'hang',
    transformLine: (line) => line.includes('"result":{"sessionId"') ? '' : line,
  })
  const { request, controller } = makeRequest()
  const pending = provider.start(request)
  setTimeout(() => controller.abort(), 30)
  await assert.rejects(pending, (error) => error.code === ACP_CODES.ABORTED)
  assert.equal(state.spawns.length, 1)
  assert.equal(provider.active, 0, 'handshake cancel does not leak a slot')
  assert.ok(state.children.every(exited))
  await stopAll(state.children)
  console.log('PASS handshake cancel: one spawn, no leaked slot, child reaped')
}

// 7. A larger cap allows parallel runs; each slot is independent.
{
  const { provider, state } = makeProvider({ scenario: 'hang', maxConcurrent: 2 })
  const a = await provider.start(makeRequest().request)
  const b = await provider.start(makeRequest().request)
  assert.equal(provider.active, 2)
  await assert.rejects(provider.start(makeRequest().request), (error) => error.code === ACP_CODES.BUSY)
  await Promise.all([a.dispose(), b.dispose()])
  assert.equal(provider.active, 0)
  await stopAll(state.children)
  console.log('PASS parallel cap: independent slots, all released')
}

console.log('ALL acp-provider tests passed')
