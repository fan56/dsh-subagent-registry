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

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { SubagentError, finalAssistantOutput } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { listAgentFiles } from './agents-dir.ts'
import {
  accountingTurnEnd,
  getPersistence,
  toStopReason,
  type ChildListEntry,
  type MinimalSessionEvent,
} from './resume.ts'
import { loadAgent, stopReasonError, textOf } from './tool-run-agent.ts'

// ---------------------------------------------------------------------------
// Dispatch-mode decision (pure)
// ---------------------------------------------------------------------------

/**
 * Resolve the dispatch mode for one `use_agent` call: an explicit tool
 * parameter wins, the agent file's `background` frontmatter is the default,
 * and absence of both means the foreground one-shot behavior.
 */
export function decideBackgroundMode(
  explicit: boolean | undefined,
  frontmatter: boolean | undefined,
): boolean {
  if (explicit !== undefined) return explicit
  if (frontmatter !== undefined) return frontmatter
  return false
}

// ---------------------------------------------------------------------------
// Follow-up target selection (pure)
// ---------------------------------------------------------------------------

/**
 * Pick the newest listable continuable child whose label matches one of
 * `labels`. `listChildren` orders entries by header `createdAt`, so the LAST
 * match wins. Both a resident (running) and a cold (inactive) continuable
 * child qualify — delivery steers the former and cold-resumes the latter.
 * One-shot children never qualify: their sessions have no continuation state
 * (`sendMessage` rejects them with `NOT_RESUMABLE`).
 */
export function pickLatestContinuableChild<T extends ChildListEntry>(
  entries: readonly T[],
  labels: readonly string[],
): T | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.kind !== 'child') continue
    if (entry.mode !== 'continuable') continue
    if (entry.label === undefined || !labels.includes(entry.label)) continue
    return entry
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Reply observation
// ---------------------------------------------------------------------------

/** Structural minimum of the live-session surface the wait loop reads. */
export interface LiveSessionLike {
  /** The log offset (event count) the session has appended through. */
  readonly seq: number
  /** On-demand events read from `fromSeq` (inclusive) to the end. */
  snapshotEvents(fromSeq?: number): readonly MinimalSessionEvent[]
}

/**
 * Read the deployment's live session store without a hard dependency: the
 * standard dsh session service is registered as `sessions`, but a bare
 * context (tests, exotic deployments) may omit it.
 */
export function getLiveSession(ctx: Context, childId: SessionId): LiveSessionLike | undefined {
  const sessions = (ctx as unknown as { get(name: string): unknown }).get('sessions') as
    | { get(id: SessionId): LiveSessionLike | undefined }
    | undefined
  return sessions?.get(childId) ?? undefined
}

/**
 * The event offset a follow-up reply must exceed: the child's current log
 * end, read live when resident and from persistence when cold. `undefined`
 * means the offset is unknowable (no live session, no persistence) and the
 * caller should deliver without waiting.
 */
export async function childEventBoundary(
  ctx: Context,
  childId: SessionId,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const live = getLiveSession(ctx, childId)
  if (live !== undefined) return live.seq
  const persistence = getPersistence(ctx)
  if (persistence === undefined) return undefined
  try {
    const { events } = await persistence.inspect(childId, signal)
    return events.length
  } catch {
    return undefined
  }
}

/**
 * Events appended after `boundary`: the live session's on-demand read when
 * resident, the persistence log otherwise (both logs are contiguous from
 * offset 0, so a slice at the boundary offset is the same window). All
 * failures degrade to an empty window — a lost wait yields a delivery
 * notice, never a thrown tool error over an observation gap.
 */
async function readEventsAfter(
  ctx: Context,
  childId: SessionId,
  boundary: number,
  signal?: AbortSignal,
): Promise<readonly MinimalSessionEvent[]> {
  const live = getLiveSession(ctx, childId)
  if (live !== undefined) {
    try {
      return live.snapshotEvents(boundary)
    } catch {
      // Fall through to persistence: the child may have left the registry.
    }
  }
  const persistence = getPersistence(ctx)
  if (persistence === undefined) return []
  try {
    const { events } = await persistence.inspect(childId, signal)
    return events.slice(boundary)
  } catch {
    return []
  }
}

/** The child's reply to one follow-up: final output plus the turn's stop reason. */
export interface ChildReply {
  readonly output: ContentBlock[]
  readonly stopReason: string
}

