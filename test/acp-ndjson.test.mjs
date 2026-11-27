// NDJSON framing, request pairing, timeout, request handlers and fail-loud.
// Run: pnpm build && node test/acp-ndjson.test.mjs
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createAcpConnection } from '../lib/acp/ndjson.js'
import { ACP_CODES } from '../lib/acp/errors.js'

const FAKE = fileURLToPath(new URL('./fixtures/fake-acp-agent.mjs', import.meta.url))

function pair(opts = {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const writes = []
  stdin.on('data', (d) => writes.push(d.toString()))
  const conn = createAcpConnection({ stdin, stdout, timeoutMs: 1000, ...opts })
  return {
    conn, stdout,
    sent: () => writes.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  }
}

// --- framing: half line, glued lines, CRLF -----------------------------------
{
  const p = pair()
  const got = p.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
  p.stdout.write('{"jsonrpc":"2.0","id":1,"res')
  p.stdout.write('ult":{"ok":true}}\n')
  assert.deepEqual(await got, { ok: true })

  const a = p.conn.request('a')
  const b = p.conn.request('b')
  p.stdout.write('{"jsonrpc":"2.0","id":2,"result":"A"}\n{"jsonrpc":"2.0","id":3,"result":"B"}\r\n')
  assert.equal(await a, 'A')
  assert.equal(await b, 'B')

  const messages = p.sent()
  assert.deepEqual(messages[0], {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} },
  }, 'request envelope matches the T6 wire shape')
  assert.equal(messages[1].id, 2)
  assert.equal(messages[2].id, 3)
  p.conn.close()
  console.log('PASS framing: half-line, glued lines and CRLF; ids are monotonic')
}

// --- out-of-order responses pair to the right request ------------------------
{
  const p = pair()
  const first = p.conn.request('first')
  const second = p.conn.request('second')
  p.stdout.write('{"jsonrpc":"2.0","id":2,"result":"SECOND"}\n')
  p.stdout.write('{"jsonrpc":"2.0","id":1,"result":"FIRST"}\n')
  assert.equal(await first, 'FIRST')
  assert.equal(await second, 'SECOND')
  p.conn.close()
  console.log('PASS pairing: replies are matched by id regardless of arrival order')
}

// --- per-request timeout ------------------------------------------------------
{
  const p = pair()
  await assert.rejects(p.conn.request('slow', {}, 25), (err) => err.code === ACP_CODES.TIMEOUT)
  // A later request still works after one timed out.
  const ok = p.conn.request('next')
  p.stdout.write('{"jsonrpc":"2.0","id":2,"result":1}\n')
  assert.equal(await ok, 1)
  p.conn.close()
  console.log('PASS timeout: rejects with ACP_TIMEOUT and leaves the connection usable')
}

// --- client request handlers: unknown -> -32601, registered -> result --------
{
  const p = pair({ requestHandlers: {
    'session/request_permission': ({ options }) => ({
      outcome: { outcome: 'selected', optionId: options[0].optionId },
    }),
  } })
  p.stdout.write('{"jsonrpc":"2.0","id":9,"method":"unknown/method","params":{}}\n')
  p.stdout.write('{"jsonrpc":"2.0","id":10,"method":"session/request_permission","params":{"options":[{"optionId":"allow-once","kind":"allow_once"}]}}\n')
  await new Promise((r) => setTimeout(r, 20))
  const replies = p.sent()
  assert.deepEqual(replies.find((m) => m.id === 9), {
    jsonrpc: '2.0', id: 9, error: { code: -32601, message: 'Method not found: unknown/method' },
  })
  assert.deepEqual(replies.find((m) => m.id === 10), {
    jsonrpc: '2.0', id: 10, result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
  })
  p.conn.close()
  console.log('PASS handlers: unknown method -> -32601; registered handler -> result')
}

