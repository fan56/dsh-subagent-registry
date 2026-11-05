// Migrated verbatim from @aiwayds/dsh-ptc-subagent (merged into this registry in 0.18.0); import paths re-pointed at lib/ptc/.
// codemode runner tests — a fake PTC runtime records what the runner hands
// to resolve()/run() and returns scripted outcomes. Covers parameter
// assembly (bindings pair, timeout default/pass-through, signal forwarding),
// the CODE_RUN_FAILED failure mapping, the success envelope, input
// validation, and the absent-runtime misconfiguration. Fully offline.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createCodemodeTool, runProgram, formatRunFailure, CODEMODE_TOOL_NAME, DEFAULT_RUN_TIMEOUT_MS, CodeRunFailedError: Crf } =
  await import('../lib/ptc/runner.js')
// RUN_CODE_NAME stays a host import; CodeRunFailedError moved out of dsh-tools
// in 0.2.2-rc.1 (now dsh-tool-executor-ptc) and the lib exports its own
// canonical-shape subclass, so the instanceof target comes from lib.
const { RUN_CODE_NAME } = await import('@deepseek-ai/dsh-tools')

/** The plugin's Config shape as plain refs (what apply receives). */
function makeConfig(overrides = {}) {
  const box = { jevEnabled: false, jevBackend: 'zen', jevModel: '', jevTimeoutMs: 3000, jevSecretFile: '', storageDir: '', ...overrides }
  const ref = (key) => ({ get: () => box[key] })
  return {
    jevEnabled: ref('jevEnabled'), jevBackend: ref('jevBackend'), jevModel: ref('jevModel'),
    jevTimeoutMs: ref('jevTimeoutMs'), jevSecretFile: ref('jevSecretFile'), storageDir: ref('storageDir'),
  }
}

/** A fake PTC runtime: records resolve() requests, returns scripted runs. */
function fakeRuntime() {
  const runtime = {
    resolved: [],
    runs: [],
    script: (spec) => ({ value: { answer: 42 }, logs: ['hello from the program'] }),
    resolve(request) {
      this.resolved.push(request)
      return { ...request, cwd: '/fake/cwd', timeoutMs: request.timeoutMs ?? 60000 }
    },
    async run(spec) {
      this.runs.push(spec)
      return runtime.script(spec)
    },
  }
  return runtime
}

function makeDeps(runtime, configOverrides) {
  return {
    ctx: { ptcRuntime: runtime },
    jev: { config: makeConfig(configOverrides), log: { append: async () => undefined }, env: {} },
  }
}

function fakeExec({ withAgent = true } = {}) {
  const controller = new AbortController()
  const session = { marker: 'fake-session' }
  return {
    signal: controller.signal,
    ...(withAgent ? { agent: { id: 'agent-1', session } } : {}),
    controller,
  }
}

test('the tool declares the codemode surface beside the reserved run_code name', () => {
  const tool = createCodemodeTool(makeDeps(fakeRuntime()))
  assert.equal(tool.name, 'codemode')
  assert.notEqual(tool.name, RUN_CODE_NAME)
  assert.match(tool.description, /jev/)
  assert.match(tool.description, /store/)
  // The compiled parameter schema: implicit object root, program required.
  const props = Object.keys(tool.parameters.properties)
  assert.deepEqual(props.sort(), ['program', 'timeoutMs'])
  assert.deepEqual(tool.parameters.required, ['program'])
})

test('execute resolves the program against the public runtime seam with both bindings', async () => {
  const runtime = fakeRuntime()
  const tool = createCodemodeTool(makeDeps(runtime))
  const exec = fakeExec()
  const out = await tool.execute({ program: 'return 1' }, exec)
  assert.equal(runtime.resolved.length, 1)
  const request = runtime.resolved[0]
  assert.equal(request.program, 'return 1')
  assert.equal(request.timeoutMs, DEFAULT_RUN_TIMEOUT_MS, 'the default budget applies when the model omits timeoutMs')
  assert.equal(request.signal, exec.signal, 'the host caller signal is forwarded to the runtime')
  // Exactly the jev + store namespace pair, in binding order.
  assert.equal(request.bindings.length, 2)
  assert.equal(request.bindings[0].global, 'jev')
  assert.equal(request.bindings[1].global, 'store')
  // The success envelope.
  assert.deepEqual(out, { value: { answer: 42 }, logs: ['hello from the program'], jevCalls: [], storeWrites: 0 })
  assert.equal(runtime.runs.length, 1)
})

test('timeoutMs passes through; a non-positive or non-integer one is a tool error', async () => {
  const runtime = fakeRuntime()
  const tool = createCodemodeTool(makeDeps(runtime))
  await tool.execute({ program: 'return 1', timeoutMs: 12000 }, fakeExec())
  assert.equal(runtime.resolved[0].timeoutMs, 12000)
  await assert.rejects(
    () => tool.execute({ program: 'return 1', timeoutMs: 0 }, fakeExec()),
    /timeoutMs must be a positive integer/,
  )
  await assert.rejects(() => tool.execute({ program: 'return 1', timeoutMs: 1.5 }, fakeExec()), /timeoutMs/)
})

