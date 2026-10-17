/** Foreground recall, with managed fresh dispatch and a scoped cold-resume driver. */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { foldConsumedWork } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
import { createLegacyDescendantJoin, drainRunDescendants } from './host-compat.ts'
import {
  applyChildComposition,
  finalAssistantOutput,
  resolveChildAgentOptions,
  resolveChildDepth,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'

// ---------------------------------------------------------------------------
// Producer message source (0.1.7 merge-extensible `MessageSourceMap`)
// ---------------------------------------------------------------------------

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
  readonly kind: 'dsh-subagent-registry'
  /** A one-off account of something that just happened (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of what this plugin did, ellipsized to the bound. */
  readonly summary: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-subagent-registry': RegistryNoticeMessageSource
  }
}

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
  const work = foldConsumedWork(events as unknown as readonly SessionEvent[])
  const openTurns = new Set<unknown>()
  for (const event of events) {
    const turn = (event.data as { turn?: unknown } | undefined)?.turn
    if (event.type === 'turn/start') openTurns.add(turn)
    if (event.type === 'turn/end') openTurns.delete(turn)
  }
  const kind = work.droppedUnrun ? 'aborted' : openTurns.size > 0 ? 'interrupted' : turnEndKind(work.end)
  return {
    status: kind === 'completed' ? 'completed' : 'resumable',
    endedAs: describeTurnEnd(kind),
    turnCount,
  }
}

// ---------------------------------------------------------------------------
// Candidate selection and resume-vs-fresh decision
// ---------------------------------------------------------------------------

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
  readonly id: unknown
  readonly mode?: 'one-shot' | 'continuable' | 'external' | 'unknown'
  readonly label?: string
}

/** Durable namespace separates managed foreground children from background conversations. */
export const foregroundLabel = (label: string): string => `[use_agent foreground] ${label}`

export function pickLatestLabeledChild<T extends ChildListEntry>(entries: readonly T[], label: string): T | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!(entry.mode === 'one-shot' && entry.label === label)
      && !(entry.mode === 'continuable' && entry.label === foregroundLabel(label))) continue
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
// Persistence lookup (strict for dispatch, best-effort for reply observation)
// ---------------------------------------------------------------------------

/**
 * The `sessionPersistence` surface this module reads (registered by the
 * deployment profile). 0.1.5 replaced the whole-log `inspect` read with
 * per-handle reads: `open(id, 'read')` never takes write ownership and works
 * while another process drives the session.
 */
export interface PersistenceLike {
  open(
    id: SessionId,
    access: 'read' | 'write',
    options?: { signal?: AbortSignal },
  ): Promise<{
    read(
      offset?: number,
      length?: number,
      options?: { signal?: AbortSignal },
    ): Promise<{ events: readonly MinimalSessionEvent[] }>
    close(): Promise<void>
  }>
}

/**
 * Fetch the deployment's session persistence, or undefined in a bare context.
 * Read through an untyped `get` so this plugin never hard-depends on the
 * service being mounted.
 */
export function getPersistence(ctx: Context): PersistenceLike | undefined {
  return (ctx as unknown as { get(name: string): unknown }).get('sessionPersistence') as PersistenceLike | undefined
}

/**
 * Read stored events through a read handle — the whole log by default, the
 * suffix from `offset` when given. Returns undefined when the log is
 * unreadable (persistence absent, session missing, decode failure); every
 * strict resume lookup propagates failures; best-effort reply observation
 * returns undefined. The handle is always closed.
 */
export async function readStoredEvents(
  ctx: Context,
  id: SessionId,
  options: { offset?: number; signal?: AbortSignal; strict?: boolean } = {},
): Promise<readonly MinimalSessionEvent[] | undefined> {
  const persistence = getPersistence(ctx)
  if (persistence === undefined) return undefined
  let handle: Awaited<ReturnType<PersistenceLike['open']>>
  try {
    handle = await persistence.open(id, 'read', { signal: options.signal })
  } catch (error) {
    options.signal?.throwIfAborted()
    if (options.strict) throw error
    return undefined
  }
  try {
    const { events } = await handle.read(options.offset, undefined, { signal: options.signal })
    return events
  } catch (error) {
    options.signal?.throwIfAborted()
    if (options.strict) throw error
    return undefined
  } finally {
    if (options.strict) await handle.close()
    else await handle.close().catch(() => {})
  }
}

/** A prior run selected for continuation. */
export interface ResumableRun {
  readonly childId: SessionId
  readonly mode?: 'one-shot' | 'continuable'
  readonly classification: PriorRunClassification
}

/** Select the latest foreground run; unreadable or busy candidates must not create duplicate work. */
export async function findResumableRun(
  ctx: Context,
  parent: Pick<Agent, 'id'>,
  label: string,
  signal?: AbortSignal,
): Promise<ResumableRun | undefined> {
  signal?.throwIfAborted()
  const entries = await ctx.subagents.listChildren(parent.id, signal)
  const candidate = pickLatestLabeledChild(entries, label)
  if (candidate === undefined) return undefined
  // Read the live agent registry without a hard dependency (a bare context —
  // tests, exotic deployments — may omit the service).
  const agents = (ctx as unknown as { get(name: string): unknown }).get('agents') as
    | { get(id: SessionId): unknown }
    | undefined
  if (agents?.get(candidate.id as SessionId) !== undefined) throw new Error('subagent resume is already in progress')
  const events = await readStoredEvents(ctx, candidate.id as SessionId, { signal, strict: true })
  if (events === undefined) throw new Error('cannot inspect the prior subagent run; pass fresh=true to start a new run')
  const classification = classifyPriorRun(events)
  if (classification.status !== 'resumable') return undefined
  return { childId: candidate.id as SessionId, mode: candidate.mode as 'one-shot' | 'continuable', classification }
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
  readonly output: readonly ContentBlock[]
  readonly stopReason: SubagentStopReason
}