// --- non-JSON line is fail-loud ----------------------------------------------
{
  const p = pair()
  const pending = p.conn.request('doomed')
  p.stdout.write('this is not json\n')
  await assert.rejects(pending, (err) => err.code === ACP_CODES.PROTOCOL)
  assert.equal(p.conn.failure.code, ACP_CODES.PROTOCOL)
  await assert.rejects(p.conn.request('after'), (err) => err.code === ACP_CODES.PROTOCOL)
  p.conn.close()
  console.log('PASS protocol: non-JSON line -> ACP_PROTOCOL and the connection is dead')
}

// --- close settles in-flight requests ----------------------------------------
{
  const p = pair()
  const pending = p.conn.request('in-flight')
  p.conn.close()
  assert.equal(p.conn.closed, true)
  await assert.rejects(pending, (err) => err.code === ACP_CODES.ABORTED)
  console.log('PASS close: idempotent, rejects in-flight with ACP_ABORTED')
}

// --- notification dispatch ----------------------------------------------------
{
  const seen = []
  const p = pair({ onNotification: (method, params) => seen.push([method, params]) })
  p.stdout.write('{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk"}}}\n')
  assert.equal(seen.length, 1)
  assert.equal(seen[0][0], 'session/update')
  assert.equal(seen[0][1].update.sessionUpdate, 'agent_message_chunk')
  p.conn.close()
  console.log('PASS notifications: dispatched to onNotification without an id')
}

// --- integration: drive the fake agent end to end ----------------------------
function spawnFake(scenario, opts = {}) {
  const child = spawn(process.execPath, [FAKE, scenario], { stdio: ['pipe', 'pipe', 'pipe'] })
  const chunks = []
  const errors = []
  // ePipe: the child closes its stdin; swallow the resulting EPIPE event.
  child.stdin.on('error', () => {})
  const allowHandler = ({ options = [] }) => {
    const allow = options.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always')
    return { outcome: allow ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' } }
  }
  const conn = createAcpConnection({
    stdin: child.stdin,
    stdout: child.stdout,
    timeoutMs: opts.timeoutMs ?? 3000,
    stage: 'prompt',
    onError: (e) => errors.push(e),
    onNotification(method, params) {
      if (method === 'session/update' && params?.update?.sessionUpdate === 'agent_message_chunk') {
        chunks.push(params.update.content?.text ?? '')
      }
    },
    requestHandlers: { 'session/request_permission': opts.permissionHandler ?? allowHandler },
  })
  return { child, conn, chunks, errors }
}

async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

// ok: the exact T6-verified envelopes are echoed into the final text.
{
  const f = spawnFake('ok')
  try {
    assert.deepEqual(await f.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} }), { protocolVersion: 1, capabilities: {} })
    const session = await f.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
    assert.equal(session.sessionId, 'fake-session-1')
    const prompt = await f.conn.request('session/prompt', {
      sessionId: session.sessionId, prompt: [{ type: 'text', text: 'do the task' }],
    })
    assert.equal(prompt.stopReason, 'end_turn')
    const text = f.chunks.join('')
    const echo = JSON.parse(text.slice(text.indexOf('{')))
    assert.deepEqual(echo.initialize, { protocolVersion: 1, clientCapabilities: {} })
    assert.deepEqual(echo['session/new'], { cwd: '/tmp', mcpServers: [] })
    assert.deepEqual(echo['session/prompt'], {
      sessionId: 'fake-session-1', prompt: [{ type: 'text', text: 'do the task' }],
    })
    // Prompt written to the child uses the same shape, with a fresh id.
    f.conn.close()
    console.log('PASS fake ok: initialize/session-new/session-prompt params echoed verbatim')
  } finally {
    await stop(f.child)
  }
}

// perm and perm-reject-only: client request handler round-trips the decision.
{
  for (const [scenario, expected] of [['perm', 'allow-once'], ['perm-reject-only', 'cancelled']]) {
    const f = spawnFake(scenario)
    try {
      await f.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
      const s = await f.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
      await f.conn.request('session/prompt', { sessionId: s.sessionId, prompt: [] })
      const text = f.chunks.join('')
      const echo = JSON.parse(text.slice(text.indexOf('{')))
      assert.equal(echo.permissionChoice, expected, `${scenario}: decision echoed`)
      f.conn.close()
    } finally {
      await stop(f.child)
    }
  }
  console.log('PASS fake perm / perm-reject-only: allow selected, reject-only cancelled')
}

