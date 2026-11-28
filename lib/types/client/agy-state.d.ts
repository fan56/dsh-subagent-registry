/** Controller behind the agy panel: reads the host projection face, folds it, and owns stop feedback. */
import type { Language } from '../preset-contract.ts';
import { type AgyCatalogRow, type AgySettlement, type AgyStatusRow } from './agy-status.ts';
export interface AgySnapshot {
    status: 'idle' | 'loading' | 'ready' | 'error';
    rows: readonly AgyStatusRow[];
    language: Language;
    /** Visible result of the last stop attempt; failures are never silent. */
    notice?: string;
    error?: string;
    busy: Readonly<Record<string, boolean>>;
}
/** The narrow host face the panel needs; index.ts adapts ctx onto it. */
export interface AgyClient {
    /** Main-view Session id: the row retained under the `mainView` source. */
    currentSessionId(): string | undefined;
    /** External catalog rows in that Session's projection. */
    catalog(sessionId: string): readonly AgyCatalogRow[];
    /** Durable `subagent-settled` notices in the parent Session history. */
    settlements(sessionId: string): Promise<readonly AgySettlement[]>;
    /** Re-read the Host-authoritative projections. */
    refresh(sessionId: string): Promise<void>;
    /** The Remote stop path; failures come back as a visible message. */
    interrupt(id: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Incremental projection/list changes. */
    subscribe(listener: () => void): () => void;
}
/** One instance per plugin activation; React mount/unmount only starts and stops polling. */
export declare class AgyController {
    private snapshot;
    private readonly listeners;
    private disposed;
    private active;
    private loading?;
    private poll?;
    private unsubscribe?;
    private readonly client;
    constructor(client: AgyClient, language?: Language);
    getSnapshot: () => AgySnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Mount: one full refresh, then incremental + short polling fallback. */
    open(): void;
    /** Unmount: keep the controller (and any in-flight stop) but stop background reads. */
    close(): void;
    dispose(): void;
    refresh(): void;
    load(withRefresh: boolean): Promise<void>;
    /** Remote interrupt with explicit success/failure text; never a silent no-op. */
    stop(id: string): Promise<void>;
}
