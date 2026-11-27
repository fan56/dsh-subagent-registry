/**
 * The `registry-acp` provider: a one-shot, foreground-only dispatcher for the
 * built-in `agy` member. It advertises no start capabilities, owns a small
 * serialisation counter for agy's SQLite contention, and never reads the
 * working directory — the host manager already resolved `request.cwd`.
 *
 * @module acp/provider
 */
import { type ResolvedSubagentStartRequest, type SubagentRun, type SubagentProvider, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { type AgyPermissionPolicy, type AgyRunDeps } from './run.ts';
export interface AgyAcpProviderOptions {
    /** Executable and arguments (defaults: `agy`, `['acp']`). */
    command?: string;
    args?: readonly string[];
    /** Concurrency cap for agy's database; default 1. Over-cap calls fail, never queue. */
    maxConcurrent?: number;
    /** `agyPermission`; default `reject`. */
    permission?: AgyPermissionPolicy;
    handshakeTimeoutMs?: number;
    timeoutMs?: number;
    eofGraceMs?: number;
    graceMs?: number;
    model?: string;
    env?: NodeJS.ProcessEnv;
    /** Subprocess seam supplied by the host (`ctx.subprocess.spawn`). */
    spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle;
    /** Diagnostic sink for post-publication failures. */
    onError?: (error: Error, stopReason: SubagentStopReason) => void;
    /** Log sink (tests capture it; production passes `ctx.logger`). */
    log?: AgyRunDeps;
}
/**
 * Max concurrent agy processes. The host does not queue over-cap calls; this
 * counter follows the same rule so a parallel tool step cannot wedge behind a
 * chain of ten-minute tasks.
 */
export declare const DEFAULT_MAX_CONCURRENT = 1;
export declare class AgyAcpProvider implements SubagentProvider {
    readonly name = "registry-acp";
    readonly capabilities: import("@deepseek-ai/dsh-subagent").SubagentCapabilities;
    readonly inheritsParentContext = false;
    active: number;
    private readonly options;
    private readonly deps;
    constructor(options: AgyAcpProviderOptions);
    /** Read per start: `agyMaxConcurrent` is volatile and must apply without a remount. */
    get maxConcurrent(): number;
    start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>;
}