/** Abortable sleep: resolves early on abort; the loop re-checks the signal. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Wait for the child's next accounting turn after `boundary` and return its
 * outcome. A steer into a running turn and a fresh turn on a resumed child
 * both end with exactly one accounting `turn/end`, whose final assistant
 * output is the reply. Polls the on-demand session reads (no event
 * subscription exists at this seam) and returns `undefined` when `timeoutMs`
 * elapses first; caller cancellation propagates.
 */
export async function waitForChildReply(input: {
  ctx: Context
  childId: SessionId
  boundary: number
  signal: AbortSignal
  /** Give up after this many ms and return undefined; absent = wait unbounded. */
  timeoutMs?: number
  /** Poll cadence in ms (tests lower it); default 300. */
  pollMs?: number
}): Promise<ChildReply | undefined> {
  const pollMs = input.pollMs ?? 300
  const deadline = input.timeoutMs !== undefined ? Date.now() + input.timeoutMs : undefined
  while (true) {
    input.signal.throwIfAborted()
    const events = await readEventsAfter(input.ctx, input.childId, input.boundary, input.signal)
    const end = accountingTurnEnd(events)
    if (end !== undefined) {
      const kind = (end.data as { reason?: { kind?: unknown } } | undefined)?.reason?.kind
      return {
        output: finalAssistantOutput(events as unknown as readonly SessionEvent[]) ?? [],
        stopReason: toStopReason(typeof kind === 'string' ? kind : undefined),
      }
    }
    if (deadline !== undefined && Date.now() >= deadline) return undefined
    await sleep(pollMs, input.signal)
  }
}

// ---------------------------------------------------------------------------
// The `ask_agent` tool
// ---------------------------------------------------------------------------

/** Config of the follow-up tool (a subset of the plugin Config schema). */
export interface AskAgentConfig {
  agentsDir: string
  toolName: string
  /** The `use_agent` tool name, referenced in guidance text. */
  dispatchToolName?: string
  /** Poll cadence override (ms) for tests. */
  pollMs?: number
}

/**
 * The cordis `ctx.tools.register`-ready definition for the `ask_agent` tool.
 * Read-only over the agent roster (for name → label resolution) and the
 * subagent service; it never spawns.
 */
