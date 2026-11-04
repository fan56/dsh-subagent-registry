/**
 * The `store` binding namespace — session-scoped, branch-aware key/value
 * state for codemode programs (decision #10).
 *
 * Programs see one global object `store` with two async functions:
 *
 * - `await store.store(key, value)` — append one write event to the live
 *   session log and resolve `{ ok: true, bytes }`. Over quota (256KB per
 *   value / 1MB per branch state) it resolves a structured
 *   `{ ok: false, error, message }` instead — the quotas exist because this
 *   state rides the durable session log, and the message says so.
 * - `await store.load(key)` — rebuild the current branch's state by
 *   replaying the session's event log and resolve `{ found: true, value }` /
 *   `{ found: false }`. Last write per key wins.
 *
 * Branch semantics fall out of dsh's event-sourced session model: writes are
 * ordinary session events, and a branch's log IS its path — a fork child
 * opens with its parent's prefix (pre-fork writes visible), the parent's
 * later writes never enter it, and a resumed session replays its full stored
 * log. No workspace-persistent storage domain is involved — see
 * docs/adr/0002-session-scoped-store.md.
 *
 * The event type is a plugin-owned `SessionEventMap` extension (the
 * appendable-keys interface is merge-extensible by plugins by contract), so
 * the write is a first-class durable session event, not a side file.
 *
 * Neither function ever rejects into the program: an absent session
 * (agent-less execution) is a structured `{ error: 'no-session' }` result.
 *
 * Host-API note: the design brief's `sessionManager.appendEntry` /
 * `getBranch` names do not exist in the 0.2.0-rc.2 host — the type-verified
 * equivalents are `Session.append(type, data)` for writes and the log itself
 * (`snapshotEvents()`) for the branch replay.
 *
 * @module bindings/store
 */
/** The program-visible global name of this namespace. */
export const STORE_GLOBAL = 'store';
/** The plugin-owned session-log event type backing one write. */
export const STORE_EVENT_TYPE = 'ptc-subagent/store-write';
/** Quota per stored value (JSON serialization length), pi-parity. */
export const STORE_VALUE_LIMIT_BYTES = 256 * 1024;
/** Quota over the whole branch state (sum of live values), pi-parity. */
export const STORE_TOTAL_LIMIT_BYTES = 1024 * 1024;
/** Max key length — keys are log metadata, not a second payload channel. */
export const STORE_KEY_LIMIT_CHARS = 256;
/**
 * The events one branch replay considers: the session's FULL log (inherited
 * prefix included). Branch semantics fall out of the log itself: a fork
 * child's log opens with its parent's prefix — pre-fork writes are on the
 * child's path — while the parent's post-fork writes never enter it, and a
 * resumed session replays its stored log with the fork cut intact.
 */
export function branchEvents(session) {
    return session.snapshotEvents();
}
/** Rebuild one branch's key → value map (last write per key wins). */
export function replayStore(events) {
    const state = new Map();
    for (const event of events) {
        if (event.type !== STORE_EVENT_TYPE)
            continue;
        const data = event.data;
        if (typeof data.key !== 'string')
            continue;
        state.set(data.key, data.value);
    }
    return state;
}
/** Serialized size of one value — the quota's unit (JSON length). */
export function valueBytes(value) {
    return JSON.stringify(value ?? null).length;
}
/** Validate one key; a string is the failure reason (a type guard, so the
 *  call site keeps the narrowed key). */
export function validateKey(key) {
    return typeof key === 'string' && key !== '' && key.length <= STORE_KEY_LIMIT_CHARS;
}
/** Total bytes of one branch state. */
export function stateBytes(state) {
    let total = 0;
    for (const value of state.values())
        total += valueBytes(value);
    return total;
}
/**
 * Build the `store` namespace for one codemode run. The session handle comes
 * from the executing call's agent (`exec.agent?.session`); agent-less
 * executions get structured `no-session` results.
 */
export function createStoreBinding(session, collector) {
    function requireSession() {
        if (session === undefined)
            return 'store: no live session is attached to this execution';
        return session;
    }
    const functions = {
        async store(args) {
            const resolved = requireSession();
            if (typeof resolved === 'string') {
                return { ok: false, error: 'no-session', message: resolved };
            }
            if (typeof args !== 'object' || args === null) {
                return { ok: false, error: 'invalid-value', message: 'store expects { key, value }' };
            }
            const { key, value } = args;
            if (!validateKey(key)) {
                return { ok: false, error: 'invalid-key', message: `store: key must be a non-empty string of at most ${STORE_KEY_LIMIT_CHARS} chars` };
            }
            const bytes = valueBytes(value);
            if (bytes > STORE_VALUE_LIMIT_BYTES) {
                return {
                    ok: false,
                    error: 'quota-exceeded',
                    message: `store: value is ${bytes} bytes, over the ${STORE_VALUE_LIMIT_BYTES}-byte per-value quota — store rides the durable session log, so large payloads belong in files (write via run_code host tools), not in store`,
                };
            }
            const state = replayStore(branchEvents(resolved));
            const previous = state.has(key) ? valueBytes(state.get(key)) : 0;
            if (stateBytes(state) - previous + bytes > STORE_TOTAL_LIMIT_BYTES) {
                return {
                    ok: false,
                    error: 'quota-exceeded',
                    message: `store: this branch's state is at the ${STORE_TOTAL_LIMIT_BYTES}-byte total quota — drop old keys or move bulk data into files; the quota exists because store rides the durable session log`,
                };
            }
            resolved.append(STORE_EVENT_TYPE, { key, value: (value ?? null) });
            collector.storeWrites += 1;
            return { ok: true, bytes };
        },
        async load(args) {
            const resolved = requireSession();
            if (typeof resolved === 'string')
                return { error: 'no-session', message: resolved };
            if (typeof args !== 'object' || args === null) {
                return { error: 'invalid-key', message: 'load expects { key }' };
            }
            const key = args.key;
            if (!validateKey(key)) {
                return { error: 'invalid-key', message: `load: key must be a non-empty string of at most ${STORE_KEY_LIMIT_CHARS} chars` };
            }
            const state = replayStore(branchEvents(resolved));
            if (!state.has(key))
                return { found: false };
            return { found: true, value: state.get(key) };
        },
    };
    return {
        global: STORE_GLOBAL,
        functions,
    };
}
//# sourceMappingURL=store.js.map