// acp/run lifecycle and contract tests. Run: pnpm build && node test/acp-run.test.mjs
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { startAgyRun } from '../lib/acp/run.js'
import { ACP_CODES, acpErrorText } from '../lib/acp/errors.js'

const FAKE = fileURLToPath(new URL('./fixtures/fake-acp-agent.mjs', import.meta.url))
const CWD = process.cwd()

function requestWith(text = 'do the task') {
  const controller = new AbortController()
  return {
    request: {
      prompt: [{ type: 'text', text }],
      parent: { id: 'top-agent', session: { header: {} } },
      cwd: CWD,
      signal: controller.signal,
    },
    controller,
  }
}

/** Spawn the fake agent behind a seam-shaped SubprocessHandle. */
function makeSpec(scenario, opts = {}) {
  const logs = opts.logs ?? []
  const seen = opts.seen ?? []
  const spawnSpecs = []
  const children = []
  const spec = {
    cwd: CWD,
    handshakeTimeoutMs: opts.handshakeTimeoutMs ?? 3000,
    timeoutMs: opts.timeoutMs ?? 3000,
    eofGraceMs: 120,
    graceMs: 120,
    permission: opts.permission,
    log: (line) => logs.push(line),
    warn: (line) => logs.push(`WARN ${line}`),
    spawn: (spawnSpec) => {
      spawnSpecs.push(spawnSpec)
      if (opts.spawnError) throw opts.spawnError
      const child = spawn(process.execPath, [FAKE, scenario], { stdio: ['pipe', 'pipe', 'pipe'], cwd: spawnSpec.cwd })
      children.push(child)
      child.stdin.on('error', () => {}) // ePipe: the child closes its stdin
      const stdin = new PassThrough()
      stdin.on('data', (chunk) => {
        child.stdin.write(chunk)
        if (opts.injectToolOnPrompt && chunk.toString().includes('session/prompt')) {
          stdout.write(JSON.stringify({
            jsonrpc: '2.0', method: 'session/update',
            params: {
              sessionId: 'fake-session-1',
              update: { sessionUpdate: 'tool_call', name: 'edit', title: 'edit a.ts' },
            },
          }) + '\n')
          stdout.write(JSON.stringify({
            jsonrpc: '2.0', method: 'session/update',
            params: {
              sessionId: 'fake-session-1',
              update: { sessionUpdate: 'tool_call_update', title: 'bash ls' },
            },
          }) + '\n')
        }
      })
      stdin.on('end', () => child.stdin.end())
      const stdout = new PassThrough()
      let pending = ''
      child.stdout.on('data', (chunk) => {
        pending += chunk.toString()
        let index
        while ((index = pending.indexOf('\n')) >= 0) {
          let line = pending.slice(0, index)
          pending = pending.slice(index + 1)
          seen.push(line)
          if (opts.transformLine) line = opts.transformLine(line)
          if (line !== '') stdout.write(line + '\n')
        }
      })
      const stderr = new PassThrough()
      if (opts.stderrText) stderr.write('A'.repeat(8192) + opts.stderrText)
      child.on('close', () => { stdout.end(); stderr.end() })
      const done = opts.spawnReject
        ? Promise.reject(opts.spawnReject)
        : once(child, 'close').then(([exitCode, signal]) => ({ exitCode, signal }))
      const handle = {
        stdin,
        stdout,
        stderr,
        control: undefined,
        collected: {},
        done,
        terminate: () => { child.kill('SIGKILL'); opts.terminated = true },
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
      return handle
    },
  }
  return { spec, deps: { log: spec.log, warn: spec.warn }, logs, seen, spawnSpecs, children, flags: opts }
}

const echoOf = (result) => {
  const text = result.output.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return JSON.parse(text.slice(text.indexOf('ECHO {') + 5))
}
const exited = (child) => child.exitCode !== null || child.signalCode !== null
async function finish(...runs) {
  for (const run of runs) await Promise.allSettled([run.dispose(), run.result])
}
async function stopAll(children) {
  for (const child of children) {
    if (!exited(child)) { child.kill('SIGKILL'); await once(child, 'exit') }
  }
}

// 1. Main path: spawn envelope, three request shapes, source header, exit proof.
{
  const { request } = requestWith()
  const h = makeSpec('ok', { transformLine: (line) => line.includes('"sessionId":"fake-session-1"')
    ? line.replace('"models":[]', '"models":[{"modelId":"fake-model-1"}]') : line })
  const run = await startAgyRun(request, h.spec, h.deps)
  const result = await run.result
  assert.equal(result.stopReason, 'completed')
  assert.match(result.output[0].text, /^\[agy · fake-model-1 · [\d.]+s\]$/, 'session model in source header')
  assert.deepEqual(h.spawnSpecs[0].argv, ['agy', 'acp'])
  assert.equal(h.spawnSpecs[0].cwd, CWD)
  assert.deepEqual(h.spawnSpecs[0].stdio, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  assert.equal(h.spawnSpecs[0].signal, request.signal)
  const echo = echoOf(result)
  assert.deepEqual(echo.initialize, { protocolVersion: 1, clientCapabilities: {} })
  assert.deepEqual(echo['session/new'], { cwd: CWD, mcpServers: [] })
  assert.deepEqual(echo['session/prompt'], {
    sessionId: 'fake-session-1', prompt: [{ type: 'text', text: 'do the task' }],
  })
  assert.ok(h.logs.some((line) => line.includes('result → process exit')), 'exit timing logged')
  assert.ok(exited(h.children[0]), 'result only arrives after the child exits')
  assert.equal(await run.dispose(), undefined)
  assert.equal(await run.dispose(), undefined, 'dispose idempotent')
  console.log('PASS ok: exact wire shapes, source header, exit-before-result, idempotent dispose')
}

// 2. Permission three states: default reject, allow, reject-only.
{
  for (const [scenario, permission, expected] of [
    ['perm', undefined, 'cancelled'],
    ['perm', 'allow', 'allow-once'],
    ['perm-reject-only', 'allow', 'cancelled'],
  ]) {
    const { request } = requestWith()
    const h = makeSpec(scenario, { permission })
    const run = await startAgyRun(request, h.spec, h.deps)
    const result = await run.result
    assert.equal(result.stopReason, 'completed', `${scenario}: completed`)
    const echo = echoOf(result)
    assert.equal(echo.permissionChoice, expected, `${scenario}: decision`)
    assert.equal(echo.permissionReply?.outcome, expected === 'cancelled' ? 'cancelled' : 'selected')
    await finish(run)
  }
  console.log('PASS permission: default reject, allow selects first allow, reject-only cancels')
}

// 3. Stop reasons: refusal / quota text classification.
{
  const refusal = requestWith()
  const rh = makeSpec('refusal')
  const rrun = await startAgyRun(refusal.request, rh.spec, rh.deps)
  const rresult = await rrun.result
  assert.equal(rresult.stopReason, 'refusal')
  assert.match(rresult.diagnostic, new RegExp(`\\[${ACP_CODES.AGENT_ERROR}\\]`))
  await finish(rrun)

  const quota = requestWith()
  const qh = makeSpec('quota')
  const qrun = await startAgyRun(quota.request, qh.spec, qh.deps)
  const qresult = await qrun.result
  assert.equal(qresult.stopReason, 'error')
  assert.match(qresult.diagnostic, new RegExp(`\\[${ACP_CODES.QUOTA_EXHAUSTED}\\]`))
  assert.match(qresult.output.map((b) => b.text).join(''), /quota exceeded/, 'partial output retained')
  await finish(qrun)
  console.log('PASS stop reasons: refusal->AGENT_ERROR, quota hint->QUOTA_EXHAUSTED')
}

// 4. Early exits: handshake crash, post-handshake exit, mid-prompt crash, EPIPE.
{
  const handshake = requestWith()
  const hh = makeSpec('exit-during-handshake')
  await assert.rejects(startAgyRun(handshake.request, hh.spec, hh.deps), (e) => e.code === ACP_CODES.EARLY_EXIT)
  assert.ok(hh.children.every(exited), 'handshake exit cleans the process')

  for (const scenario of ['early-exit', 'crash-mid-prompt', 'ePipe']) {
    const { request } = requestWith()
    const h = makeSpec(scenario)
    const run = await startAgyRun(request, h.spec, h.deps)
    const result = await run.result
    assert.equal(result.stopReason, 'error', `${scenario}: error stop reason`)
    assert.match(result.diagnostic, new RegExp(`\\[${ACP_CODES.EARLY_EXIT}\\]`), `${scenario}: early exit code`)
    assert.equal(result.output.some((b) => b.type === 'text' && b.text.startsWith('[agy ·')), false,
      'no success source header on failure')
    await finish(run)
  }
  console.log('PASS early exits: handshake / post-handshake / crash / EPIPE settle through result')
}

// 5. Two timeouts, with partial output on the task timeout.
{
  const handshake = requestWith()
  const hh = makeSpec('hang', {
    handshakeTimeoutMs: 60,
    // The fixture answers session/new; drop it so the handshake actually hangs.
    transformLine: (line) => line.includes('"result":{"sessionId"') ? '' : line,
  })
  await assert.rejects(startAgyRun(handshake.request, hh.spec, hh.deps), (e) => e.code === ACP_CODES.HANDSHAKE_TIMEOUT)
  assert.equal(hh.spawnSpecs.length, 1, 'handshake timeout does not respawn')

  const task = requestWith()
  const th = makeSpec('slow', { timeoutMs: 100 })
  const run = await startAgyRun(task.request, th.spec, th.deps)
  const result = await run.result
  assert.equal(result.stopReason, 'error')
  assert.match(result.diagnostic, new RegExp(`\\[${ACP_CODES.TIMEOUT}\\]`))
  const text = result.output.map((b) => b.text).join('')
  assert.match(text, /slow-1/, 'text received before the deadline survives')
  assert.doesNotMatch(text, /slow-2/, 'text after the deadline is not waited for')
  await finish(run)
  console.log('PASS timeouts: handshake rejects pre-publication; task timeout keeps partial output')
}

// 6. Pre-publication code mapping: ENOENT / EACCES / no seam / bad cwd / pre-aborted.
{
  const enoent = requestWith()
  const e1 = makeSpec('ok', { spawnError: Object.assign(new Error('missing'), { code: 'ENOENT' }) })
  await assert.rejects(startAgyRun(enoent.request, e1.spec, e1.deps), (e) => e.code === ACP_CODES.NOT_INSTALLED)

  const eacces = requestWith()
  const e2 = makeSpec('ok', { spawnError: Object.assign(new Error('denied'), { code: 'EACCES' }) })
  await assert.rejects(startAgyRun(eacces.request, e2.spec, e2.deps), (e) => e.code === ACP_CODES.SPAWN_FAILED && /errno EACCES/.test(e.fact))

  const noSeam = requestWith()
  const e3 = makeSpec('ok')
  delete e3.spec.spawn
  await assert.rejects(startAgyRun(noSeam.request, e3.spec, e3.deps), (e) => e.code === ACP_CODES.NO_SUBPROCESS)

  const badCwd = requestWith()
  const e4 = makeSpec('ok')
  e4.spec.cwd = 'relative/path'
  await assert.rejects(startAgyRun(badCwd.request, e4.spec, e4.deps), (e) => e.code === ACP_CODES.BAD_CWD)

  const pre = requestWith()
  pre.controller.abort()
  const e5 = makeSpec('ok')
  await assert.rejects(startAgyRun(pre.request, e5.spec, e5.deps), (e) => e.code === ACP_CODES.ABORTED)
  assert.equal(e5.spawnSpecs.length, 0, 'pre-aborted request does not spawn')
  console.log('PASS codes: NOT_INSTALLED / SPAWN_FAILED / NO_SUBPROCESS / BAD_CWD / ABORTED before publication')
}

// 7. Auth handshake and protocol break.
{
  const auth = requestWith()
  const ah = makeSpec('auth')
  await assert.rejects(startAgyRun(auth.request, ah.spec, ah.deps), (e) => e.code === ACP_CODES.AUTH_REQUIRED)
  assert.ok(ah.children.every(exited))

  const garbage = requestWith()
  const gh = makeSpec('garbage')
  const grun = await startAgyRun(garbage.request, gh.spec, gh.deps)
  const gresult = await grun.result
  assert.equal(gresult.stopReason, 'error')
  assert.match(gresult.diagnostic, new RegExp(`\\[${ACP_CODES.PROTOCOL}\\]`))
  await finish(grun)
  console.log('PASS auth / protocol: auth rejects at handshake, garbage settles as ACP_PROTOCOL')
}

// 8. Tool trace goes into `output`, never into the diagnostic.
{
  const { request } = requestWith()
  const h = makeSpec('refusal', { injectToolOnPrompt: true })
  const run = await startAgyRun(request, h.spec, h.deps)
  const result = await run.result
  const trace = result.output.filter((b) => b.type === 'text').at(-1).text
  assert.match(trace, /Tools agy called before the run ended: edit: edit a\.ts, bash ls/)
  assert.doesNotMatch(result.diagnostic, /edit a\.ts|bash ls/)
  await finish(run)
  console.log('PASS tool trace: names+titles appended to output, excluded from diagnostic')
}

// 9. stderr tail is log-only and bounded to 4 KB; remote message is log-only too.
{
  const { request } = requestWith()
  const h = makeSpec('refusal', { stderrText: 'SECRET_STDERR_MARKER' })
  const run = await startAgyRun(request, h.spec, h.deps)
  const result = await run.result
  await run.dispose()
  const logs = h.logs.join('\n')
  assert.match(logs, /SECRET_STDERR_MARKER/, 'stderr tail reaches the log')
  assert.doesNotMatch(result.diagnostic, /SECRET_STDERR_MARKER|AAAAAAAA/, 'stderr never enters diagnostic')
  const tailLine = h.logs.find((line) => line.includes('stderr tail:'))
  assert.ok(Buffer.byteLength(tailLine.slice(tailLine.indexOf('stderr tail:')), 'utf8') <= 4096 + 20)
  assert.ok(Buffer.byteLength(tailLine.split('SECRET_STDERR_MARKER')[0].split('stderr tail:')[1]) <= 4096)

  const huge = requestWith()
  const hs = makeSpec('auth', {
    transformLine: (line) => line.includes('-32000') ? line.replace('Authentication required', '中'.repeat(3000)) : line,
  })
  let rejected
  await assert.rejects(startAgyRun(huge.request, hs.spec, hs.deps), (e) => {
    rejected = e
    return e.code === ACP_CODES.AUTH_REQUIRED
  })
  assert.match(hs.logs.join('\n'), /中/, 'handshake remote message reaches the log (SF1)')
  assert.ok(!String(rejected.fact).includes('中'), 'remote message is absent from the thrown diagnostic fact')
  assert.ok(!rejected.message.includes('中'), 'remote message is absent from the error title')
  await stopAll(hs.children)
  console.log('PASS log-only: stderr tail and remote message logged, never enter diagnostics')
}

// 10. Diagnostic byte budget and UTF-8 safety on a huge multibyte RPC message.
{
  const { request } = requestWith()
  const h = makeSpec('refusal', {
    transformLine: (line) => {
      let msg
      try { msg = JSON.parse(line) } catch { return line }
      return msg.result && typeof msg.result.stopReason === 'string'
        ? JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32099, message: '中'.repeat(3000) } })
        : line
    },
  })
  const run = await startAgyRun(request, h.spec, h.deps)
  const result = await run.result
  assert.equal(result.stopReason, 'error')
  assert.ok(Buffer.byteLength(result.diagnostic, 'utf8') <= 4096, 'diagnostic fits the host budget')
  assert.doesNotMatch(result.diagnostic, /\uFFFD/, 'no broken multi-byte sequence')
  assert.doesNotMatch(result.diagnostic, /中/, 'raw JSON-RPC message never enters a diagnostic')
  assert.match(result.diagnostic, new RegExp(`\\[${ACP_CODES.AGENT_ERROR}\\]`))
  await finish(run)
  console.log('PASS diagnostic: <=4096 bytes, no broken UTF-8, code stable')
}

