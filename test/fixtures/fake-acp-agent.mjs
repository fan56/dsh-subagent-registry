#!/usr/bin/env node
// Fake ACP agent speaking NDJSON over stdio, for acp-ndjson / acp-run tests.
// Scenario: argv[2] or FAKE_ACP_SCENARIO, default 'ok'.
// Every received initialize / session/new / session/prompt param is echoed into
// the final text chunk so wire-shape tests can lock the exact request envelope.
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const scenario = process.argv[2] ?? process.env.FAKE_ACP_SCENARIO ?? 'ok'
// ACP `configOptions.model` families (same shape T35 measured on real agy).
const MODEL_FAMILIES = [
  'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-4-hydrogen',
  'gemini-pro-orchestrator-neon', 'gemini-pro-orchestrator', 'gemini-pro-orchestrator-argon',
  'gemini-3.8-flash', 'claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-oss-120b-medium',
]
const modelScenario = scenario.startsWith('model')
const echo = {}
let sessionId = 'fake-session'
let promptDone = false
let exiting = false
const pending = new Map()
let nextId = 1

const send = (obj) => { process.stdout.write(JSON.stringify(obj) + '\n') }
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const rpcError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
const chunk = (text) => send({
  jsonrpc: '2.0',
  method: 'session/update',
  params: {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
  },
})
const finalText = () => `ECHO ${JSON.stringify(echo)}`

function request(method, params) {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    send({ jsonrpc: '2.0', id, method, params })
  })
}

function settlePrompt(stopReason = 'end_turn', extra = '') {
  if (promptDone) return
  promptDone = true
  chunk(finalText() + extra)
  reply(promptParamsId, { stopReason, usage: { totalTokens: 42 } })
}

let promptParamsId = null

async function askPermission(options) {
  const res = await request('session/request_permission', {
    sessionId,
    toolCall: { toolCallId: 'tc-1', kind: 'execute', title: 'fake tool' },
    options,
  })
  echo.permissionReply = res?.outcome ?? null
  return res?.outcome?.outcome === 'selected' ? res.outcome.optionId : 'cancelled'
}

async function handlePrompt(id, params) {
  promptParamsId = id
  echo['session/prompt'] = params
  if (exiting) return // early-exit / ePipe: the client writes into a dying agent
  switch (scenario) {
    case 'hang':
      // Never answer; the caller's per-request timeout is under test.
      setInterval(() => {}, 1000)
      return
    case 'crash-mid-prompt':
      chunk('partial before crash')
      // Give the piped chunk time to flush before the hard exit.
      setTimeout(() => process.exit(7), 20)
      return
    case 'garbage':
      process.stdout.write('this is not json\n')
      settlePrompt()
      return
    case 'auth':
      rpcError(id, -32000, 'Authentication required')
      return
    case 'quota':
      settlePrompt('error', ' quota exceeded')
      return
    case 'refusal':
      settlePrompt('refusal')
      return
    case 'ePipe':
      settlePrompt()
      return
    case 'slow':
      chunk('slow-1')
      setTimeout(() => chunk('slow-2'), 120)
      setTimeout(() => settlePrompt(), 260)
      return
    case 'grandchild': {
      const pidFile = process.env.FAKE_ACP_PID_FILE
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' })
      child.unref()
      if (pidFile) { try { writeFileSync(pidFile, String(child.pid)) } catch {} }
      echo.grandchildPid = child.pid
      settlePrompt()
      return
    }
    case 'perm': {
      const chosen = await askPermission([
        { optionId: 'allow-once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'reject-once', kind: 'reject_once', name: 'Reject once' },
      ])
      echo.permissionChoice = chosen
      settlePrompt()
      return
    }
    case 'perm-reject-only': {
      const chosen = await askPermission([
        { optionId: 'reject-once', kind: 'reject_once', name: 'Reject once' },
      ])
      echo.permissionChoice = chosen
      settlePrompt()
      return
    }
    default:
      settlePrompt()
      return
  }
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object') return
  if (msg.id != null && (Object.hasOwn(msg, 'result') || Object.hasOwn(msg, 'error'))) {
    const resolve = pending.get(msg.id)
    if (resolve) { pending.delete(msg.id); resolve(Object.hasOwn(msg, 'result') ? msg.result : msg) }
    return
  }
  switch (msg.method) {
    case 'initialize':
      echo.initialize = msg.params
      if (scenario === 'exit-during-handshake') { process.exit(3); return }
      if (scenario === 'auth') { rpcError(msg.id, -32000, 'Authentication required'); return }
      reply(msg.id, { protocolVersion: 1, capabilities: {} })
      return
    case 'session/new':
      echo['session/new'] = msg.params
      sessionId = 'fake-session-1'
      reply(msg.id, {
        sessionId, models: [],
        ...(modelScenario ? {
          configOptions: [
            { id: 'model', currentValue: 'gemini-4-neon', options: MODEL_FAMILIES },
            { id: 'thought_level', currentValue: 'high', options: ['low', 'medium', 'high', 'xhigh'] },
          ],
        } : {}),
      })
      if (scenario === 'early-exit') { exiting = true; setTimeout(() => process.exit(0), 20) }
      if (scenario === 'ePipe') { exiting = true; setTimeout(() => process.stdin.destroy(), 20) }
      return
    case 'session/set_config_option': {
      // Client → server request: echo the exact params, then answer by value.
      echo['session/set_config_option'] = msg.params
      if (scenario === 'model-rpc-error') {
        rpcError(msg.id, -32602, 'SECRET_REMOTE_MODEL_MESSAGE: rejected')
        return
      }
      const value = msg.params?.value
      reply(msg.id, {
        configOptions: [
          {
            id: 'model',
            currentValue: scenario === 'model-mismatch' ? 'gemini-4-neon' : value,
            options: MODEL_FAMILIES,
          },
        ],
      })
      return
    }
    case 'session/prompt':
      void handlePrompt(msg.id, msg.params)
      return
    case 'session/cancel':
      // Best-effort cancel notification; the agent exits without a prompt reply.
      if (scenario === 'hang') process.exit(0)
      return
    default:
      return
  }
}

process.stdin.on('error', () => { /* ePipe: client writes to a closed stdin */ })
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch { process.stdout.write('garbage from client\n'); return }
  handleMessage(msg)
})
