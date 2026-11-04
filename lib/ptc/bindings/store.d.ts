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
import type { Session } from '@deepseek-ai/dsh-session';
import type { PtcBindingNamespace, PtcJsonValue } from '@deepseek-ai/dsh-ptc-runtime';
/** The program-visible global name of this namespace. */
export declare const STORE_GLOBAL = "store";
/** The plugin-owned session-log event type backing one write. */
export declare const STORE_EVENT_TYPE = "ptc-subagent/store-write";
/** Quota per stored value (JSON serialization length), pi-parity. */
export declare const STORE_VALUE_LIMIT_BYTES: number;
/** Quota over the whole branch state (sum of live values), pi-parity. */
export declare const STORE_TOTAL_LIMIT_BYTES: number;
/** Max key length — keys are log metadata, not a second payload channel. */
export declare const STORE_KEY_LIMIT_CHARS = 256;
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'ptc-subagent/store-write': {
            key: string;
            value: PtcJsonValue;
        };
    }
}
/**
 * The events one branch replay considers: the session's FULL log (inherited
 * prefix included). Branch semantics fall out of the log itself: a fork
 * child's log opens with its parent's prefix — pre-fork writes are on the
 * child's path — while the parent's post-fork writes never enter it, and a
 * resumed session replays its stored log with the fork cut intact.
 */
export declare function branchEvents(session: Session): readonly {
    type: string;
    data: unknown;
}[];
/** Rebuild one branch's key → value map (last write per key wins). */
export declare function replayStore(events: readonly {
    type: string;
    data: unknown;
}[]): Map<string, PtcJsonValue>;
/** Serialized size of one value — the quota's unit (JSON length). */
export declare function valueBytes(value: PtcJsonValue): number;
/** Validate one key; a string is the failure reason (a type guard, so the
 *  call site keeps the narrowed key). */
export declare function validateKey(key: unknown): key is string;
/** Total bytes of one branch state. */
export declare function stateBytes(state: ReadonlyMap<string, PtcJsonValue>): number;
export interface StoreCollector {
    /** Count of accepted writes in this run (the codemode result reports it). */
    storeWrites: number;
}
/** The structured failure shapes (never thrown into the program). */
export type StoreWriteResult = {
    ok: true;
    bytes: number;
} | {
    ok: false;
    error: 'no-session' | 'invalid-key' | 'invalid-value' | 'quota-exceeded';
    message: string;
};
export type StoreLoadResult = {
    found: true;
    value: PtcJsonValue;
} | {
    found: false;
} | {
    error: 'no-session' | 'invalid-key';
    message: string;
};
/**
 * Build the `store` namespace for one codemode run. The session handle comes
 * from the executing call's agent (`exec.agent?.session`); agent-less
 * executions get structured `no-session` results.
 */
export declare function createStoreBinding(session: Session | undefined, collector: StoreCollector): PtcBindingNamespace;