// 11. Cancel after publication: process is really gone; result never rejects.
{
  const { request, controller } = requestWith()
  const h = makeSpec('hang')
  const run = await startAgyRun(request, h.spec, h.deps)
  await new Promise((resolve) => setTimeout(resolve, 40))
  controller.abort()
  const result = await run.result
  assert.equal(result.stopReason, 'aborted', 'cancel settles result')
  assert.equal(result.diagnostic, undefined, 'no diagnostic on cancel')
  await run.dispose()
  assert.ok(h.children.every(exited), 'cancel + dispose leaves no live child')
  assert.equal(h.flags.terminated, true, 'managed-range terminate was invoked')
  console.log('PASS cancel: result never rejects, no diagnostic, child exited')
}

// 12. Cancel during handshake: no second spawn and no leaked process.
{
  const { request, controller } = requestWith()
  const h = makeSpec('hang', {
    transformLine: (line) => line.includes('"result":{"sessionId"') ? '' : line,
  })
  const pending = startAgyRun(request, h.spec, h.deps)
  setTimeout(() => controller.abort(), 30)
  await assert.rejects(pending, (e) => e.code === ACP_CODES.ABORTED)
  assert.equal(h.spawnSpecs.length, 1)
  assert.ok(h.children.every(exited))
  console.log('PASS handshake cancel: rejects ACP_ABORTED, one spawn, child reaped')
}

