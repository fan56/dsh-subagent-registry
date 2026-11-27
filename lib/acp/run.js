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
import { randomUUID } from 'node:crypto';
import { AssistantOutputFold, assertUsableCwd, settleRunResult, subprocessRunHandle, } from '@deepseek-ai/dsh-subagent';
import { ACP_CODES, AcpError, acpDiagnostic, acpOutcomeFact, classifyAcpError, truncateUtf8, } from "./errors.js";
import { createAcpConnection } from "./ndjson.js";
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 20_000;
export const DEFAULT_TASK_TIMEOUT_MS = 600_000;
export const DEFAULT_EOF_GRACE_MS = 6_000;
export const DEFAULT_GRACE_MS = 3_000;
/** Last 4 KB of child stderr, for logs only (never a diagnostic). */
export const STDERR_TAIL_BYTES = 4_096;
/** Cap on the tool-trace block appended to `output` on a failed/aborted run. */
export const MAX_TOOL_TRACE = 50;
const toError = (value) => value instanceof Error ? value : new Error(String(value));
/** Extract only safe numbers from an already-classified remote error. */
function remoteFacts(fact) {
    if (fact === undefined)
        return {};
    const code = /jsonrpc code (-?\d+)/.exec(fact);
    const message = /message: (.*)$/.exec(fact);
    return {
        ...(code === null ? {} : { rpcCode: Number(code[1]) }),
        // The remote message is for classification and logs only — never for a fact.
        ...(message === null ? {} : { rpcMessage: message[1] }),
    };
}
/**
 * Rebuild a diagnostic-safe error: classify with the remote message (so auth /
 * quota text hints still resolve to the right code) but drop that message from
 * the emitted fact. The raw error is logged separately via `onError`/`warn`.
 */
function diagnosticError(error, stage) {
    if (!(error instanceof Error))
        return classifyAcpError({ errno: String(error) }, stage);
    if (error.name !== 'AcpError') {
        const errno = error.code;
        return classifyAcpError({ errno: typeof errno === 'string' ? errno : undefined }, stage);
    }
    const original = error;
    const { rpcCode, rpcMessage } = remoteFacts(original.fact);
    const code = classifyAcpError({
        code: original.code === ACP_CODES.AGENT_ERROR ? undefined : original.code,
        rpcCode,
        // Pass into the classifier for text hints; the resulting fact is rebuilt below.
        ...(rpcMessage === undefined ? {} : { text: rpcMessage }),
    }, stage);
    const safe = [];
    if (rpcCode !== undefined)
        safe.push(`jsonrpc code ${rpcCode}`);
    return new AcpError(code.code, stage, safe.join('; ') || undefined, code.nextStep);
}
/** Add safe exit facts (never stderr) to an error attributed to a dead process. */
function withOutcome(error, observed) {
    if (observed === undefined)
        return error;
    const fact = [error.fact, acpOutcomeFact(observed)].filter((part) => part !== undefined).join('; ');
    return new AcpError(error.code, error.stage, fact, error.nextStep);
}
/** ACP StopReason → host stop reason; any unknown terminal reason is a failure. */
function stopReasonOf(raw) {
    switch (raw) {
        case 'end_turn': return 'completed';
        case 'max_tokens': return 'max-tokens';
        case 'refusal': return 'refusal';
        case 'cancelled': return 'aborted';
        default: return 'error';
    }
}
/** ACP prompt blocks are text-only; non-text blocks are dropped. */
function promptBlocks(prompt) {
    const blocks = [];
    for (const block of prompt)
        if (block.type === 'text')
            blocks.push(block);
    return blocks;
}
/** Read the session default model from `session/new`; accept string or object entries. */
function sessionModel(session) {
    if (session === null || typeof session !== 'object')
        return undefined;
    const models = Reflect.get(session, 'models');
    if (!Array.isArray(models))
        return undefined;
    for (const item of models) {
        if (typeof item === 'string' && item !== '')
            return item;
        if (item !== null && typeof item === 'object') {
            for (const key of ['modelId', 'id', 'name', 'value']) {
                const value = Reflect.get(item, key);
                if (typeof value === 'string' && value !== '')
                    return value;
            }
        }
    }
    return undefined;
}
/** Keep the LAST 4 KB of stderr (aligned to a code point), for logs only. */
function appendStderr(tail, chunk) {
    const bytes = Buffer.concat([Buffer.from(tail.text, 'utf8'), Buffer.from(chunk)]);
    if (bytes.byteLength <= STDERR_TAIL_BYTES) {
        tail.text = bytes.toString('utf8');
        return;
    }
    let start = bytes.byteLength - STDERR_TAIL_BYTES;
    // Skip continuation bytes so the retained tail starts on a code point.
    while (start < bytes.byteLength && (bytes[start] & 0xc0) === 0x80)
        start++;
    tail.text = bytes.subarray(start).toString('utf8');
}
/**
 * Start one agy child. Startup failures reject after process cleanup; after
 * publication all failures travel through `result` (which never rejects).
 */