test('a failed run throws CodeRunFailedError (CODE_RUN_FAILED) carrying kind + logs', async () => {
  const runtime = fakeRuntime()
  runtime.script = () => ({ logs: ['log line one', 'log line two'], error: { kind: 'exception', message: 'boom: x is not defined' } })
  const tool = createCodemodeTool(makeDeps(runtime))
  await assert.rejects(
    () => tool.execute({ program: 'throw new Error("boom")' }, fakeExec()),
    (error) => {
      assert.ok(error instanceof Crf, 'the host canonical error type is thrown')
      assert.equal(error.code, 'CODE_RUN_FAILED')
      assert.match(error.message, /^exception: boom/)
      assert.match(error.message, /log line one/)
      assert.match(error.message, /log line two/)
      return true
    },
  )
})

test('formatRunFailure keeps the self-correction payload: kind, message, then logs', () => {
  const text = formatRunFailure({ kind: 'timeout', message: 'exceeded 60000ms' }, ['partial log'])
  assert.equal(text, 'timeout: exceeded 60000ms\npartial log')
  assert.equal(formatRunFailure({ kind: 'abort', message: 'cancelled' }, []), 'abort: cancelled', 'no trailing newline without logs')
})

test('agent-less executions still run — the store degrades to structured no-session', async () => {
  const runtime = fakeRuntime()
  const tool = createCodemodeTool(makeDeps(runtime))
  const exec = fakeExec({ withAgent: false })
  const out = await tool.execute({ program: 'const r = await store.store({key: "k", value: 1}); return r' }, exec)
  // The program sees the binding pair; the store call resolves the structured
  // error instead of rejecting (the fake runtime ignores the program body, so
  // we assert the binding functions directly below).
  const storeNs = runtime.resolved[0].bindings[1]
  const noSession = await storeNs.functions.store({ key: 'k', value: 1 })
  assert.equal(noSession.error, 'no-session')
  assert.equal(out.value.answer, 42)
})

test('an absent PTC runtime is a loud misconfiguration', async () => {
  const tool = createCodemodeTool({ ctx: { ptcRuntime: undefined }, jev: makeDeps(fakeRuntime()).jev })
  await assert.rejects(() => tool.execute({ program: 'return 1' }, fakeExec()), /no PTC runtime is mounted/)
})

test('runProgram is the direct seam behind the definition (same behavior)', async () => {
  const runtime = fakeRuntime()
  const deps = makeDeps(runtime)
  const exec = fakeExec()
  const out = await runProgram(deps, { program: 'return 2' }, exec)
  assert.deepEqual(out.value, { answer: 42 })
  assert.equal(runtime.resolved.length, 1)
})

test('caller cancellation reaches an in-flight classify as a structured failure, never a hang', async () => {
  // A fetch that only settles when its signal aborts — and, like native
  // fetch, rejects immediately when handed an already-aborted signal (the
  // abort listener of an already-fired AbortSignal would never run).
  const hangingFetch = (url, init) => new Promise((resolve, reject) => {
    if (init.signal.aborted) {
      reject(new Error('aborted before entry'))
      return
    }
    init.signal.addEventListener('abort', () => reject(new Error('aborted by the linked controller')))
  })
  const runtime = fakeRuntime()
  const exec = fakeExec()
  const deps = {
    ctx: { ptcRuntime: runtime },
    jev: {
      config: makeConfig({ jevEnabled: true, jevTimeoutMs: 3000 }),
      log: { append: async () => undefined },
      env: { JEV_ZEN_API_KEY: 'k' },
      fetchImpl: hangingFetch,
    },
  }
  let inflight
  runtime.script = async (spec) => {
    // The "program" starts a classify and the HOST cancels the run mid-call.
    inflight = spec.bindings[0].functions.classify({
      questions: { q: { type: 'noul', criteria: { true: 'a', false: 'b' } } },
      state: 's',
    })
    exec.controller.abort()
    const settled = await inflight
    return { logs: [], error: { kind: 'abort', message: `classify resolved ${settled.error}` } }
  }
  // The run itself reports a structured failure; the classify call under it
  // must have SETTLED (not hung) once the linked controller fired.
  await assert.rejects(() => createCodemodeTool(deps).execute({ program: 'await jev.classify(...)' }, exec), /abort/)
  const settled = await Promise.race([
    inflight,
    new Promise((_, reject) => setTimeout(() => reject(new Error('classify hung past cancellation')), 5000)),
  ])
  assert.equal(settled.error, 'network', 'the aborted call resolves a structured failure')
})
