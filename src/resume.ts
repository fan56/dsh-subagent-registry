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

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { foldConsumedWork } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
import {
  applyChildComposition,
  finalAssistantOutput,
  resolveChildAgentOptions,
  resolveChildDepth,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'

// ---------------------------------------------------------------------------
// Pure classification helpers (unit-testable without a cordis context)
// ---------------------------------------------------------------------------

/** Structural minimum of a persisted session event the classification reads. */
export interface MinimalSessionEvent {
  readonly type: string
  readonly data?: unknown
}

/** Map a `turn/end` reason kind to the subagent seam's stop vocabulary. */
export function toStopReason(kind: string | undefined): SubagentStopReason {
  switch (kind) {
    case 'completed': return 'completed'
    case 'max-tokens': return 'max-tokens'
    case 'aborted': return 'aborted'
    case 'blocked': return 'refusal'
    default: return 'error'
  }
}

/** The `turn/end` reason kind of one event, when it is one. */
function turnEndKind(event: MinimalSessionEvent | undefined): string | undefined {
  const reason = (event?.data as { reason?: { kind?: unknown } } | undefined)?.reason
  return typeof reason?.kind === 'string' ? reason.kind : undefined
}

/** Human phrase for how a prior run's last turn ended. */
export function describeTurnEnd(kind: string | undefined): string {
  switch (kind) {
    case 'completed': return 'the model finished its turn normally'
    case 'aborted': return 'the run was cancelled before it could finish'
    case 'blocked': return 'the model declined to continue'
    case 'error': return 'the turn failed with an error'
    case 'max-tokens': return 'the turn hit its output-token limit before finishing'
    case 'interrupted': return 'the host process died mid-turn (crash-interrupted)'
    default: return 'the log ends with no recorded turn result (interrupted)'
  }
}

/** The last `turn/end` event, or undefined when the log records none. */
export function lastTurnEnd(events: readonly MinimalSessionEvent[]): MinimalSessionEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'turn/end') return events[i]
  }
  return undefined
}

/**
 * The log's accounting `turn/end` — the last closed turn that actually did
 * work — folded exactly the way the one-shot driver reads a child's outcome
 * (`foldConsumedWork`). Reading the raw last `turn/end` instead would let a
 * trailing no-op turn (a rejected or rewritten-away step) mask the real
 * ending.
 */
export function accountingTurnEnd(events: readonly MinimalSessionEvent[]): MinimalSessionEvent | undefined {
  return foldConsumedWork(events as unknown as readonly SessionEvent[]).end as MinimalSessionEvent | undefined
}

/** Outcome classification of one prior run's persisted event log. */
export interface PriorRunClassification {
  readonly status: 'resumable' | 'completed'
  /** How the last accounting turn ended (an interrupted log still gets a phrase). */
  readonly endedAs: string
  /** How many `turn/end` events the log records. */
  readonly turnCount: number
}

/**
 * Classify a prior run from its persisted events: a run is resumable unless
 * its last ACCOUNTING turn ended `completed` — a mid-log failure followed by a
 * later success means the run as a whole finished, and a trailing no-op turn
 * must not mask the real ending. A log with no accounting turn at all (crash
 * before any turn closed over work) counts as interrupted.
 */
export function classifyPriorRun(events: readonly MinimalSessionEvent[]): PriorRunClassification {
  let turnCount = 0
  for (const event of events) {
    if (event.type === 'turn/end') turnCount += 1
  }
  const kind = turnEndKind(accountingTurnEnd(events))
  return {
    status: kind === 'completed' ? 'completed' : 'resumable',
    endedAs: describeTurnEnd(kind),
    turnCount,
  }
}

// ---------------------------------------------------------------------------
// Candidate selection and resume-vs-fresh decision
// ---------------------------------------------------------------------------

/** Structural minimum of a `listChildren` entry the picker reads. */
export interface ChildListEntry {
  readonly kind: 'child' | 'diagnostic'
  readonly id: unknown
  readonly activity?: 'running' | 'inactive'
  readonly mode?: 'one-shot' | 'continuable'
  readonly label?: string
}

