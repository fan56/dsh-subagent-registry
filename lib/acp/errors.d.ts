/**
 * ACP error codes, signal classification and the two text exits.
 *
 * The host's `SubagentRun.result` never rejects on a child-level failure: a
 * failure before `provider.start()` returned reaches the tool as a thrown
 * `AcpError` carrying its full text; a failure after it reaches the tool as
 * `stopReason` + `diagnostic` + partial `output`. This module owns both texts
 * and the rule table that maps raw spawn / JSON-RPC / stopReason signals onto
 * one stable `ACP_*` code.
 *
 * A diagnostic is produced and consumed by this same plugin (the settle branch
 * reads the code out of the leading bracket), so it stays inside the host's
 * 4096 UTF-8 byte budget and never carries raw protocol payloads, stderr
 * tails, env values or credentials. Like the other registry errors, the copy
 * is inline English rather than a locale table.
 *
 * @module acp/errors
 */
import type { SubprocessOutcome } from '@deepseek-ai/dsh-subprocess';
/** Lifecycle stage a failure was observed at. */
export type AcpStage = 'initialize' | 'new-session' | 'prompt' | 'process';
/** Stable codes, kept as values so `error.code` is readable in tool results. */
export declare const ACP_CODES: {
    readonly NOT_INSTALLED: "ACP_NOT_INSTALLED";
    readonly SPAWN_FAILED: "ACP_SPAWN_FAILED";
    readonly NO_SUBPROCESS: "ACP_NO_SUBPROCESS";
    readonly BAD_CWD: "ACP_BAD_CWD";
    readonly BUSY: "ACP_BUSY";
    readonly AUTH_REQUIRED: "ACP_AUTH_REQUIRED";
    readonly QUOTA_EXHAUSTED: "ACP_QUOTA_EXHAUSTED";
    readonly HANDSHAKE_TIMEOUT: "ACP_HANDSHAKE_TIMEOUT";
    readonly EARLY_EXIT: "ACP_EARLY_EXIT";
    readonly ABORTED: "ACP_ABORTED";
    readonly TIMEOUT: "ACP_TIMEOUT";
    readonly AGENT_ERROR: "ACP_AGENT_ERROR";
    readonly PROTOCOL: "ACP_PROTOCOL";
    readonly FOREGROUND_ONLY: "ACP_FOREGROUND_ONLY";
};
export type AcpCode = (typeof ACP_CODES)[keyof typeof ACP_CODES];
/** Hard host budget for one diagnostic line (`types.ts:278-284`). */
export declare const ACP_DIAGNOSTIC_MAX_BYTES = 4096;
/** The signals the classifier reads; callers pass only what they have. */
export interface AcpFailure {
    /** Explicit code raised directly by the provider / registry; wins over signals. */
    code?: AcpCode;
    /** Spawn error code (`ENOENT`, `EACCES`, …). */
    errno?: string;
    /** JSON-RPC error code from a response. */
    rpcCode?: number;
    /** JSON-RPC error message (bounded and flattened before echo; never its `data`). */
    rpcMessage?: string;
    /** Free-form error / stop-reason text, scanned for auth and quota hints only. */
    text?: string;
    /** Child stop reason from `SubagentRun.result`. */
    stopReason?: string;
    /** Process exited or stdout EOF before a result arrived. */
    earlyExit?: boolean;
    /** Parent cancelled the run (AbortError). */
    aborted?: boolean;
    /** A line or field did not match the NDJSON protocol. */
    protocol?: boolean;
}
/** One row of the classification table; exported so tests lock every row. */
export interface AcpRule {
    code: AcpCode;
    match: (failure: AcpFailure) => boolean;
}
/**
 * Classification rules in priority order. A new remote shape only needs a row
 * here; the last rule and {@link classifyAcpError}'s fallback keep a common
 * code for everything unrecognised.
 */
export declare const ACP_CLASSIFICATION_RULES: readonly AcpRule[];
/** A classified failure: stable code, stage, safe fact and actionable copy. */
export declare class AcpError extends Error {
    readonly code: AcpCode;
    readonly stage: AcpStage;
    readonly fact?: string;
    readonly nextStep: string;
    /** Flattened/bounded remote JSON-RPC `message` for logs only — never a diagnostic. */
    readonly remoteMessage?: string;
    constructor(code: AcpCode, stage: AcpStage, fact?: string, nextStep?: string, remoteMessage?: string);
}
/**
 * A pre-release failure whose `fact` is already diagnostic-safe — e.g. an
 * invalid model family chosen by the caller. There is no remote message to
 * hide, so `diagnosticError` keeps the fact verbatim instead of rebuilding it.
 */
export declare class AcpConfigError extends AcpError {
    constructor(stage: AcpStage, fact: string);
}
/**
 * Truncate to a UTF-8 byte budget without cutting a multi-byte code point, so
 * a long remote message cannot leave a broken sequence in a diagnostic.
 */
export declare function truncateUtf8(text: string, maxBytes: number): string;
/** Safe, non-sensitive fact from a process outcome — never stderr. */
export declare function acpOutcomeFact(outcome: SubprocessOutcome): string;
/**
 * Map raw signals onto an {@link AcpError}. Rules are tried in table order;
 * an explicit `failure.code` wins; unknown signals fall back to
 * `ACP_AGENT_ERROR` so a new remote shape cannot escape with an untagged error.
 */
export declare function classifyAcpError(failure: AcpFailure, stage?: AcpStage): AcpError;
/** Pre-release exit: the full text becomes the `use_agent` error. */
export declare function acpErrorText(error: AcpError): string;
/**
 * Post-release exit: one diagnostic line in the settle-branch format. The
 * fact is bounded before assembly so a long remote message cannot push the
 * stable code, stage or next-step hint out of the line.
 */
export declare function acpDiagnostic(error: AcpError): string;
