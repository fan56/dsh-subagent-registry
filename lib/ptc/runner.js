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
import { CodeRunFailedError, defineTool } from '@deepseek-ai/dsh-tools';
import { createJevBinding } from "./bindings/jev.js";
import { createStoreBinding } from "./bindings/store.js";
/** The model-facing tool name (pi's word for this shape — strong priors). */
export const CODEMODE_TOOL_NAME = 'codemode';
/** Default elapsed budget for one program when the model omits `timeoutMs`. */
export const DEFAULT_RUN_TIMEOUT_MS = 60_000;
/**
 * The failure text fed to the model on a failed run: the failure kind, the
 * runtime's diagnostic, then the captured logs — the self-correction
 * payload the host's CODE_RUN_FAILED contract promises.
 */
export function formatRunFailure(failure, logs) {
    const logTail = logs.length > 0 ? `\n${logs.join('\n')}` : '';
    return `${failure.kind}: ${failure.message}${logTail}`;
}
/** Assemble the per-call binding pair: jev (decision calls) + store (state). */
export function buildBindings(deps, signal, collectors, session) {
    return [
        createJevBinding(deps.jev, signal, collectors),
        createStoreBinding(session, collectors),
    ];
}
/** Build the registry-ready codemode tool definition. */
export function createCodemodeTool(deps) {
    return defineTool({
        name: CODEMODE_TOOL_NAME,
        description: 'Run a batch classification/evaluation/aggregation program as an async TypeScript body '
            + '(top-level await/return). The program sees two globals: `jev` — one calibrated decision '
            + 'backend, `jev.classify({questions, state})` answers a batched question set (choice/score/noul) '
            + 'and `jev.isConfigured()` probes availability; failures resolve structured `{error}` results, '
            + 'never rejections — and `store` — session-scoped branch-aware key/value state, '
            + '`await store.store(key, value)` / `await store.load(key)` (256KB per value / 1MB per branch, '
            + 'fork-separated, survives resume). Fan out with Promise.all; return the aggregate as JSON. '
            + 'Sizing rule: small batches (up to ~10 items) run here directly; for large batches dispatch '
            + 'the dedicated `ptc-subagent` (use_agent) instead, so the per-item intermediate work stays '
            + 'out of the main context — it runs this same tool in its own session and returns only the aggregate.',
        parameters: {
            program: {
                type: 'string',
                required: true,
                description: 'The program: an async TypeScript function body. Top-level await/return are available; the completion value (lossless JSON) becomes result.value.',
            },
            timeoutMs: {
                type: 'integer',
                description: `Elapsed budget for the whole program in milliseconds (default ${DEFAULT_RUN_TIMEOUT_MS}).`,
            },
        },
        output: {
            schema: { type: 'json', description: 'The program result: { value, logs, jevCalls, storeWrites } — value is the program\'s return, logs the captured console output, jevCalls the per-call decision metadata (model/usage/latency), storeWrites the accepted store write count.' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        execute: async (args, exec) => runProgram(deps, args, exec),
    });
}
/** The tool body: resolve, run, and map the outcome onto the tool contract. */
export async function runProgram(deps, args, exec) {
    const { program, timeoutMs } = args;
    if (typeof program !== 'string' || program.trim() === '') {
        throw new Error('codemode: program must be a non-empty string');
    }
    if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) {
        throw new Error('codemode: timeoutMs must be a positive integer (milliseconds)');
    }
    // Read the runtime defensively: on a real cordis context a property access
    // (`ctx.ptcRuntime`) THROWS when the service is not in this plugin's
    // inject — and 'ptcRuntime' stays off the inject on purpose, so a host
    // without the PTC runtime line keeps mounting (the gate-off default
    // registers nothing, and an enabled codemode call lands here with the
    // friendly misconfiguration error instead of failing the whole plugin).
    // A cordis ctx always carries get(); a plain ctx object (tests, hand-built
    // doubles) carries the runtime as a property — both shapes resolve.
    const ctxLike = deps.ctx;
    const runtime = (typeof ctxLike.get === 'function'
        ? ctxLike.get('ptcRuntime')
        : ctxLike.ptcRuntime);
    if (runtime === undefined) {
        throw new Error('codemode: no PTC runtime is mounted — this preset requires the dsh-base PTC runtime line');
    }
    // Link the host's caller cancellation into the bindings: the run signal
    // stops the program, the linked controller settles in-flight classify
    // calls with a structured timeout/network result instead of a hang.
    const linked = new AbortController();
    const onAbort = () => linked.abort();
    exec.signal.addEventListener('abort', onAbort, { once: true });
    const collectors = { jevCalls: [], storeWrites: 0 };
    const session = exec.agent?.session;
    try {
        const bindings = buildBindings(deps, linked.signal, collectors, session);
        const spec = runtime.resolve({
            program,
            bindings,
            timeoutMs: timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
            signal: exec.signal,
        });
        const result = await runtime.run(spec);
        if (result.error !== undefined) {
            throw new CodeRunFailedError(formatRunFailure(result.error, result.logs));
        }
        return {
            value: result.value ?? null,
            logs: result.logs,
            jevCalls: collectors.jevCalls,
            storeWrites: collectors.storeWrites,
        };
    }
    finally {
        exec.signal.removeEventListener('abort', onAbort);
    }
}
//# sourceMappingURL=runner.js.map