/**
 * Pick the newest listable prior child for one agent label. `listChildren`
 * returns entries ordered by header `createdAt`, so the LAST match wins.
 * Only inactive one-shot children are eligible: a live child cannot be
 * resumed (its session id is taken), and continuable children keep their own
 * `send_message` cold-resume path.
 */
export function pickLatestLabeledChild<T extends ChildListEntry>(entries: readonly T[], label: string): T | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.kind !== 'child') continue
    if (entry.activity !== 'inactive') continue
    if (entry.mode !== 'one-shot') continue
    if (entry.label !== label) continue
    return entry
  }
  return undefined
}

/** When `use_agent` should continue a prior interrupted run. */
export type ResumeMode = 'auto' | 'opt-in' | 'off'

/** What one `use_agent` call decided to do about a prior interrupted run. */
export type ResumeDecision = 'resume' | 'fresh' | 'explicit-resume-unavailable'

/**
 * Decide resume vs fresh. `explicitFresh` always wins; `off` disables resume
 * entirely; `explicitResume` demands a candidate and fails loudly without
 * one; plain `auto` resumes whenever a candidate exists, `opt-in` only when
 * asked.
 */
export function decideResume(
  mode: ResumeMode,
  options: { explicitResume?: boolean; explicitFresh?: boolean; hasCandidate: boolean },
): ResumeDecision {
  if (options.explicitFresh === true) return 'fresh'
  if (mode === 'off') return 'fresh'
  if (options.explicitResume === true) {
    return options.hasCandidate ? 'resume' : 'explicit-resume-unavailable'
  }
  if (mode === 'opt-in') return 'fresh'
  return options.hasCandidate ? 'resume' : 'fresh'
}

/**
 * The single follow-up message that continues a resumed child. The child's
 * context already holds the original task and its own partial work; the
 * prompt only has to point the model at that and forbid redoing finished
 * steps. When the new `use_agent` call carried a task text, it is appended so
 * the child can reconcile a reworded (or revised) request against the
 * original task itself.
 */
export function buildContinuationPrompt(endedAs: string, callerPrompt?: string): string {
  const head =
    `Your previous attempt at this task stopped before it finished: ${endedAs}. ` +
    'The conversation above already contains the original task and all the work you completed before the interruption. ' +
    'Continue exactly where you left off: review what you already did, finish the remaining work without redoing completed steps, ' +
    'and then produce your final result message as usual.'
  if (callerPrompt === undefined || callerPrompt.trim() === '') return head
  return (
    `${head}\n\n` +
    'The caller submitted this request with the re-dispatch (it is usually the same task restated; ' +
    'if it genuinely differs from the original task above, finish or wrap up the original work first and say so):\n' +
    callerPrompt
  )
}

// ---------------------------------------------------------------------------
// Persistence lookup (fail-open: resume is an optimization, never a blocker)
// ---------------------------------------------------------------------------

/** The `sessionPersistence` surface this module reads (registered by the deployment profile). */
export interface PersistenceLike {
  inspect(id: SessionId, signal?: AbortSignal): Promise<{ events: readonly MinimalSessionEvent[] }>
}

/**
 * Fetch the deployment's session persistence, or undefined in a bare context.
 * Read through an untyped `get` so this plugin never hard-depends on the
 * service being mounted.
 */
export function getPersistence(ctx: Context): PersistenceLike | undefined {
  return (ctx as unknown as { get(name: string): unknown }).get('sessionPersistence') as PersistenceLike | undefined
}

/** A prior run selected for continuation. */
export interface ResumableRun {
  readonly childId: SessionId
  readonly classification: PriorRunClassification
}

/**
 * Find the parent's latest resumable prior run of one agent label. Fail-open
 * by design: any lookup error (projection registry absent, persistence
 * missing, unreadable log) degrades to "no candidate" and the caller starts
 * fresh — resume must never block a dispatch.
 */
