/**
 * Interactive subagents: continuable (background) dispatch and follow-up
 * messaging for this plugin's custom agents.
 *
 * Since dsh v0.1.2-alpha.4 a parent agent and its continuable children
 * exchange follow-up messages in both directions (`ctx.subagents.sendMessage`,
 * surfaced to models as the base `send_message` tool), and the continuation
 * manager keeps every continuable child's session durable across residency
 * epochs — a finished child goes cold and is transparently cold-resumed by
 * the next delivery. This module adapts that machinery to the agents this
 * plugin dispatches, which the stock runtime only offers one-shot:
 *
 * - `use_agent` gains a `background` switch (tool parameter, with the agent
 *   file's `background` frontmatter as the default): the child is started
 *   through `ctx.subagents.startContinuable()` on the same `spawn` provider,
 *   the call returns the durable subagent id immediately, and the parent
 *   keeps working while the child runs. `ask_agent` and `send_message` then
 *   address it, and the runtime's settlement notice reports how it ended.
 * - a new `ask_agent` tool closes the loop the base tooling leaves open:
 *   `send_message` only confirms delivery, while `ask_agent` waits for the
 *   child's next turn to end and returns its reply text as the tool result —
 *   a synchronous parent↔child round trip. Reply observation uses the
 *   alpha.4 on-demand session reads (`seq`, `snapshotEvents(fromSeq)`)
 *   against the live session, falling back to persistence for a child that
 *   settled and left the registry mid-wait.
 *
 * @module dsh-subagent-registry/interactive
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { type ChildListEntry, type MinimalSessionEvent } from './resume.ts';
/**
 * Resolve the dispatch mode for one `use_agent` call: an explicit tool
 * parameter wins, the agent file's `background` frontmatter is the default,
 * and absence of both means the foreground one-shot behavior.
 */
export declare function decideBackgroundMode(explicit: boolean | undefined, frontmatter: boolean | undefined): boolean;
/**
 * Pick the newest listable continuable child whose label matches one of
 * `labels`. `listChildren` orders entries by header `createdAt`, so the LAST
 * match wins. Both a resident (running) and a cold (inactive) continuable
 * child qualify — delivery steers the former and cold-resumes the latter.
 * One-shot children never qualify: their sessions have no continuation state
 * (`sendMessage` rejects them with `NOT_RESUMABLE`).
 */
export declare function pickLatestContinuableChild<T extends ChildListEntry>(entries: readonly T[], labels: readonly string[]): T | undefined;
/** Structural minimum of the live-session surface the wait loop reads. */
export interface LiveSessionLike {
    /** The log offset (event count) the session has appended through. */
    readonly seq: number;
    /** On-demand events read from `fromSeq` (inclusive) to the end. */
    snapshotEvents(fromSeq?: number): readonly MinimalSessionEvent[];
}
/**
 * Read the deployment's live session store without a hard dependency: the
 * standard dsh session service is registered as `sessions`, but a bare
 * context (tests, exotic deployments) may omit it.
 */
export declare function getLiveSession(ctx: Context, childId: SessionId): LiveSessionLike | undefined;
/**
 * The event offset a follow-up reply must exceed: the child's current log
 * end, read live when resident and from persistence when cold. `undefined`
 * means the offset is unknowable (no live session, no persistence) and the
 * caller should deliver without waiting.
 */
export declare function childEventBoundary(ctx: Context, childId: SessionId, signal?: AbortSignal): Promise<number | undefined>;
/** The child's reply to one follow-up: final output plus the turn's stop reason. */
export interface ChildReply {
    readonly output: ContentBlock[];
    readonly stopReason: string;
}
/**
 * Wait for the child's next accounting turn after `boundary` and return its
 * outcome. A steer into a running turn and a fresh turn on a resumed child
 * both end with exactly one accounting `turn/end`, whose final assistant
 * output is the reply. Polls the on-demand session reads (no event
 * subscription exists at this seam) and returns `undefined` when `timeoutMs`
 * elapses first; caller cancellation propagates.
 */
export declare function waitForChildReply(input: {
    ctx: Context;
    childId: SessionId;
    boundary: number;
    signal: AbortSignal;
    /** Give up after this many ms and return undefined; absent = wait unbounded. */
    timeoutMs?: number;
    /** Poll cadence in ms (tests lower it); default 300. */
    pollMs?: number;
}): Promise<ChildReply | undefined>;
/** Config of the follow-up tool (a subset of the plugin Config schema). */
export interface AskAgentConfig {
    agentsDir: string;
    toolName: string;
    /** The `use_agent` tool name, referenced in guidance text. */
    dispatchToolName?: string;
    /** Poll cadence override (ms) for tests. */
    pollMs?: number;
}
/**
 * The cordis `ctx.tools.register`-ready definition for the `ask_agent` tool.
 * Read-only over the agent roster (for name → label resolution) and the
 * subagent service; it never spawns.
 */
export declare function askAgentTool(ctx: Context, cfg: AskAgentConfig): import("@deepseek-ai/dsh-tools").ToolDefinition;
