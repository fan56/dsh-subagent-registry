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
/** Stable codes, kept as values so `error.code` is readable in tool results. */
export const ACP_CODES = {
    NOT_INSTALLED: 'ACP_NOT_INSTALLED',
    SPAWN_FAILED: 'ACP_SPAWN_FAILED',
    NO_SUBPROCESS: 'ACP_NO_SUBPROCESS',
    BAD_CWD: 'ACP_BAD_CWD',
    BUSY: 'ACP_BUSY',
    AUTH_REQUIRED: 'ACP_AUTH_REQUIRED',
    QUOTA_EXHAUSTED: 'ACP_QUOTA_EXHAUSTED',
    HANDSHAKE_TIMEOUT: 'ACP_HANDSHAKE_TIMEOUT',
    EARLY_EXIT: 'ACP_EARLY_EXIT',
    ABORTED: 'ACP_ABORTED',
    TIMEOUT: 'ACP_TIMEOUT',
    AGENT_ERROR: 'ACP_AGENT_ERROR',
    PROTOCOL: 'ACP_PROTOCOL',
    FOREGROUND_ONLY: 'ACP_FOREGROUND_ONLY',
};
/** Hard host budget for one diagnostic line (`types.ts:278-284`). */
export const ACP_DIAGNOSTIC_MAX_BYTES = 4096;
/** Cap on a remote JSON-RPC message echoed into a diagnostic (v2 §3.3). */
const RPC_MESSAGE_MAX_BYTES = 200;
const textHits = (failure, pattern) => typeof failure.text === 'string' && pattern.test(failure.text);
const AUTH_HINT = /(?:auth(?:entication|orization)?|login|logged in|unauthorized|401|403)/i;
const QUOTA_HINT = /(?:quota|rate[ -]?limit|resource[ -]?exhausted|429)/i;
/**
 * Classification rules in priority order. A new remote shape only needs a row
 * here; the last rule and {@link classifyAcpError}'s fallback keep a common
 * code for everything unrecognised.
 */
export const ACP_CLASSIFICATION_RULES = [
    { code: ACP_CODES.NOT_INSTALLED, match: (f) => f.errno === 'ENOENT' },
    { code: ACP_CODES.SPAWN_FAILED, match: (f) => typeof f.errno === 'string' && f.errno !== '' && f.errno !== 'ENOENT' },
    // -32000 is an auth hint at the handshake; after release the run has a
    // stopReason, so the same code belongs to ACP_AGENT_ERROR instead.
    { code: ACP_CODES.AUTH_REQUIRED, match: (f) => (f.rpcCode === -32000 && f.stopReason === undefined) || textHits(f, AUTH_HINT) },
    { code: ACP_CODES.QUOTA_EXHAUSTED, match: (f) => textHits(f, QUOTA_HINT) },
    { code: ACP_CODES.ABORTED, match: (f) => f.aborted === true },
    { code: ACP_CODES.EARLY_EXIT, match: (f) => f.earlyExit === true },
    { code: ACP_CODES.PROTOCOL, match: (f) => f.protocol === true },
    {
        code: ACP_CODES.AGENT_ERROR,
        match: (f) => typeof f.stopReason === 'string' && f.stopReason !== 'completed' && f.stopReason !== 'aborted',
    },
];
const ACP_COPY = {
    ACP_NOT_INSTALLED: {
        title: 'Command agy not found (not on PATH)',
        nextStep: 'Install agy and confirm "agy --version" runs, then retry.',
    },
    ACP_SPAWN_FAILED: { title: 'Failed to spawn agy', nextStep: 'Check the errno above and retry.' },
    ACP_NO_SUBPROCESS: {
        title: 'The host did not provide the subprocess service',
        nextStep: 'Enable the subprocess service in the host, then retry.',
    },
    ACP_BAD_CWD: {
        title: 'Unusable working directory for agy',
        nextStep: 'Pass an absolute, existing directory and retry.',
    },
    ACP_BUSY: {
        title: 'An agy task is already running',
        nextStep: 'Wait for it to finish and re-dispatch; dsh does not queue.',
    },
    ACP_AUTH_REQUIRED: {
        title: 'agy is not logged in or the login expired',
        nextStep: 'Run "agy" in a terminal to log in, then retry.',
    },
    ACP_QUOTA_EXHAUSTED: {
        title: 'agy quota exhausted or rate-limited',
        nextStep: 'Check the remaining quota and retry after the window resets.',
    },
    ACP_HANDSHAKE_TIMEOUT: {
        title: 'Handshake with agy timed out',
        nextStep: 'If agy is not logged in it may hang here; log in and retry.',
    },
    ACP_EARLY_EXIT: {
        title: 'agy exited before the run finished',
        nextStep: 'Close other agy sessions and retry.',
    },
    ACP_ABORTED: { title: 'agy run aborted', nextStep: 'Re-dispatch when ready.' },
    ACP_TIMEOUT: { title: 'agy task timed out', nextStep: 'Retry with a smaller task.' },
    ACP_AGENT_ERROR: { title: 'agy reported an agent-level error', nextStep: 'See the code above and retry.' },
    ACP_PROTOCOL: {
        title: 'agy ACP messages did not match the expected shape',
        nextStep: 'Check the agy version and retry.',
    },
    ACP_FOREGROUND_ONLY: {
        title: 'agy only supports one-shot foreground dispatch',
        nextStep: 'Do not use background / resume / fresh; re-dispatch the task.',
    },
};
/** A classified failure: stable code, stage, safe fact and actionable copy. */
export class AcpError extends Error {
    code;
    stage;
    fact;
    nextStep;
    /** Flattened/bounded remote JSON-RPC `message` for logs only — never a diagnostic. */
    remoteMessage;
    constructor(code, stage, fact, nextStep, remoteMessage) {
        super(ACP_COPY[code].title);
        this.name = 'AcpError';
        this.code = code;
        this.stage = stage;
        if (fact !== undefined && fact !== '')
            this.fact = fact;
        this.nextStep = nextStep ?? ACP_COPY[code].nextStep;
        if (remoteMessage !== undefined && remoteMessage !== '')
            this.remoteMessage = remoteMessage;
    }
}
/**
 * A pre-release failure whose `fact` is already diagnostic-safe — e.g. an
 * invalid model family chosen by the caller. There is no remote message to
 * hide, so `diagnosticError` keeps the fact verbatim instead of rebuilding it.
 */