// 13. T38: per-call model via session/set_config_option (success + 3 failures).
{
  // Success: exact request envelope, effective value in the source header.
  const ok = requestWith()
  const oh = makeSpec('model')
  oh.spec.model = 'claude-sonnet-5-5'
  const orun = await startAgyRun(ok.request, oh.spec, oh.deps)
  const oresult = await orun.result
  assert.equal(oresult.stopReason, 'completed')
  assert.match(oresult.output[0].text, /^\[agy · claude-sonnet-5-5 · [\d.]+s\]$/, 'effective model in source header')
  assert.deepEqual(echoOf(oresult)['session/set_config_option'], {
    sessionId: 'fake-session-1', configId: 'model', value: 'claude-sonnet-5-5',
  }, 'client → server request params verbatim')
  await finish(orun)

  // No model requested: no set_config_option, display falls back to agy.
  const none = requestWith()
  const nh = makeSpec('model')
  const nrun = await startAgyRun(none.request, nh.spec, nh.deps)
  const nresult = await nrun.result
  assert.match(nresult.output[0].text, /^\[agy · agy · [\d.]+s\]$/)
  assert.equal(nh.seen.some((line) => line.includes('session/set_config_option')), false)
  await finish(nrun)

  // Value not in session/new.options: reject, list families, send nothing.
  const bad = requestWith()
  const bh = makeSpec('model')
  bh.spec.model = 'not-a-family'
  await assert.rejects(startAgyRun(bad.request, bh.spec, bh.deps), (e) => {
    assert.equal(e.code, ACP_CODES.AGENT_ERROR)
    assert.match(acpErrorText(e), /not an available model family/)
    assert.match(acpErrorText(e), /claude-sonnet-5-5/, 'available families listed')
    assert.doesNotMatch(acpErrorText(e), /SECRET_REMOTE_MODEL_MESSAGE/)
    return true
  })
  assert.equal(bh.seen.some((line) => line.includes('session/set_config_option')), false,
    'invalid value rejected before the request is sent')
  await stopAll(bh.children)

  // RPC error: only the remote code survives; the raw message stays in logs.
  const rp = requestWith()
  const rh = makeSpec('model-rpc-error')
  rh.spec.model = 'claude-sonnet-5-5'
  await assert.rejects(startAgyRun(rp.request, rh.spec, rh.deps), (e) => {
    assert.equal(e.code, ACP_CODES.AGENT_ERROR)
    assert.match(e.fact ?? '', /jsonrpc code -32602/, 'remote code kept')
    assert.doesNotMatch(acpErrorText(e), /SECRET_REMOTE_MODEL_MESSAGE/, 'remote message dropped')
    return true
  })
  assert.match(rh.logs.join('\n'), /SECRET_REMOTE_MODEL_MESSAGE/, 'remote message is log-only')
  await stopAll(rh.children)

  // currentValue mismatch: reject instead of showing a model agy did not apply.
  const mm = requestWith()
  const mh = makeSpec('model-mismatch')
  mh.spec.model = 'claude-sonnet-5-5'
  await assert.rejects(startAgyRun(mm.request, mh.spec, mh.deps), (e) => {
    assert.match(acpErrorText(e), /currentValue "gemini-4-neon" instead of "claude-sonnet-5-5"/)
    return true
  })
  await stopAll(mh.children)
  console.log('PASS model: exact params, success header, invalid/RPC-error/mismatch fail loud')
}

console.log('ALL acp-run tests passed')
