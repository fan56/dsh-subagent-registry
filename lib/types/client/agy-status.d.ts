/**
 * Pure reduction of the host's external subagent catalog plus the parent
 * Session's durable settlement notices into the agy panel's rows.
 *
 * No Remote calls and no host types live here: the client adapter supplies
 * plain rows and parsed notices, so this file is directly unit-testable.
 */
/** The four terminal states plus the live/stale-inference bucket. */
export type AgyOutcome = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
/** One `subagentCatalog` projection row, narrowed to external members. */
export interface AgyCatalogRow {
    readonly id: string;
    readonly createdAt: number;
    readonly mode: 'external';
    readonly label?: string;
    readonly name?: string;
}
/** A `subagent-settled` notice attributed to one catalog id. */
export interface AgySettlement {
    readonly senderSessionId: string;
    readonly stopReason?: string;
}
/** One rendered row; `label` is always a non-empty display name. */
export interface AgyStatusRow {
    readonly id: string;
    readonly label: string;
    readonly name?: string;
    readonly createdAt: number;
    readonly outcome: AgyOutcome;
}
/** Matches the plugin's volatile `agyTimeoutMs` default (10 minutes). */
export declare const DEFAULT_AGY_TIMEOUT_MS = 600000;
/** Grace after the agy deadline before a silent row becomes "unknown". */
export declare const AGY_STALE_GRACE_MS = 60000;
/** Keep the panel bounded; the catalog itself is append-only. */
export declare const AGY_MAX_ROWS = 20;
/** Same stopReason triad the TUI panel uses (T25/externalStopOutcome). */
export declare function outcomeOf(stopReason: string | undefined): 'completed' | 'failed' | 'cancelled';
/**
 * Parse the payload of one `user/message` event. The host's settlement notice
 * is a durable user message whose `source.kind` is `subagent-settled`; only
 * notices carrying a sender id can be reconciled with a catalog row.
 */
export declare function parseSettlement(eventData: unknown): AgySettlement | undefined;
/**
 * Fold catalog discoveries and settlements into at most `AGY_MAX_ROWS` rows.
 * Rows are de-duplicated by id (newest `createdAt` wins), sorted newest first.
 * A settlement always wins over the timeout fallback; without one a row stays
 * "running" until `createdAt + timeoutMs + AGY_STALE_GRACE_MS`, then "unknown".
 */
export declare function reduceAgyStatus(catalog: readonly AgyCatalogRow[], settlements: readonly AgySettlement[], now: number, timeoutMs?: number): AgyStatusRow[];