export async function startAgyRun(request, spec, deps = {}) {
    const log = deps.log ?? (() => { });
    const warn = deps.warn ?? log;
    if (request.signal.aborted)
        throw classifyAcpError({ code: ACP_CODES.ABORTED }, 'process');
    let cwd;
    try {
        cwd = assertUsableCwd('dsh-subagent-registry', 'agy cwd', spec.cwd ?? request.cwd ?? '');
    }
    catch {
        // assertUsableCwd throws a plain Error (no `code`), so map explicitly to
        // ACP_BAD_CWD rather than relying on an INVALID_CWD code that does not exist.
        throw classifyAcpError({ code: ACP_CODES.BAD_CWD }, 'process');
    }
    if (typeof spec.spawn !== 'function')
        throw classifyAcpError({ code: ACP_CODES.NO_SUBPROCESS }, 'process');
    const startedAt = Date.now();
    const argv = [spec.command ?? 'agy', ...(spec.args ?? ['acp'])];
    let child;
    try {
        child = spec.spawn({
            argv,
            cwd,
            stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
            graceMs: spec.graceMs ?? DEFAULT_GRACE_MS,
            signal: request.signal,
            env: spec.env,
        });
    }
    catch (error) {
        const errno = error?.code;
        throw classifyAcpError({ errno: typeof errno === 'string' ? errno : undefined }, 'process');
    }
    if (child.stdin === undefined || child.stdout === undefined) {
        throw classifyAcpError({ code: ACP_CODES.SPAWN_FAILED }, 'process');
    }
    // Observe exit facts from the same tick the handle arrives: a late catch can
    // leave `done`'s rejection unhandled when the child dies during startup.
    let outcome;
    let processFailure;
    const done = child.done.then((value) => { outcome = value; return value; }, (error) => { processFailure = toError(error); throw processFailure; });
    const rejected = done.then(() => new Promise(() => { }), (error) => Promise.reject(toError(error)));
    rejected.catch(() => { });
    const stderr = { text: '' };
    child.stderr?.on('data', (chunk) => appendStderr(stderr, chunk));
    const fold = new AssistantOutputFold();
    const tools = [];
    const flags = { cancelled: false, promptAt: undefined };
    let diagnostic;
    let sessionId;
    let model = spec.model ?? 'agy';
    let stage = 'initialize';
    let settleCancel;
    const cancelSettled = new Promise((resolve) => { settleCancel = resolve; });
    const cancelRace = cancelSettled.then(() => { throw classifyAcpError({ code: ACP_CODES.ABORTED }, stage); });
    cancelRace.catch(() => { });
    const onNotification = (method, params) => {
        if (method !== 'session/update' || params === null || typeof params !== 'object')
            return;
        const update = Reflect.get(params, 'update');
        if (update === null || typeof update !== 'object')
            return;
        const kind = Reflect.get(update, 'sessionUpdate');
        if (kind === 'agent_message_chunk') {
            const content = Reflect.get(update, 'content');
            if (content !== null && typeof content === 'object' && Reflect.get(content, 'type') === 'text') {
                const text = Reflect.get(content, 'text');
                if (typeof text === 'string')
                    fold.pushText(text);
            }
            return;
        }
        if (kind !== 'tool_call' && kind !== 'tool_call_update')
            return;
        if (tools.length >= MAX_TOOL_TRACE)
            return;
        const meta = Reflect.get(update, '_meta');
        const title = [Reflect.get(update, 'title'), meta !== null && typeof meta === 'object' ? Reflect.get(meta, 'title') : undefined]
            .find((value) => typeof value === 'string' && value !== '');
        const name = [Reflect.get(update, 'name'), Reflect.get(update, 'kind')]
            .find((value) => typeof value === 'string' && value !== '');
        const entry = title !== undefined && name !== undefined && name !== title ? `${name}: ${title}` : title ?? name ?? 'tool';
        tools.push(truncateUtf8(entry.replace(/[\r\n\t]+/g, ' '), 120));
    };
    const connection = createAcpConnection({
        stdin: child.stdin,
        stdout: child.stdout,
        timeoutMs: spec.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
        stage: 'prompt',
        onNotification,
        onError: (error) => { warn(`[agy-acp] transport: ${error.message}`); },
        requestHandlers: {
            // agyPermission: allow selects the first allow option, reject (default)
            // always answers `cancelled` — including when only reject options exist.
            'session/request_permission': (params) => {
                const options = params !== null && typeof params === 'object'
                    ? Reflect.get(params, 'options')
                    : undefined;
                if (spec.permission === 'allow' && Array.isArray(options)) {
                    const allow = options.find((option) => {
                        const kind = option !== null && typeof option === 'object' ? Reflect.get(option, 'kind') : undefined;
                        return kind === 'allow_once' || kind === 'allow_always';
                    });
                    if (allow !== null && allow !== undefined && typeof allow === 'object') {
                        return { outcome: { outcome: 'selected', optionId: Reflect.get(allow, 'optionId') } };
                    }
                }
                return { outcome: { outcome: 'cancelled' } };
            },
        },
    });
    const onAbort = () => {
        if (flags.cancelled)
            return;
        flags.cancelled = true;
        // Start the seam's whole-range termination synchronously; teardown still
        // owns the bounded exit proof.
        child.terminate();
        settleCancel();
        if (sessionId !== undefined)
            connection.notify('session/cancel', { sessionId });
    };
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted)
        onAbort();
    const waitForExitWithin = async (ms) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
            return await child.waitForExit(controller.signal);
        }
        catch {
            return false;
        }
        finally {
            clearTimeout(timer);
        }
    };
    // One shared teardown for startup rollback, the successful wait-for-exit and
    // the published run's dispose(). Every caller sees the same memoized promise.
    let teardownPromise;
    const teardown = () => (teardownPromise ??= (async () => {
        try {
            child.stdin?.end();
        }
        catch { /* already closed */ }
        let exited = false;
        try {
            exited = await waitForExitWithin(spec.eofGraceMs ?? DEFAULT_EOF_GRACE_MS);
        }
        catch { /* observed below */ }
        if (!exited) {
            child.terminate();
            try {
                await child.waitForExit();
            }
            catch { /* outcome facts are best effort */ }
        }
        if (flags.promptAt !== undefined) {
            log(`[agy-acp] result → process exit ${Date.now() - flags.promptAt}ms`);
        }
        if (stderr.text !== '')
            log(`[agy-acp] stderr tail: ${stderr.text}`);
    })());
    const textBlocks = () => fold.collect() ?? [];
    const failureOutput = () => {
        const blocks = [...textBlocks()];
        if (tools.length > 0) {
            blocks.push({ type: 'text', text: `Tools agy called before the run ended: ${tools.join(', ')}` });
        }
        return blocks;
    };
    try {
        stage = 'initialize';
        let handshakeTimer;
        const handshakeTimeout = new Promise((_, reject) => {
            handshakeTimer = setTimeout(() => reject(classifyAcpError({ code: ACP_CODES.HANDSHAKE_TIMEOUT }, stage)), spec.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);
        });
        try {
            await Promise.race([
                (async () => {
                    const init = await connection.request('initialize', { protocolVersion: 1, clientCapabilities: {} });
                    if (init === undefined)
                        throw classifyAcpError({ protocol: true }, 'initialize');
                    stage = 'new-session';
                    const session = await connection.request('session/new', { cwd, mcpServers: [] });
                    const id = session !== null && typeof session === 'object' ? Reflect.get(session, 'sessionId') : undefined;
                    if (typeof id !== 'string' || id === '')
                        throw classifyAcpError({ protocol: true }, 'new-session');
                    sessionId = id;
                    model = sessionModel(session) ?? model;
                })(),
                handshakeTimeout,
                cancelRace,
                rejected,
            ]);
        }
        finally {
            if (handshakeTimer !== undefined)
                clearTimeout(handshakeTimer);
        }
        log(`[agy-acp] session ${sessionId} ready in ${Date.now() - startedAt}ms · cwd ${cwd} · argv ${argv.join(' ')}`);
    }
    catch (error) {
        request.signal.removeEventListener('abort', onAbort);
        connection.close();
        await teardown().catch((cleanup) => { warn(`[agy-acp] startup cleanup: ${toError(cleanup).message}`); });
        throw withOutcome(diagnosticError(error, stage), outcome);
    }
    let taskTimer;
    const taskTimeout = new Promise((_, reject) => {
        taskTimer = setTimeout(() => reject(classifyAcpError({ code: ACP_CODES.TIMEOUT }, 'prompt')), spec.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS);
    });
    const result = settleRunResult({
        attempt: async () => {
            try {
                const answer = await Promise.race([
                    connection.request('session/prompt', {
                        sessionId: sessionId,
                        prompt: promptBlocks(request.prompt),
                    }),
                    taskTimeout,
                    cancelRace,
                    rejected,
                ]);
                flags.promptAt = Date.now();
                const raw = answer !== null && typeof answer === 'object' ? Reflect.get(answer, 'stopReason') : undefined;
                const stopReason = stopReasonOf(raw);
                if (stopReason !== 'completed') {
                    diagnostic = acpDiagnostic(classifyAcpError({
                        stopReason: typeof raw === 'string' ? raw : undefined,
                        // Only accumulated assistant text — auth/quota hints there are safe
                        // to scan; the raw JSON-RPC `message` is never put into a diagnostic.
                        text: textBlocks().map((block) => block.type === 'text' ? block.text : '').join(' '),
                    }, 'prompt'));
                    return { output: failureOutput(), diagnostic, stopReason };
                }
                // Every successful call waits for the child to actually exit.
                await teardown();
                const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
                return {
                    output: [{ type: 'text', text: `[agy · ${model} · ${elapsed}s]` }, ...textBlocks()],
                    stopReason: 'completed',
                };
            }
            catch (error) {
                if (!flags.cancelled) {
                    diagnostic = acpDiagnostic(withOutcome(diagnosticError(error, 'prompt'), outcome));
                }
                throw error;
            }
            finally {
                if (taskTimer !== undefined)
                    clearTimeout(taskTimer);
            }
        },
        collectOutput: failureOutput,
        collectDiagnostic: () => diagnostic,
        cancelled: () => flags.cancelled,
        onError: (error, stopReason) => {
            warn(`[agy-acp] run failed (${stopReason}): ${error.message}`);
            try {
                spec.onError?.(error, stopReason);
            }
            catch { /* host sink must not replace the result */ }
        },
        signal: request.signal,
        onAbort,
    });
    return subprocessRunHandle({
        id: randomUUID(),
        result,
        signal: request.signal,
        onAbort,
        requestCancel: () => {
            if (flags.cancelled)
                return;
            flags.cancelled = true;
            settleCancel();
        },
        teardown,
    });
}
//# sourceMappingURL=run.js.map