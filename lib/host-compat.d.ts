/** Public host seams used only when managed activations are absent — plus the out-of-band child composition for activation hosts. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentResult, SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import type { ToolRestriction } from '@deepseek-ai/dsh-tools';
export interface LegacyRun {
    readonly id: SessionId;
    readonly localAgent: Agent | undefined;
    readonly result: Promise<SubagentResult>;
    dispose(): Promise<void>;
}
interface LegacyDescendant {
    readonly kind: 'child' | 'diagnostic';
    readonly id: SessionId;
    readonly parentId: SessionId;
    readonly mode?: 'one-shot' | 'continuable';
    readonly reason?: string;
}
/** The old service remains the receiver of every legacy method. */
export interface LegacySubagents {
    start(provider: string, request: SubagentStartRequest & ChildComposition): Promise<LegacyRun>;
    startContinuable(spec: {
        provider: string;
        label: string;
        request: Omit<SubagentStartRequest, 'label' | 'signal'> & ChildComposition;
        signal: AbortSignal;
    }): Promise<{
        childId: SessionId;
    }>;
    listDescendants(id: SessionId, signal?: AbortSignal): Promise<readonly LegacyDescendant[]>;
    drainContinuableDescendants(parents: readonly Agent[]): Promise<void>;
    /** The pre-rc.2 child catalog read (removed from the rc.2 runtime). */
    listChildren?(parentSessionId: SessionId, signal?: AbortSignal): Promise<readonly DirectChildEntry[]>;
    /** The pre-rc.2 descendant join (replaced by waitForTreeWork on rc.2). */
    waitForChildren?(parent: Agent): Promise<boolean>;
}
export declare const legacySubagents: (ctx: Context) => LegacySubagents;
/** Whether the host's subagents service speaks the 0.2.2-rc.2 child surface. */
export declare function rc2ChildSurface(ctx: Context): boolean;
/** Structural minimum of a direct-child catalog row the pickers read. */
export interface DirectChildEntry {
    readonly id: unknown;
    readonly mode?: 'one-shot' | 'continuable' | 'external' | 'unknown';
    readonly label?: string;
}
/**
 * Read the parent's durable direct-child catalog in catalog event order.
 * Pre-rc.2 hosts answer through `SubagentRuntime.listChildren`; rc.2 hosts
 * through `listDescendants(parentId)` cut to the depth-1 rows (every row
 * carries its `depth`; the pre-order keeps the parent catalog's order).
 */
export declare function listDirectChildren(ctx: Context, parentId: SessionId, signal?: AbortSignal): Promise<DirectChildEntry[]>;
/**
 * Join progressing descendant work below `parent` without cancelling it.
 * rc.2 hosts join through `waitForTreeWork`; pre-rc.2 lines through
 * `waitForChildren`. Resolves `false` when the host exposes neither (the
 * caller falls back to {@link createLegacyDescendantJoin}).
 */
export declare function waitForChildWork(ctx: Context, parent: Agent): Promise<boolean>;
/** Whether {@link waitForChildWork} has a native join to ride on this host. */
export declare function hasNativeChildWorkJoin(ctx: Context): boolean;
/** A fresh custom-agent child's persona and optional leaf tool scoping. */
export interface ChildComposition {
    readonly persona: string;
    readonly toolFilter?: ToolRestriction;
}
/** The start-request shape this plugin dispatches: the host fields plus the inline composition the 0.2.0 line reads. */
export type DispatchRequest = Omit<SubagentStartRequest, 'label' | 'signal'> & ChildComposition;
/**
 * Park the composition a fresh activation-host dispatch installs on its child
 * at the start edge. The entry lives until the delegating parent session is
 * disposed: an activation-model child materializes a fresh agent scope per
 * run, so the composition must survive every per-run settlement and stay
 * available for each later wake.
 */
export declare function reserveChildComposition(childId: SessionId, parentId: SessionId, composition: ChildComposition): void;
/** Drop a reserved composition whose dispatch failed before the start edge. */
export declare function releaseChildComposition(childId: SessionId): void;
/**
 * Install this plugin's reserved child compositions on activation hosts.
 * Returns a no-op disposer on legacy hosts (the 0.2.0 line keeps the inline
 * request fields, so nothing is parked and no start edge can match a reserved
 * id). The activation model materializes a fresh agent scope for every run of
 * a parked child — first dispatch, each follow-up wake, each manager-driven
 * resume — and agent-scoped contributions unwind with that scope, so the
 * listener re-installs the composition at every start edge of a reserved
 * child (mirroring the host's own per-materialization composition) and prunes
 * the reservation when the delegating parent session is disposed.
 */
export declare function installChildCompositionListener(ctx: Context): () => void;
/** Drain exactly this forest, preserving the service receiver on both hosts. */
export declare function drainRunDescendants(ctx: Context, root: Agent): Promise<void>;
/** Install before driving the root; lifecycle edges also cover uncataloged external runs. */
export declare function createLegacyDescendantJoin(ctx: Context, signal: AbortSignal): {
    wait(root: Agent): Promise<void>;
    dispose(): void;
};
export {};
