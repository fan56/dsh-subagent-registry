/**
 * Resume support for the `use_agent` tool: recall the parent session's latest
 * failed one-shot run of the same agent and continue it from its persisted
 * partial log instead of restarting the task from scratch.
 *
 * dsh already persists every in-process subagent child as a full session
 * (failed and crash-interrupted runs included), and
 * `ctx.subagents.listChildren()` enumerates those durable children with their
 * creation label. What the stock runtime deliberately does not offer is
 * continuing a settled one-shot child: the continuation machinery gates cold
 * resume on the `continuable` descriptor mode. This module closes that gap
 * for the agents this plugin dispatches: pick the newest inactive one-shot
 * child of the calling parent whose label matches the requested agent, check
 * its last turn outcome, and — unless it completed — resume the session
 * (`ctx.agents.resume()`) with the same persona/model/tool composition and
 * drive exactly one continuation turn, mirroring the in-process one-shot
 * driver's settle semantics.
 *
 * @module dsh-subagent-registry/resume
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ToolRestriction } from '@deepseek-ai/dsh-tools';
import { type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
/**
 * Durable attribution for the continuation notice this plugin injects into a
 * resumed child (`child.followup`). 0.1.7 removed the shared catch-all
 * `plugin` source kind — every producer declares its OWN kind through the
 * merge-extensible `MessageSourceMap` (the same move the official
 * `agent-message`/`subagent-settled` sources and the dsh-feishu/dsh-dcp
 * adapters make); consumers that switch on `kind` fall through unknown
 * values by contract. The notice keeps the official `form: 'notice'`
 * context shape (bounded one-line `summary`, ≤120 chars).
 */
export interface RegistryNoticeMessageSource {
    readonly kind: 'dsh-subagent-registry';
    /** A one-off account of something that just happened (`notice` context form). */
    readonly form: 'notice';
    /** One-line account of what this plugin did, ellipsized to the bound. */
    readonly summary: string;
}
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'dsh-subagent-registry': RegistryNoticeMessageSource;
    }
}
/** Structural minimum of a persisted session event the classification reads. */
export interface MinimalSessionEvent {
    readonly type: string;
    readonly data?: unknown;
}
/** Map a `turn/end` reason kind to the subagent seam's stop vocabulary. */
export declare function toStopReason(kind: string | undefined): SubagentStopReason;
/** Human phrase for how a prior run's last turn ended. */
export declare function describeTurnEnd(kind: string | undefined): string;
/** The last `turn/end` event, or undefined when the log records none. */
export declare function lastTurnEnd(events: readonly MinimalSessionEvent[]): MinimalSessionEvent | undefined;
/**
 * The log's accounting `turn/end` — the last closed turn that actually did
 * work — folded exactly the way the one-shot driver reads a child's outcome
 * (`foldConsumedWork`). Reading the raw last `turn/end` instead would let a
 * trailing no-op turn (a rejected or rewritten-away step) mask the real
 * ending.
 */
export declare function accountingTurnEnd(events: readonly MinimalSessionEvent[]): MinimalSessionEvent | undefined;
/** Outcome classification of one prior run's persisted event log. */
export interface PriorRunClassification {
    readonly status: 'resumable' | 'completed';
    /** How the last accounting turn ended (an interrupted log still gets a phrase). */
    readonly endedAs: string;
    /** How many `turn/end` events the log records. */
    readonly turnCount: number;
}
/**
 * Classify a prior run from its persisted events: a run is resumable unless
 * its last ACCOUNTING turn ended `completed` — a mid-log failure followed by a
 * later success means the run as a whole finished, and a trailing no-op turn
 * must not mask the real ending. A log with no accounting turn at all (crash
 * before any turn closed over work) counts as interrupted.
 */
export declare function classifyPriorRun(events: readonly MinimalSessionEvent[]): PriorRunClassification;
/**
 * Structural minimum of a `listChildren` entry the pickers read. 0.1.7
 * reshaped the read: `listChildren` returns `SubagentCatalogEntry[]` — the
 * durable direct-child catalog rows `{ id, createdAt, mode, label? }` — so
 * the old `SubagentListEntry` fields are gone: every row IS a child (no
 * `kind` discriminator), and liveness is no longer carried (`activity` was
 * dropped; the catalog holds durable parent facts only, and `mode: 'unknown'`
 * marks a row whose descriptor could not be folded). Liveness for the
 * one-shot picker is instead resolved against the live agent registry — see
 * {@link findResumableRun}.
 */
export interface ChildListEntry {
    readonly id: unknown;
    readonly mode?: 'one-shot' | 'continuable' | 'unknown';
    readonly label?: string;
}
/**
 * Pick the newest listable prior child for one agent label. `listChildren`
 * returns entries ordered by header `createdAt`, so the LAST match wins.
 * Only one-shot children are eligible: continuable children keep their own
 * `send_message` cold-resume path, and an `unknown`-mode row (descriptor
 * never folded) is not provably a one-shot run. Liveness is filtered by the
 * caller ({@link findResumableRun}): a live child cannot be resumed (its
 * session id is taken).
 */