/**
 * Resume one persisted one-shot child and drive exactly one continuation
 * turn, then dispose. Mirrors the in-process one-shot driver
 * (`drivePublishedRun`): signal handoff via `child.cancel`, result read from
 * the session events appended after the resume boundary, and settle-before-
 * dispose so a disposal failure never masks the run outcome (and vice versa).
 */
const resumingChildren = new Set<SessionId>()

export async function driveResumedRun(input: ResumeDriveInput): Promise<ResumedRunResult> {
  if (resumingChildren.has(input.childId)) throw new Error('subagent resume is already in progress')
  resumingChildren.add(input.childId)
  let releaseParent: (() => unknown) | undefined
  try {
    const lifecycle = new AbortController()
    releaseParent = input.parent.ctx?.effect(() => () => lifecycle.abort())
    const signal = AbortSignal.any([input.signal, lifecycle.signal])
    return await driveLegacyResume({ ...input, signal })
  } finally {
    try { releaseParent?.() } finally { resumingChildren.delete(input.childId) }
  }
}

// ponytail: foreground resume is outside manager capacity/interrupt; migrate when host supports caller-delivery cold resume with composition overrides.
async function driveLegacyResume(input: ResumeDriveInput): Promise<ResumedRunResult> {
  const { ctx, parent, childId, signal } = input
  signal.throwIfAborted()
  const childDepth = resolveChildDepth(parent, undefined)
  const handle = await ctx.agents.resume({
    resumeSessionId: childId,
    parentAgent: parent,
    agentOptions: resolveChildAgentOptions(parent, input.agentOptions, childDepth),
    signal,
    setup: (childCtx, child) => {
      if (child.session.header.parentSession !== parent.id) throw new Error('resume target belongs to another parent')
      // Cold resume replays the persisted log but not the composition: the
      // one-shot descriptor keeps no persona, so re-apply exactly what a
      // fresh dispatch would (persona section + leaf tool scoping).
      applyChildComposition(childCtx, parent, { persona: input.persona, toolFilter: input.toolFilter })
      return { commit() {
        signal.throwIfAborted()
        if (ctx.agents.get(parent.id) !== parent) throw new Error('resume requires the exact live parent')
      } }
    },
  })
  const child = handle.agent
  let join: ReturnType<typeof createLegacyDescendantJoin> | undefined
  let drain: Promise<void> | undefined
  const drainDescendants = () => drain ??= Promise.resolve().then(() => drainRunDescendants(ctx, child))
  const dispose = async () => {
    const [descendants] = await Promise.allSettled([drainDescendants()])
    const [handleDisposed] = await Promise.allSettled([handle.dispose()])
    const errors = [descendants, handleDisposed].flatMap((r) => r.status === 'rejected' ? [r.reason] : [])
    if (errors.length > 0) throw new AggregateError(errors, 'resumed subagent cleanup failed: ' + errors.map(String).join('; '))
  }
  const flags = { cancelled: false }
  const onAbort = () => {
    flags.cancelled = true
    child.cancel({ kind: 'parent' })
    void drainDescendants().catch(() => {})
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  let outcome: ResumedRunResult
  try {
    // Everything the replay loaded is prior work; the continuation turn's
    // own events start at this boundary. The on-demand read (the session's
    // `snapshotEvents(fromSeq)`) keeps the window offset-addressed instead
    // of relying on array indices coinciding with log offsets. The read is
    // @deprecated on 0.1.7 (soft; replacement = persistence-handle reads)
    // but stays here: the result read of the just-driven turn must observe
    // the live child before disposal and fail identically in bare contexts
    // without persistence.
    const boundary = child.session.seq
    if (typeof ctx.subagents.waitForChildren !== 'function') join = createLegacyDescendantJoin(ctx, signal)
    if (!flags.cancelled) {
      child.followup(createUserMessage({
        content: [{ type: 'text', text: input.continuationPrompt }],
        source: {
          kind: 'dsh-subagent-registry',
          form: 'notice',
          summary: input.noticeSummary.slice(0, 120),
        },
      }))
      // Inbox listeners may cancel synchronously before followup wakes its driver.
      if (signal.aborted) onAbort()
      if (join) {
        try { await join.wait(child) } catch (error) {
          if (!signal.aborted) throw error
          await child.whenIdle()
        }
      } else {
        while (true) {
          await child.whenIdle()
          const seq = child.session.seq
          await ctx.subagents.waitForChildren(child)
          if (child.status === 'idle' && child.session.seq === seq) break
        }
      }
    }
    const own = child.session.snapshotEvents(boundary)
    const output = finalAssistantOutput(own) ?? []
    const recorded = toStopReason(turnEndKind(accountingTurnEnd(own)))
    outcome = {
      output,
      stopReason: flags.cancelled ? 'aborted' : recorded,
    }
  } catch (error) {
    // A failed drive still disposes; a disposal failure never masks it.
    const [disposal] = await Promise.allSettled([dispose()])
    signal.removeEventListener('abort', onAbort)
    join?.dispose()
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [error, disposal.reason],
        `resumed subagent run failed: ${String(error)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw error
  }
  signal.removeEventListener('abort', onAbort)
  join?.dispose()
  await dispose()
  return outcome
}
