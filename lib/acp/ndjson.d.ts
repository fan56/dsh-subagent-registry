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
import type { Readable, Writable } from 'node:stream';
import { type AcpError, type AcpStage } from './errors.ts';
/** JSON-RPC request id (the probe and agy use monotonically increasing ints). */
export type JsonRpcId = number | string;
/** The shaped `error` object of a JSON-RPC error response. */
export interface AcpJsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export type AcpRequestHandler = (params?: unknown) => unknown | Promise<unknown>;
export interface AcpConnectionOptions {
    /** Child stdin — requests, notifications and client-request replies are written here. */
    stdin: Writable;
    /** Child stdout — responses, notifications and server requests are read here. */
    stdout: Readable;
    /** Default per-request timeout in ms; a request may override it. */
    timeoutMs?: number;
    /** Stage attached to classified failures (defaults to `process`). */
    stage?: AcpStage;
    /** Dispatch for all agent-initiated notifications, e.g. `session/update`. */
    onNotification?: (method: string, params?: unknown) => void;
    /** Handlers for agent-initiated requests, keyed by method. */
    requestHandlers?: Record<string, AcpRequestHandler>;
    /** Observed fatal transport/protocol error (also rejects every pending request). */
    onError?: (error: Error) => void;
}
export interface AcpConnection {
    /** Send a request and resolve with its `result`; reject on error/timeout/close. */
    request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
    /** Send a fire-and-forget notification (no id, no reply expected). */
    notify(method: string, params?: unknown): void;
    /** Stop reading and reject every in-flight request. Idempotent. */
    close(): void;
    readonly closed: boolean;
    /** The fatal error, if the connection was broken by a protocol failure. */
    readonly failure: AcpError | undefined;
}
/**
 * Create a connection over an already-spawned child's stdio streams.
 * The caller owns the process; `close()` only stops this reader and settles
 * pending requests.
 */
export declare function createAcpConnection(options: AcpConnectionOptions): AcpConnection;