export declare function pickLatestLabeledChild<T extends ChildListEntry>(entries: readonly T[], label: string): T | undefined;
/** When `use_agent` should continue a prior interrupted run. */
export type ResumeMode = 'auto' | 'opt-in' | 'off';
/** What one `use_agent` call decided to do about a prior interrupted run. */
export type ResumeDecision = 'resume' | 'fresh' | 'explicit-resume-unavailable';
/**
 * Decide resume vs fresh. `explicitFresh` always wins; `off` disables resume
 * entirely; `explicitResume` demands a candidate and fails loudly without
 * one; plain `auto` resumes whenever a candidate exists, `opt-in` only when
 * asked.
 */
export declare function decideResume(mode: ResumeMode, options: {
    explicitResume?: boolean;
    explicitFresh?: boolean;
    hasCandidate: boolean;
}): ResumeDecision;
/**
 * The single follow-up message that continues a resumed child. The child's
 * context already holds the original task and its own partial work; the
 * prompt only has to point the model at that and forbid redoing finished
 * steps. When the new `use_agent` call carried a task text, it is appended so
 * the child can reconcile a reworded (or revised) request against the
 * original task itself.
 */
export declare function buildContinuationPrompt(endedAs: string, callerPrompt?: string): string;
/**
 * The `sessionPersistence` surface this module reads (registered by the
 * deployment profile). 0.1.5 replaced the whole-log `inspect` read with
 * per-handle reads: `open(id, 'read')` never takes write ownership and works
 * while another process drives the session.
 */
export interface PersistenceLike {
    open(id: SessionId, access: 'read' | 'write', options?: {
        signal?: AbortSignal;
    }): Promise<{
        read(offset?: number, length?: number, options?: {
            signal?: AbortSignal;
        }): Promise<{
            events: readonly MinimalSessionEvent[];
        }>;
        close(): Promise<void>;
    }>;
}
/**
 * Fetch the deployment's session persistence, or undefined in a bare context.
 * Read through an untyped `get` so this plugin never hard-depends on the
 * service being mounted.
 */
export declare function getPersistence(ctx: Context): PersistenceLike | undefined;
/**
 * Read stored events through a read handle — the whole log by default, the
 * suffix from `offset` when given. Returns undefined when the log is
 * unreadable (persistence absent, session missing, decode failure); every
 * failure stays contained for the callers' fail-open contracts. The handle
 * is always closed.
 */
export declare function readStoredEvents(ctx: Context, id: SessionId, options?: {
    offset?: number;
    signal?: AbortSignal;
}): Promise<readonly MinimalSessionEvent[] | undefined>;
/** A prior run selected for continuation. */
export interface ResumableRun {
    readonly childId: SessionId;
    readonly classification: PriorRunClassification;
}
/**
 * Find the parent's latest resumable prior run of one agent label. Fail-open
 * by design: any lookup error (projection registry absent, persistence
 * missing, unreadable log) degrades to "no candidate" and the caller starts
 * fresh — resume must never block a dispatch.
 *
 * Liveness filter: the 0.1.7 catalog no longer carries an `activity` flag, so
 * a picked one-shot child still resident in the live agent registry is
 * skipped — a live child cannot be resumed (its session id is taken), exactly
 * what the pre-0.1.7 `activity: 'inactive'` prefilter expressed.
 */
export declare function findResumableRun(ctx: Context, parent: Pick<Agent, 'id'>, label: string, signal?: AbortSignal): Promise<ResumableRun | undefined>;
/** Inputs of the resume driver. */
export interface ResumeDriveInput {
    /** Plugin context; used for `ctx.agents.resume`. */
    readonly ctx: Context;
    /** The delegating parent (composition and depth source). */
    readonly parent: Agent;
    /** The persisted child session to continue. */
    readonly childId: SessionId;
    /** Agent-file body, re-applied as the shadowing persona section. */
    readonly persona: string;
    /** Leaf tool scoping re-applied on resume, when the agent is `deep: 0`. */
    readonly toolFilter?: ToolRestriction;
    /** Frontmatter model route overrides, as for a fresh dispatch. */
    readonly agentOptions?: AgentOptions;
    /** The continuation follow-up text. */
    readonly continuationPrompt: string;
    /** One-line account for the injected message's notice source. */
    readonly noticeSummary: string;
    /** Caller cancellation, observed for the whole drive. */
    readonly signal: AbortSignal;
}
/** Terminal outcome of one resumed continuation turn. */
export interface ResumedRunResult {
    readonly output: readonly ContentBlock[];
    readonly stopReason: SubagentStopReason;
}
/**
 * Resume one persisted one-shot child and drive exactly one continuation
 * turn, then dispose. Mirrors the in-process one-shot driver
 * (`drivePublishedRun`): signal handoff via `child.cancel`, result read from
 * the session events appended after the resume boundary, and settle-before-
 * dispose so a disposal failure never masks the run outcome (and vice versa).
 */
export declare function driveResumedRun(input: ResumeDriveInput): Promise<ResumedRunResult>;
