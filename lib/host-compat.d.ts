/** Public rc.2 seams used only when managed activations are absent. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentResult, SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
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
    start(provider: string, request: SubagentStartRequest): Promise<LegacyRun>;
    startContinuable(spec: {
        provider: string;
        label: string;
        request: Omit<SubagentStartRequest, 'label' | 'signal'>;
        signal: AbortSignal;
    }): Promise<{
        childId: SessionId;
    }>;
    listDescendants(id: SessionId, signal?: AbortSignal): Promise<readonly LegacyDescendant[]>;
    drainContinuableDescendants(parents: readonly Agent[]): Promise<void>;
}
export declare const legacySubagents: (ctx: Context) => LegacySubagents;
/** Drain exactly this forest, preserving the service receiver on both hosts. */
export declare function drainRunDescendants(ctx: Context, root: Agent): Promise<void>;
/** Install before driving the root; lifecycle edges also cover uncataloged external runs. */
export declare function createLegacyDescendantJoin(ctx: Context, signal: AbortSignal): {
    wait(root: Agent): Promise<void>;
    dispose(): void;
};
export {};