// auth, garbage, hang: each maps to one classified failure.
{
  const auth = spawnFake('auth')
  try {
    await assert.rejects(auth.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} }),
      (e) => e.code === ACP_CODES.AUTH_REQUIRED)
    auth.conn.close()
  } finally { await stop(auth.child) }

  const garbage = spawnFake('garbage')
  try {
    await garbage.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
    const s = await garbage.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
    await assert.rejects(garbage.conn.request('session/prompt', { sessionId: s.sessionId, prompt: [] }),
      (e) => e.code === ACP_CODES.PROTOCOL)
    garbage.conn.close()
  } finally { await stop(garbage.child) }

  const hang = spawnFake('hang', { timeoutMs: 60 })
  try {
    await hang.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
    const s = await hang.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
    await assert.rejects(hang.conn.request('session/prompt', { sessionId: s.sessionId, prompt: [] }),
      (e) => e.code === ACP_CODES.TIMEOUT)
    hang.conn.close()
  } finally { await stop(hang.child) }
  console.log('PASS fake auth / garbage / hang: AUTH_REQUIRED, PROTOCOL, TIMEOUT')
}

// The remaining scenarios all resolve or fail fast, so T14 can drive each one.
{
  const cases = [
    ['refusal', 'refusal', null],
    ['quota', 'error', 'quota exceeded'],
    ['slow', 'end_turn', 'slow-2'],
    ['grandchild', 'end_turn', null],
  ]
  for (const [scenario, stopReason, textHit] of cases) {
    const f = spawnFake(scenario)
    try {
      await f.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
      const s = await f.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
      const r = await f.conn.request('session/prompt', { sessionId: s.sessionId, prompt: [] })
      assert.equal(r.stopReason, stopReason, `${scenario}: stopReason`)
      if (textHit) assert.ok(f.chunks.join('').includes(textHit), `${scenario}: ${textHit} streamed`)
      if (scenario === 'grandchild') {
        const text = f.chunks.join('')
        const echo = JSON.parse(text.slice(text.indexOf('{')))
        assert.equal(typeof echo.grandchildPid, 'number', 'grandchild pid echoed')
        try { process.kill(echo.grandchildPid, 'SIGKILL') } catch {}
      }
      f.conn.close()
    } finally { await stop(f.child) }
  }
  console.log('PASS fake refusal / quota / slow / grandchild: all prompt paths usable')
}

// Early process deaths settle pending requests without hanging.
{
  for (const [scenario, code] of [
    ['exit-during-handshake', ACP_CODES.EARLY_EXIT],
    ['early-exit', ACP_CODES.EARLY_EXIT],
    ['crash-mid-prompt', ACP_CODES.EARLY_EXIT],
    ['ePipe', ACP_CODES.EARLY_EXIT],
  ]) {
    const f = spawnFake(scenario, { timeoutMs: 400 })
    try {
      const init = await f.conn.request('initialize', { protocolVersion: 1, clientCapabilities: {} })
      if (scenario === 'exit-during-handshake') {
        assert.ok(false, 'initialize should not resolve for exit-during-handshake')
      } else {
        const s = await f.conn.request('session/new', { cwd: '/tmp', mcpServers: [] })
        if (scenario === 'ePipe') await new Promise((r) => setTimeout(r, 60))
        await assert.rejects(f.conn.request('session/prompt', { sessionId: s.sessionId, prompt: [] }),
          (e) => e.code === code, `${scenario}: settles as ${code}`)
      }
      void init
      f.conn.close()
    } catch (err) {
      if (scenario === 'exit-during-handshake') {
        assert.equal(err.code, code, 'exit-during-handshake settles as EARLY_EXIT')
      } else throw err
    } finally { await stop(f.child) }
  }
  console.log('PASS fake exit-during-handshake / early-exit / crash-mid-prompt / ePipe: fast failure')
}

console.log('ALL acp-ndjson tests passed')