export class AcpConfigError extends AcpError {
    constructor(stage, fact) {
        super(ACP_CODES.AGENT_ERROR, stage, fact);
    }
}
/**
 * Truncate to a UTF-8 byte budget without cutting a multi-byte code point, so
 * a long remote message cannot leave a broken sequence in a diagnostic.
 */
export function truncateUtf8(text, maxBytes) {
    let bytes = 0;
    let result = '';
    for (const char of text) {
        const size = Buffer.byteLength(char, 'utf8');
        if (bytes + size > maxBytes)
            break;
        result += char;
        bytes += size;
    }
    return result;
}
/** Safe, non-sensitive fact from a process outcome — never stderr. */
export function acpOutcomeFact(outcome) {
    if (outcome.exitCode !== null)
        return `exit code ${outcome.exitCode}`;
    if (outcome.signal !== null)
        return `signal ${outcome.signal}`;
    return 'process exited without an exit code';
}
/**
 * Map raw signals onto an {@link AcpError}. Rules are tried in table order;
 * an explicit `failure.code` wins; unknown signals fall back to
 * `ACP_AGENT_ERROR` so a new remote shape cannot escape with an untagged error.
 */
export function classifyAcpError(failure, stage = 'process') {
    const matched = failure.code === undefined
        ? ACP_CLASSIFICATION_RULES.find((rule) => rule.match(failure))
        : undefined;
    const code = failure.code ?? matched?.code ?? ACP_CODES.AGENT_ERROR;
    const facts = [];
    if (failure.errno !== undefined && failure.errno !== '')
        facts.push(`errno ${failure.errno}`);
    if (failure.rpcCode !== undefined)
        facts.push(`jsonrpc code ${failure.rpcCode}`);
    // Only the `message` field is ever kept, flattened and bounded — never `data`.
    // For non-AGENT_ERROR codes it is log-only: it stays off the fact (and so off
    // every diagnostic) but the handshake catch can still warn with it.
    const remoteMessage = failure.rpcMessage === undefined
        ? undefined
        : truncateUtf8(failure.rpcMessage.replace(/[\r\n\t]+/g, ' '), RPC_MESSAGE_MAX_BYTES);
    if (code === ACP_CODES.AGENT_ERROR && remoteMessage !== undefined && remoteMessage !== '') {
        facts.push(`message: ${remoteMessage}`);
    }
    return new AcpError(code, stage, facts.join('; '), undefined, remoteMessage);
}
/** Pre-release exit: the full text becomes the `use_agent` error. */
export function acpErrorText(error) {
    const parts = [`[${error.code}] ${error.message}`, '(agent "agy", external ACP "agy acp")'];
    if (error.fact !== undefined)
        parts.push(error.fact);
    parts.push(`stage: ${error.stage}`, `Next: ${error.nextStep}`);
    return parts.join(' · ');
}
/**
 * Post-release exit: one diagnostic line in the settle-branch format. The
 * fact is bounded before assembly so a long remote message cannot push the
 * stable code, stage or next-step hint out of the line.
 */
export function acpDiagnostic(error) {
    const joiner = ' · ';
    const head = `[${error.code}] ${error.message} · stage: ${error.stage}`;
    const tail = `下一步: ${error.nextStep}`;
    if (error.fact === undefined)
        return truncateUtf8(head + joiner + tail, ACP_DIAGNOSTIC_MAX_BYTES);
    const overhead = Buffer.byteLength(head + tail, 'utf8') + Buffer.byteLength(joiner, 'utf8') * 2;
    const budget = Math.max(0, ACP_DIAGNOSTIC_MAX_BYTES - overhead);
    return head + joiner + truncateUtf8(error.fact, budget) + joiner + tail;
}
//# sourceMappingURL=errors.js.map