export async function findResumableRun(
  ctx: Context,
  parent: Pick<Agent, 'id'>,
  label: string,
  signal?: AbortSignal,
): Promise<ResumableRun | undefined> {
  let entries: readonly ChildListEntry[]
  try {
    entries = await ctx.subagents.listChildren(parent.id, signal)
  } catch {
    return undefined
  }
  const candidate = pickLatestLabeledChild(entries, label)
  if (candidate === undefined) return undefined
  const persistence = getPersistence(ctx)
  if (persistence === undefined) return undefined
  let events: readonly MinimalSessionEvent[]
  try {
    ({ events } = await persistence.inspect(candidate.id as SessionId, signal))
  } catch {
    return undefined
  }
  const classification = classifyPriorRun(events)
  if (classification.status !== 'resumable') return undefined
  return { childId: candidate.id as SessionId, classification }
}

// ---------------------------------------------------------------------------
// The resume driver: one continuation turn on a persisted one-shot child
// ---------------------------------------------------------------------------

/** Inputs of the resume driver. */
export interface ResumeDriveInput {
  /** Plugin context; used for `ctx.agents.resume`. */
  readonly ctx: Context
  /** The delegating parent (composition and depth source). */
  readonly parent: Agent
  /** The persisted child session to continue. */
  readonly childId: SessionId
  /** Agent-file body, re-applied as the shadowing persona section. */
  readonly persona: string
  /** Leaf tool scoping re-applied on resume, when the agent is `deep: 0`. */
  readonly toolFilter?: ToolRestriction
  /** Frontmatter model route overrides, as for a fresh dispatch. */
  readonly agentOptions?: AgentOptions
  /** The continuation follow-up text. */
  readonly continuationPrompt: string
  /** One-line account for the injected message's notice source. */
  readonly noticeSummary: string
  /** Caller cancellation, observed for the whole drive. */
  readonly signal: AbortSignal
}

/** Terminal outcome of one resumed continuation turn. */
export interface ResumedRunResult {
  readonly output: ContentBlock[]
  readonly stopReason: SubagentStopReason
}

/**
 * Resume one persisted one-shot child and drive exactly one continuation
 * turn, then dispose. Mirrors the in-process one-shot driver
 * (`drivePublishedRun`): signal handoff via `child.cancel`, result read from
 * the session events appended after the resume boundary, and settle-before-
 * dispose so a disposal failure never masks the run outcome (and vice versa).
 */
export async function driveResumedRun(input: ResumeDriveInput): Promise<ResumedRunResult> {
  const { ctx, parent, childId, signal } = input
  const childDepth = resolveChildDepth(parent, undefined)
  const handle = await ctx.agents.resume({
    resumeSessionId: childId,
    agentOptions: resolveChildAgentOptions(parent, input.agentOptions, childDepth),
    signal,
    setup: (childCtx) => {
      // Cold resume replays the persisted log but not the composition: the
      // one-shot descriptor keeps no persona, so re-apply exactly what a
      // fresh dispatch would (persona section + leaf tool scoping).
      applyChildComposition(childCtx, parent, { persona: input.persona, toolFilter: input.toolFilter })
    },
  })
  const child = handle.agent
  const flags = { cancelled: false }
  const onAbort = () => {
    flags.cancelled = true
    child.cancel({ kind: 'parent' })
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  let outcome: ResumedRunResult
  try {
    // Everything the replay loaded is prior work; the continuation turn's
    // own events start at this boundary.
    const boundary = child.session.events.length
    if (!flags.cancelled) {
      child.followup(createUserMessage({
        content: [{ type: 'text', text: input.continuationPrompt }],
        source: {
          kind: 'plugin',
          plugin: 'dsh-subagent-registry',
          form: 'notice',
          summary: input.noticeSummary.slice(0, 120),
        },
      }))
      await child.whenIdle()
    }
    const own = child.session.events.slice(boundary)
    const output = finalAssistantOutput(own) ?? []
    const recorded = toStopReason(turnEndKind(accountingTurnEnd(own)))
    outcome = {
      output,
      stopReason: flags.cancelled && recorded !== 'completed' ? 'aborted' : recorded,
    }
  } catch (error) {
    // A failed drive still disposes; a disposal failure never masks it.
    const [disposal] = await Promise.allSettled([handle.dispose()])
    signal.removeEventListener('abort', onAbort)
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [error, disposal.reason],
        `resumed subagent run failed: ${String(error)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw error
  }
  signal.removeEventListener('abort', onAbort)
  await handle.dispose()
  return outcome
}
