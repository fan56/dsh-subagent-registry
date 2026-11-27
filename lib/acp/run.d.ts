/**
 * Drive one `agy acp` child through a fresh ACP session and publish it as a
 * host `SubagentRun`. The wire driver lives in `acp/ndjson`; this module owns
 * process lifecycle, cancellation, two timeouts, output folding, permission
 * replies and the one diagnostic line the registry settle branch reads.
 *
 * Nothing here fetches the working directory or validates capabilities — the
 * host manager already resolved `request.cwd` and preflighted the provider.
 *
 * @module acp/run
 */
import { type SubagentRun, type SubagentStartRequest, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** How to answer the child's `session/request_permission` prompts. */
export type AgyPermissionPolicy = 'allow' | 'reject';
/** Resolved configuration for one agy child. Timeouts/graces are in ms. */
export interface AgyRunSpec {
    /** Absolute directory already computed by the host manager. */
    cwd: string;
    /** Executable, default `agy` (tests point it at the fake agent). */
    command?: string;
    /** Arguments, default `['acp']`. */
    args?: readonly string[];
    /** Permission auto-answer; default `reject` (`agyPermission`). */
    permission?: AgyPermissionPolicy;
    /** Deadline for initialize + session/new from `agyHandshakeTimeoutMs`; default 20s. */
    handshakeTimeoutMs?: number;
    /** Deadline for session/prompt from `agyTimeoutMs`; default 10min. */
    timeoutMs?: number;
    /** stdin EOF grace before escalating; default 6s. */
    eofGraceMs?: number;
    /** SIGTERM → SIGKILL grace; default 3s. */
    graceMs?: number;
    /** Session model to show in the success source header when `session/new` has none. */
    model?: string;
    env?: NodeJS.ProcessEnv;
    /** Subprocess seam — the host's managed-range spawn. */
    spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle;
    /** Host diagnostic sink; the original error (including its rpc message) goes here. */
    onError?: (error: Error, stopReason: SubagentStopReason) => void;
}
/** Optional log seam; defaults to a no-op so a library caller never writes to a terminal. */
export interface AgyRunDeps {
    log?: (line: string) => void;
    warn?: (line: string) => void;
}
export declare const DEFAULT_HANDSHAKE_TIMEOUT_MS = 20000;
export declare const DEFAULT_TASK_TIMEOUT_MS = 600000;
export declare const DEFAULT_EOF_GRACE_MS = 6000;
export declare const DEFAULT_GRACE_MS = 3000;
/** Last 4 KB of child stderr, for logs only (never a diagnostic). */
export declare const STDERR_TAIL_BYTES = 4096;
/** Cap on the tool-trace block appended to `output` on a failed/aborted run. */
export declare const MAX_TOOL_TRACE = 50;
/**
 * Start one agy child. Startup failures reject after process cleanup; after
 * publication all failures travel through `result` (which never rejects).
 */
export declare function startAgyRun(request: SubagentStartRequest, spec: AgyRunSpec, deps?: AgyRunDeps): Promise<SubagentRun>;
