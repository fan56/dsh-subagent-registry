/**
 * Hand-written NDJSON JSON-RPC transport for ACP over a child's stdio.
 *
 * Deliberately narrow: three outbound requests (`initialize`, `session/new`,
 * `session/prompt`), one outbound notification (`session/cancel`), one inbound
 * client request handler (`session/request_permission`) and `session/update`
 * notifications. Lines are framed with `node:readline`; responses are paired to
 * requests by id with a per-request timeout. No SDK, no cordis — pure Node so
 * the wire can be unit-tested on its own.
 *
 * Every failure is classified by `acp/errors`, so no new error code is invented
 * here. A non-JSON line is fatal: all in-flight requests are rejected with
 * `ACP_PROTOCOL` and the connection refuses further work (fail-loud).
 *
 * @module acp/ndjson
 */

import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { ACP_CODES, classifyAcpError, type AcpError, type AcpStage } from './errors.ts'

/** JSON-RPC request id (the probe and agy use monotonically increasing ints). */
export type JsonRpcId = number | string

/** The shaped `error` object of a JSON-RPC error response. */
export interface AcpJsonRpcError {
  code: number
  message: string
  data?: unknown
}

export type AcpRequestHandler = (params?: unknown) => unknown | Promise<unknown>

export interface AcpConnectionOptions {
  /** Child stdin — requests, notifications and client-request replies are written here. */
  stdin: Writable
  /** Child stdout — responses, notifications and server requests are read here. */
  stdout: Readable
  /** Default per-request timeout in ms; a request may override it. */
  timeoutMs?: number
  /** Stage attached to classified failures (defaults to `process`). */
  stage?: AcpStage
  /** Dispatch for all agent-initiated notifications, e.g. `session/update`. */
  onNotification?: (method: string, params?: unknown) => void
  /** Handlers for agent-initiated requests, keyed by method. */
  requestHandlers?: Record<string, AcpRequestHandler>
  /** Observed fatal transport/protocol error (also rejects every pending request). */
  onError?: (error: Error) => void
}

export interface AcpConnection {
  /** Send a request and resolve with its `result`; reject on error/timeout/close. */
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
  /** Send a fire-and-forget notification (no id, no reply expected). */
  notify(method: string, params?: unknown): void
  /** Stop reading and reject every in-flight request. Idempotent. */
  close(): void
  readonly closed: boolean
  /** The fatal error, if the connection was broken by a protocol failure. */
  readonly failure: AcpError | undefined
}

const METHOD_NOT_FOUND = -32601
const INTERNAL_ERROR = -32600

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Create a connection over an already-spawned child's stdio streams.
 * The caller owns the process; `close()` only stops this reader and settles
 * pending requests.
 */
export function createAcpConnection(options: AcpConnectionOptions): AcpConnection {
  const stage = options.stage ?? 'process'
  const defaultTimeout = options.timeoutMs ?? 30_000
  const handlers = options.requestHandlers ?? {}
  const pending = new Map<number, Pending>()
  let nextId = 1
  let closed = false
  let fatal: AcpError | undefined

  const abortCode = (): AcpError => classifyAcpError({ code: ACP_CODES.ABORTED }, stage)

  /** Fatal, fail-loud protocol break: classify once and settle every waiter. */
  const breakProtocol = (): void => {
    if (fatal !== undefined || closed) return
    fatal = classifyAcpError({ protocol: true }, stage)
    options.onError?.(fatal)
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(fatal)
    }
    pending.clear()
  }

  /** Best-effort line write; returns the error instead of throwing. */
  const write = (message: unknown): Error | undefined => {
    if (closed) return undefined
    try {
      options.stdin.write(JSON.stringify(message) + '\n')
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
    return undefined
  }

  const onLine = (line: string): void => {
    if (closed || fatal !== undefined || line.trim() === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      breakProtocol()
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      breakProtocol()
      return
    }
    const obj = parsed as Record<string, unknown>
    const id = obj.id
    const hasId = typeof id === 'number' || typeof id === 'string'
    const hasResult = Object.hasOwn(obj, 'result')
    const hasError = Object.hasOwn(obj, 'error')
    const method = obj.method

    if (hasId && (hasResult || hasError)) {
      const p = pending.get(id as number)
      if (p === undefined) return // late or duplicate reply — already settled
      pending.delete(id as number)
      clearTimeout(p.timer)
      if (hasError) {
        const raw = obj.error as AcpJsonRpcError | undefined
        p.reject(classifyAcpError({
          rpcCode: typeof raw?.code === 'number' ? raw.code : undefined,
          rpcMessage: typeof raw?.message === 'string' ? raw.message : undefined,
        }, stage))
      } else {
        p.resolve(obj.result)
      }
      return
    }

    if (typeof method === 'string' && hasId && !hasResult && !hasError) {
      const handler = handlers[method]
      if (handler === undefined) {
        write({ jsonrpc: '2.0', id, error: { code: METHOD_NOT_FOUND, message: `Method not found: ${method}` } })
        return
      }
      void Promise.resolve()
        .then(() => handler(obj.params))
        .then((result) => { write({ jsonrpc: '2.0', id, result }) })
        .catch((error: unknown) => {
          write({
            jsonrpc: '2.0',
            id,
            error: { code: INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) },
          })
        })
      return
    }

    if (typeof method === 'string' && !hasId) {
      options.onNotification?.(method, obj.params)
      return
    }

    // Valid JSON but not a recognisable JSON-RPC envelope — also fail-loud.
    breakProtocol()
  }

  /** stdout EOF before a reply: process is gone, settle waiters as an early exit. */
  const onEnd = (): void => {
    if (closed || fatal !== undefined) return
    fatal = classifyAcpError({ earlyExit: true }, stage)
    options.onError?.(fatal)
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(fatal)
    }
    pending.clear()
  }

  const rl = createInterface({ input: options.stdout, crlfDelay: Infinity })
  rl.on('line', onLine)
  rl.on('error', breakProtocol)
  rl.on('close', onEnd)

  return {
    get closed() { return closed },
    get failure() { return fatal },

    request(method, params, timeoutMs) {
      if (closed || fatal !== undefined) {
        return Promise.reject(fatal ?? abortCode())
      }
      const id = nextId++
      const ms = timeoutMs ?? defaultTimeout
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(classifyAcpError({ code: ACP_CODES.TIMEOUT }, stage))
        }, ms)
        pending.set(id, { resolve, reject, timer })
        const writeError = write({ jsonrpc: '2.0', id, method, params })
        if (writeError !== undefined) {
          clearTimeout(timer)
          pending.delete(id)
          reject(writeError)
        }
      })
    },

    notify(method, params) {
      if (closed || fatal !== undefined) return
      const writeError = write({ jsonrpc: '2.0', method, params })
      if (writeError !== undefined) options.onError?.(writeError)
    },

    close() {
      if (closed) return
      closed = true
      rl.close()
      for (const p of pending.values()) {
        clearTimeout(p.timer)
        p.reject(abortCode())
      }
      pending.clear()
    },
  }
}