export function askAgentTool(ctx: Context, cfg: AskAgentConfig) {
  const dispatchTool = cfg.dispatchToolName ?? 'use_agent'
  const { agents, broken } = listAgentFiles(cfg.agentsDir)
  const nameList = agents.map((agent) => agent.meta.name).join(', ')
  const brokenNote = broken.length > 0 ? ` (unparsable agents excluded: ${broken.map((b) => b.path).join(', ')})` : ''

  const description =
    `Send a follow-up message to a background custom agent and WAIT for its reply. ` +
    `Targets are agents previously dispatched with ${dispatchTool} in background mode; ` +
    `address one by its agent name (${nameList || 'none defined'}${brokenNote}) or by the exact ` +
    `subagent id the dispatch returned. A mid-turn agent takes the message at its nearest ` +
    `step boundary; a finished agent's durable session resumes and the message starts a new ` +
    `turn. This call blocks until the agent's turn ends and returns its reply text, with a ` +
    `status line when the turn ended abnormally. For fire-and-forget steering without a ` +
    `reply, use the base send_message tool instead.`

  return defineTool({
    name: cfg.toolName,
    description,
    parameters: {
      agent: {
        type: 'string',
        description: `The name of the local agent to follow up with. One of: ${nameList}`,
      },
      agent_id: {
        type: 'string',
        description: 'The exact durable subagent id a background dispatch returned. Takes precedence over `agent`.',
      },
      message: {
        type: 'string',
        required: true,
        description: 'The follow-up message for the agent.',
      },
      timeout: {
        type: 'number',
        description: 'Seconds to wait for the reply before giving up (the message stays delivered; the reply arrives later as a settlement or agent message). Omit to wait until the conversation moves on.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'agent-reply' },
          output: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: textOf(value.output) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) {
        throw new Error(`${cfg.toolName} requires a calling agent (exec.agent was undefined)`)
      }
      if (typeof args.message !== 'string' || args.message.trim() === '') {
        throw new Error(`${cfg.toolName}: "message" is required and must be non-empty`)
      }
      const hasName = typeof args.agent === 'string' && args.agent.trim() !== ''
      const hasId = typeof args.agent_id === 'string' && args.agent_id.trim() !== ''
      if (hasName === hasId) {
        throw new Error(
          `${cfg.toolName}: pass exactly one of "agent" (an agent name) or "agent_id" (the durable subagent id a background dispatch returned)`,
        )
      }

      let childId: SessionId
      if (hasId) {
        childId = (args.agent_id as string) as unknown as SessionId
      } else {
        const available = agents.map((agent) => agent.meta.name)
        const agent = loadAgent(cfg.agentsDir, args.agent as string, available)
        const labels = [...new Set([agent.meta.displayName ?? agent.meta.name, agent.meta.name])]
        let entries: readonly ChildListEntry[]
        try {
          entries = await ctx.subagents.listChildren(parent.id, exec.signal)
        } catch (error) {
          throw new Error(
            `${cfg.toolName}: cannot enumerate this conversation's subagent children (${String(error)}) — ` +
            `if you have the agent's durable id from its dispatch, pass agent_id instead`,
          )
        }
        const candidate = pickLatestContinuableChild(entries, labels)
        if (candidate === undefined) {
          throw new Error(
            `${cfg.toolName}: no background run of agent "${args.agent}" was found in this conversation — ` +
            `dispatch one with ${dispatchTool}(agent: "${args.agent}", ..., background: true) first, ` +
            `or address an earlier run by its subagent id`,
          )
        }
        childId = candidate.id as SessionId
      }

      // Capture the reply boundary BEFORE delivery: the offset the reply turn
      // must exceed. Unknowable (bare deployment) → deliver without waiting.
      const boundary = await childEventBoundary(ctx, childId, exec.signal)
      let messageId: unknown
      try {
        messageId = await ctx.subagents.sendMessage(
          parent as Agent,
          childId,
          [{ type: 'text', text: args.message }],
          { signal: exec.signal },
        )
      } catch (error) {
        if (error instanceof SubagentError && error.code === 'NOT_RESUMABLE') {
          throw new Error(
            `${cfg.toolName}: subagent ${String(childId)} is not continuable — only background dispatches ` +
            `(${dispatchTool} with background: true) accept follow-ups; one-shot runs do not. ` +
            `Re-dispatch the agent with background: true to start an interactive conversation.`,
            { cause: error },
          )
        }
        throw error
      }
      if (boundary === undefined) {
        return replyOutput([
          {
            type: 'text',
            text:
              `Message delivered to subagent ${String(childId)} (message ${String(messageId)}); ` +
              'its session is not observable here, so the reply is not awaited — it will arrive as an agent message.',
          },
        ])
      }

      const reply = await waitForChildReply({
        ctx,
        childId,
        boundary,
        signal: exec.signal,
        timeoutMs: typeof args.timeout === 'number' && Number.isFinite(args.timeout) && args.timeout > 0
          ? args.timeout * 1000
          : undefined,
        pollMs: cfg.pollMs,
      })
      if (reply === undefined) {
        return replyOutput([
          {
            type: 'text',
            text:
              `Message delivered to subagent ${String(childId)} (message ${String(messageId)}), ` +
              'but no reply turn completed within the wait budget — the agent may still be working. ' +
              'Call again later, or collect the outcome from the settlement notice.',
          },
        ])
      }
      if (reply.stopReason !== 'completed') {
        const text = textOf(reply.output as unknown as readonly unknown[])
        const headline = `${stopReasonError(reply.stopReason)} (follow-up to subagent ${String(childId)})`
        return replyOutput([
          {
            type: 'text',
            text: text.length === 0 ? headline : `${headline}\nPartial output before the turn ended:\n${text}`,
          },
        ])
      }
      if (reply.output.length === 0) {
        return replyOutput([
          { type: 'text', text: `Subagent ${String(childId)} acknowledged the message but produced no text output.` },
        ])
      }
      return replyOutput(reply.output)
    },
  })
}

/** Wrap reply blocks into the tool's output contract. */
function replyOutput(blocks: readonly ContentBlock[]): { kind: 'agent-reply'; output: JsonValue[] } {
  return {
    kind: 'agent-reply',
    output: blocks as unknown as JsonValue[],
  }
}
