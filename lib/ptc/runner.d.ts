/**
 * The `codemode` tool — the plugin's own PTC runner (decision #7: the
 * jev-only runner; ADR 0001).
 *
 * Why a second tool beside the host's `run_code`: `run_code`'s `tools`
 * namespace is the registry's private closure — 0.2.0-rc.2 ships no seam for
 * a plugin to append a second namespace, and reaching the registry's
 * internals would bypass the pre/guard/approval pipeline the approval-policy
 * investment stands on. So this tool runs its OWN binding set — `jev` and
 * `store` — through the public `ctx.ptcRuntime` seam (the
 * `resolve`+`run` pair), exactly the consumption shape dsh-workflow-ptc
 * uses. Host tools stay reachable through the preset's `run_code` (the
 * codemode preset mounts PTC mode), while batch decision programs run here.
 *
 * The model face: `codemode` takes a `program` (an async TypeScript body —
 * top-level `await`/`return`, `Promise.all` is the fan-out primitive) plus
 * an optional `timeoutMs` (default 60s). The result reports the program's
 * value, captured logs, per-call jev spend metadata, and the accepted store
 * write count. A failed run throws {@link CodeRunFailedError} (code
 * `CODE_RUN_FAILED`) — the registry's execution pipeline converts it into a
 * structured `isError` result carrying the failure kind plus the captured
 * logs, the host's own self-correction contract for failed programs.
 *
 * A fresh binding pair is built per call: the jev collector and the store
 * session handle never leak across runs, and the run's abort signal is
 * forwarded to the runtime AND linked into in-flight classify calls.
 *
 * @module runner
 */
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { PtcBindingNamespace, PtcRunFailure } from '@deepseek-ai/dsh-ptc-runtime';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import { type JevBindingDeps, type JevCollector } from './bindings/jev.ts';
import { createStoreBinding, type StoreCollector } from './bindings/store.ts';
/** The model-facing tool name (pi's word for this shape — strong priors). */
export declare const CODEMODE_TOOL_NAME = "codemode";
/** Default elapsed budget for one program when the model omits `timeoutMs`. */
export declare const DEFAULT_RUN_TIMEOUT_MS = 60000;
/** Everything the tool closes over; built once in `apply`. */
export interface CodemodeDeps {
    /** Plugin context — read for `ctx.ptcRuntime` at use time. */
    ctx: Context;
    /** The jev binding's dependencies (config refs, usage sink, env). */
    jev: JevBindingDeps;
}
/** Aggregate spend/state metadata one run reports back. */
export interface RunCollectors extends JevCollector, StoreCollector {
}
/**
 * The failure text fed to the model on a failed run: the failure kind, the
 * runtime's diagnostic, then the captured logs — the self-correction
 * payload the host's CODE_RUN_FAILED contract promises.
 */
export declare function formatRunFailure(failure: PtcRunFailure, logs: readonly string[]): string;
/** Assemble the per-call binding pair: jev (decision calls) + store (state). */
export declare function buildBindings(deps: CodemodeDeps, signal: AbortSignal, collectors: RunCollectors, session: Parameters<typeof createStoreBinding>[0]): PtcBindingNamespace[];
/** Build the registry-ready codemode tool definition. */
export declare function createCodemodeTool(deps: CodemodeDeps): ToolDefinition;
/** The tool body: resolve, run, and map the outcome onto the tool contract. */
export declare function runProgram(deps: CodemodeDeps, args: {
    program: string;
    timeoutMs?: number;
}, exec: ToolRunContext): Promise<JsonValue>;
