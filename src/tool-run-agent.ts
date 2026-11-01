/**
 * The `use_agent` tool: delegates to a locally-defined custom agent by name.
 *
 * The roster (available agent names + sanitized descriptions) is read once at
 * tool-definition time so the tool's static description lets the main
 * conversation model pick an agent by name. At execute time the target
 * `<agents-dir>/<name>.md` is re-read, its frontmatter `model` (a
 * `provider/model` route) is split into `agentOptions`, and its body is
 * passed as the child's `persona`. The effective model/thinking are the
 * COMPOSED runtime (see ./profile-resolution.ts): the frontmatter is the
 * baseline, and a workspace profile pin may override it per agent. The
 * delegation runs through the already-assembled `spawn` subagent provider
 * (same single-instance realm dsh uses), so the child is a real dsh
 * subagent with its own system prompt.
 *
 * When the same agent was already run in this conversation and that run was
 * interrupted (error, cancellation, crash, token limit), the tool instead
 * resumes the persisted child session and continues it from its partial work
 * (see `./resume.ts`), unless the caller passes `fresh: true`.
 *
 * @module dsh-subagent-registry/tool-run-agent
 */

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
// Type-only (erased at emit): alpha.3 moved JsonValue out of dsh-session to
// dsh-util-values — the same module dsh-tools itself sources it from.
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ContentBlock, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { resolveChildDepth, finalAssistantOutput, type SubagentResult, type SubagentStartRequest, type SubagentActivation } from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { scopeOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { createLegacyDescendantJoin, drainRunDescendants, legacySubagents, reserveChildComposition, releaseChildComposition, type ChildComposition, type DispatchRequest } from './host-compat.ts'
import { expandHome, listAgentFiles, parseAgentMarkdown, type AgentFile, type ThinkingLevel } from './agents-dir.ts'
import { composeAgentRuntime } from './profile-resolution.ts'
import { decideBackgroundMode } from './interactive.ts'
import {
  buildContinuationPrompt,
  decideResume,
  driveResumedRun,
  findResumableRun,
  foregroundLabel,
  accountingTurnEnd,
  readStoredEvents,
  toStopReason,
  type ResumeMode,
} from './resume.ts'

/** The writable knob surface for this plugin (a subset of the Config schema). */
export interface RunAgentConfig {
  agentsDir: string
  provider: string
  toolName: string
  /**
   * When `use_agent` continues a prior interrupted run of the same agent:
   * `auto` (default) resumes whenever one exists, `opt-in` only when the
   * caller passes `resume: true`, `off` never (an explicit `resume: true`
   * still overrides the deployment default).
   */
  resume?: ResumeMode
  /**
   * Optional explicit deny list installed on a `deep: 0` (leaf) agent's child.
   * An empty/absent list means the computed default: every agent-spawning tool
   * in the dsh base distribution plus this plugin's own `toolName` (so a
   * customized tool name is still denied). A non-empty list replaces the
   * default entirely — the caller then owns it, including our tool name.
   */
  leafDenyTools?: readonly string[]
  /**
   * The follow-up tool's registered name (`ask_agent` by default), referenced
   * in the background dispatch's guidance text. Informational only.
   */
  askToolName?: string
}

/**
 * Every tool in the stock dsh base distribution that can start agents,
 * excluding this plugin's own configurable `use_agent` tool name (registered
 * separately through `RunAgentConfig.toolName`). `dsh-tool-workflow` fans work
 * out across many subagents and `dsh-tool-ralph` starts a fresh child every
 * round, so both are agent-spawning even though they are not `subagent`-named;
 * `send_message`/`interrupt_agent`/`list_agents` only address already-running
 * children, so a leaf cannot abuse them to spawn and they stay visible.
 */
export const SPAWN_TOOL_NAMES = [
  // dsh-base patch: dsh-tool-subagent registered twice with these toolNames.
  'subagent',
  'subagent_fork',
  // dsh-base patch: dsh-tool-workflow (toolName default 'workflow', spawn).
  'workflow',
  // dsh-base patch: dsh-tool-ralph (fixed tool name 'ralph', fresh children).
  'ralph',
] as const

/**
 * The deny list installed on a `deep: 0` (leaf) agent's child, both at fresh
 * dispatch and again at resume: an explicit non-empty `leafDenyTools` replaces
 * the default (every agent-spawning tool in the dsh base distribution plus
 * this plugin's own `toolName`).
 *
 * `hostKnown` is the host's currently-registered global tool names (see
 * `resolveHostToolNames`); when provided, the DEFAULT list is intersected
 * with it. The stock spawn-tool names are a static enumeration over a
 * distribution whose composition moves — dsh 0.1.7-rc.1 stopped registering
 * `dsh-tool-ralph` while its `tools.restrict()` became fail-fast on unknown
 * names, so passing a stale default verbatim aborts the whole spawn. An
 * explicit `leafDenyTools` is NOT intersected: the caller owns that list and
 * the host's strict validation is the right feedback for a stale entry.
 */
export function leafDenyList(
  toolName: string,
  leafDenyTools?: readonly string[],
  hostKnown?: ReadonlySet<string>,
): readonly string[] {
  if (leafDenyTools !== undefined && leafDenyTools.length > 0) return leafDenyTools
  const defaults = [...SPAWN_TOOL_NAMES, toolName]
  return hostKnown ? defaults.filter(name => hostKnown.has(name)) : defaults
}

/**
 * The names the host would accept in a `tools.restrict()` filter for the
 * plugin's own context — `ctx.tools.view().restrictableNames`, read
 * defensively: older hosts may lack `view()`, and anything unexpected here
 * must degrade to "pass the default list verbatim" (the pre-0.1.7 behavior),
 * never to "deny nothing".
 */
export function resolveHostToolNames(ctx: Context, scope?: ScopeKey): ReadonlySet<string> | undefined {
  try {
    // `view` is private in the host's ToolRuntime typing but callable at
    // runtime; the double cast keeps this compilation-independent of it.
    const names = (ctx as unknown as {
      tools?: { view?: (scope?: ScopeKey) => { restrictableNames?: unknown } }
    }).tools?.view?.(scope)?.restrictableNames
    return names instanceof Set ? names : undefined
  } catch {
    return undefined
  }
}

/** Join text blocks from a canonical block array without trusting values. */
export function textOf(output: readonly unknown[]): string {
  return output
    .flatMap((block) => {
      if (typeof block !== 'object' || block === null) return []
      const candidate = block as { type?: unknown; text?: unknown }
      return candidate.type === 'text' && typeof candidate.text === 'string' ? [candidate.text] : []
    })
    .join('')
}

/**
 * Sanitize a frontmatter `description` into clean display prose:
 * 1. drop the leading run of backslashes left by an escaped-quote residue
 *    (`\\\\"…"`), 2. peel one pair of surrounding quotes, 3. drop any stray
 *    backslashes, 4. drop a `>` wedged between two CJK characters (markdown
 *    blockquote artifact, e.g. `稳>定性`), 5. collapse whitespace.
 */
export function sanitizeDescription(raw: string): string {
  let s = raw ?? ''
  s = s.replace(/^\\+/, '')
  s = s.trim()
  if (s.length >= 2) {
    const first = s[0]
    const last = s[s.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) s = s.slice(1, -1)
  }
  s = s.replace(/\\/g, '')
  s = s.replace(/([\u4e00-\u9fff]|[\u3400-\u4dbf])>([\u4e00-\u9fff]|[\u3400-\u4dbf])/g, '$1$2')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** One roster entry for the tool description. */
interface Roster {
  rosterText: string
  nameList: string
}

/** Build the static roster (agents already sorted by listAgentFiles). */
function buildRoster(dir: string): Roster {
  const { agents, broken } = listAgentFiles(dir)
  const lines = agents.map((agent) => {
    const label = agent.meta.displayName !== undefined
      ? `${agent.meta.name} (${agent.meta.displayName})`
      : agent.meta.name
    return `- ${label}: ${sanitizeDescription(agent.meta.description ?? '')}`
  })
  const nameList = agents.map((agent) => agent.meta.name).join(', ')
  if (broken.length > 0) {
    lines.push(`- (unparsable agents excluded: ${broken.map((b) => b.path).join(', ')})`)
  }
  return { rosterText: lines.join('\n'), nameList }
}

/**
 * Split a dsh model route (`provider/model`) into `agentOptions`. Tolerant of
 * suffixes and unusual shapes (e.g. `deepseek-v4-flash（正式版）`): the first
 * slash splits provider from model and trailing parenthetical notes are kept
 * in the model string. A value without a slash yields provider-only routing.
 */
export function splitModel(model: string): { provider?: string; model?: string } {
  const value = model?.trim() ?? ''
  if (value === '') return {}
  const slash = value.indexOf('/')
  if (slash < 0) return { provider: value }
  return {
    provider: value.slice(0, slash).trim(),
    model: value.slice(slash + 1).trim(),
  }
}

/** Inputs of the request builder, factored apart from the tool's execute closure. */
export interface BuildStartRequestInput {
  agentName: string
  prompt: string
  /** The delegating agent; only its delegation depth is read. */
  parent: { options: { subagentDepth?: number }; session: { header: { delegationDepth?: number } } }
  /** The agent file body, passed through verbatim as the child's persona. */
  persona: string
  /** The parsed frontmatter `deep` (default 1); 0 = leaf. */
  deep: number
  /** This plugin's registered tool name (denied on leaves). */
  toolName: string
  /** Optional explicit replacement for the default leaf deny list. */
  leafDenyTools?: readonly string[]
  /**
   * The host's registered global tool names (`resolveHostToolNames`), used to
   * intersect the DEFAULT leaf deny list — see `leafDenyList`.
   */
  hostKnownTools?: ReadonlySet<string>
  /** Optional dsh `provider/model` route from the agent frontmatter. */
  model?: string
  /** Optional display name used as the running child's display label (falls back to agentName). */
  displayName?: string
  /**
   * Optional frontmatter `thinking` level of the agent, projected verbatim
   * into `SubagentStartRequest.agentOptions.reasoningEffort` — the host's
   * native carrier (requires the provider's `agentOptions` capability, which
   * the in-process `spawn` provider declares; the start service rejects
   * loudly on a provider without it instead of dropping the value).
   */
  thinking?: ThinkingLevel
}

/**
 * Build the one-shot subagent start request for one custom agent, encoding the
 * `deep` semantics:
 *
 * - `deep === 0` (leaf): the child must run but must not start any subagent.
 *   `maxDepth` is OMITTED (an absolute `maxDepth: 0` would fail the child's
 *   own start — `resolveChildDepth` rejects child depth 1 > 0), and a
 *   `toolFilter` deny list removes every agent-spawning tool from the child's
 *   registry (the in-process driver applies it as a scoped `tools.restrict()`
 *   in the creation window, so the tools vanish from the prompt AND refuse to
 *   execute). The child keeps its full non-spawn tool set.
 *
 * - `deep >= 1` (default 1): the child may start subagents. No `toolFilter`;
 *   `maxDepth` is set to the child's own absolute depth plus `deep`, a
 *   relative budget that can never reject the start (`childDepth <=
 *   childDepth + deep` always holds), while keeping the "deep = generations
 *   of spawns" reading: a `deep: 1` agent's children may themselves sit one
 *   level deeper before their own per-request caps take over as the
 *   recursion backstop. The host's native default — `3` in dsh ≤ 0.1.5,
 *   lowered to `1` from 0.1.6-alpha.1 (upstream B-04) — is never binding
 *   here, since this plugin always passes an explicit `maxDepth`.
 */
export function buildStartRequest(input: BuildStartRequestInput): Omit<SubagentStartRequest, 'signal'> & ChildComposition {
  const { agentName, prompt, parent, persona, deep, toolName, leafDenyTools, hostKnownTools, model, displayName, thinking } = input
  // The child's absolute delegation depth, computed by the same authoritative
  // resolver the in-process driver uses (parent depth + 1, monotone floor).
  const childDepth = resolveChildDepth(
    parent as Parameters<typeof resolveChildDepth>[0],
    undefined,
  )
  const modelOptions = model !== undefined ? splitModel(model) : {}
  // TODO(alpha): expose a frontmatter `maxTokens` → `agentOptions.maxTokens`
  //   (native since v0.1.2-alpha) alongside model/thinking.
  const routeOptions: { provider?: string; model?: string; reasoningEffort?: ReasoningEffortId } = {
    ...modelOptions,
    ...(thinking !== undefined ? { reasoningEffort: thinking as ReasoningEffortId } : {}),
  }
  // The inline `persona`/`toolFilter` composition is read by the 0.2.0 line's
  // start request; the 0.2.1 line's dispatch strips it back off and reserves
  // it out-of-band (see `activateWithReservedComposition`).
  const request: Omit<SubagentStartRequest, 'signal'> & ChildComposition = {
    label: displayName ?? agentName,
    prompt: [{ type: 'text', text: prompt }],
    parent: parent as Parameters<typeof resolveChildDepth>[0],
    persona,
    ...(deep === 0
      ? {
          // Leaf: strip every spawn capability; no maxDepth at all.
          toolFilter: {
            deny: [...leafDenyList(toolName, leafDenyTools, hostKnownTools)],
          },
        }
      : {
          // Relative depth budget: childDepth + deep, never a start blocker.
          maxDepth: childDepth + deep,
        }),
    ...(Object.keys(routeOptions).length > 0 ? { agentOptions: routeOptions } : {}),
  }
  return request
}

interface ForegroundRun {
  readonly childId: SessionId
  readonly result: Promise<SubagentResult>
  cancel?(): void
  dispose(): Promise<void>
}

/** Caller cancellation owns accepted foreground work until teardown finishes. */
async function settleForegroundRun(ctx: Context, run: ForegroundRun, agentName: string, signal: AbortSignal): Promise<readonly ContentBlock[]> {
  let disposal: Promise<void> | undefined
  const dispose = () => disposal ??= Promise.resolve().then(() => run.dispose())
  const onAbort = () => {
    if (run.cancel) run.cancel()
    else void dispose().catch(() => {})
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  const [execution] = await Promise.allSettled([
    run.result.then(async (result) => {
      if (result.stopReason !== 'completed') {
        const text = textOf(result.output)
        const headline = `${stopReasonError(String(result.stopReason))} (agent "${agentName}")`
        const parts = [text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`]
        let diagnostic = result.diagnostic
        if (!diagnostic && result.stopReason === 'error') {
          try {
            const events = await readStoredEvents(ctx, run.childId, { signal })
            const end = events && accountingTurnEnd(events)
            diagnostic = (end?.data as { reason?: { error?: { message?: string } } } | undefined)?.reason?.error?.message
          } catch {
            // Best-effort detail must not replace the original run failure.
          }
        }
        if (diagnostic) parts.push(`Child diagnostic: ${diagnostic}`)
        throw new Error(parts.join('\n'))
      }
      return result.output
    }),
  ])
  signal.removeEventListener('abort', onAbort)
  const [released] = await Promise.allSettled([dispose()])
  if (execution.status === 'rejected') {
    if (released.status === 'rejected') throw new AggregateError(
      [execution.reason, released.reason],
      `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(released.reason)}`,
    )
    throw execution.reason
  }
  if (released.status === 'rejected') throw released.reason
  return execution.value
}

/** rc.2's one-shot result precedes descendant settlement; read the live final suffix before release. */
async function startLegacyForeground(
  ctx: Context,
  provider: string,
  request: SubagentStartRequest & ChildComposition,
): Promise<ForegroundRun> {
  const join = createLegacyDescendantJoin(ctx, request.signal)
  try {
    const run = await legacySubagents(ctx).start(provider, request)
    const child = run.localAgent
    if (!child) {
      join.dispose()
      return { childId: run.id, result: run.result, dispose: () => run.dispose() }
    }
    let drain: Promise<void> | undefined
    const drainDescendants = () => drain ??= Promise.resolve().then(() => drainRunDescendants(ctx, child))
    const cancel = () => {
      child.cancel({ kind: 'parent' })
      void drainDescendants().catch(() => {})
    }
    // Keep diagnostics live: cancellation stops/drains now, but disposal waits for the result read.
    const result = run.result.then(async (early) => {
      try { await join.wait(child) } catch (error) {
        if (!request.signal.aborted) throw error
        await child.whenIdle()
      }
      const own = child.session.snapshotEvents(child.session.inheritedEventCount)
      const end = accountingTurnEnd(own)
      const reason = (end?.data as { reason?: { kind?: string; error?: { message?: string } } } | undefined)?.reason
      return {
        ...early,
        output: finalAssistantOutput(own) ?? [],
        stopReason: request.signal.aborted ? 'aborted' : toStopReason(reason?.kind),
        ...(reason?.error?.message ? { diagnostic: reason.error.message } : {}),
      }
    }).finally(() => join.dispose())
    return {
      childId: run.id,
      result,
      cancel,
      async dispose() {
        const [descendants] = await Promise.allSettled([drainDescendants()])
        const [released] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
        const errors = [descendants, released].flatMap(r => r.status === 'rejected' ? [r.reason] : [])
        if (errors.length > 0) throw new AggregateError(errors, 'subagent cleanup failed: ' + errors.map(String).join('; '))
      },
    }
  } catch (error) {
    join.dispose()
    throw error
  }
}

/**
 * Start one fresh child on an activation host (the 0.2.1 line). The start
 * request no longer carries `persona`/`toolFilter` — the composition rides
 * out-of-band: the child's durable id is reserved up front, the inline fields
 * are parked under it (`reserveChildComposition`), and the id rides the spec;
 * the `subagent/start` listener (`installChildCompositionListener`) installs
 * them on the child scope at the start edge, before the first prompt is
 * queued. A dispatch that never reaches the start edge releases the
 * reservation.
 */
async function activateWithReservedComposition(
  ctx: Context,
  provider: string,
  label: string,
  request: DispatchRequest,
  signal: AbortSignal,
  delivery: 'parent' | 'caller',
  parent: Agent,
): Promise<SubagentActivation> {
  const childId = randomUUID() as SessionId
  reserveChildComposition(childId, parent.id, {
    persona: request.persona,
    ...(request.toolFilter !== undefined ? { toolFilter: request.toolFilter } : {}),
  })
  try {
    return await ctx.subagents.startActivation({ provider, label, request, signal, delivery, childId })
  } catch (error) {
    releaseChildComposition(childId)
    throw error
  }
}

/** Map a non-`completed` stop reason to a human headline for the parent model. */
export function stopReasonError(reason: string): string {
  switch (reason) {
    case 'completed': return ''
    case 'aborted': return 'subagent run was cancelled'
    case 'error': return 'subagent run failed'
    case 'max-tokens': return 'subagent run hit its token limit before finishing'
    case 'refusal': return 'subagent declined the task'
    default: return `subagent run ended abnormally (${reason})`
  }
}

/** Read + parse one agent file, throwing a friendly, roster-aware error. */
export function loadAgent(dir: string, name: string, available: string[]): AgentFile {
  const target = join(dir, `${name}.md`)
  let text: string
  try {
    text = readFileSync(target, 'utf8')
  } catch {
    const hint = available.length > 0 ? `available agents: ${available.join(', ')}` : 'no agents defined in this directory'
    throw new Error(`unknown agent "${name}" — no ${name}.md in ${dir} (${hint})`)
  }
  const parsed = parseAgentMarkdown(text, target)
  if (!parsed.ok) {
    throw new Error(`agent "${name}": ${parsed.error}`)
  }
  return parsed.agent
}

/** The cordis `ctx.tools.register`-ready definition for the `use_agent` tool. */
export function runAgentTool(ctx: Context, cfg: RunAgentConfig) {
  const dir = expandHome(cfg.agentsDir)
  const { rosterText, nameList } = buildRoster(dir)
  const description =
    `Call one of the locally-defined custom agents by name. These are your own ` +
    `custom sub-agents (defined in ${dir}/<name>.md); each runs as its own ` +
    `subagent with its own system prompt and returns its result. ` +
    `Pass the exact agent name and a self-contained prompt (the subagent does ` +
    `not see this conversation, so include everything it needs). ` +
    `If a previous run of the same agent in this conversation was interrupted ` +
    `(error, cancellation, crash, or token limit), the call automatically resumes ` +
    `it from its saved partial work instead of restarting; on a resume the prompt is ` +
    `only shown to the subagent as the reworded request (the original task is already ` +
    `in its context). Pass fresh=true to force a clean restart, or resume=true to ` +
    `require a resume.\n` +
    `Set background=true to start the agent as a durable background conversation ` +
    `instead: the call returns the subagent's id immediately, the agent keeps its ` +
    `session across turns, and you can follow up with ${cfg.askToolName ?? 'ask_agent'} ` +
    `(waits for the reply) or the base send_message (steer only) while the runtime ` +
    `notifies you when the run settles. Background dispatch ignores resume/fresh — ` +
    `it always opens the agent's new conversation.\n` +
    `Available agents:\n${rosterText}`

  return defineTool({
    name: cfg.toolName,
    description,
    parameters: {
      agent: {
        type: 'string',
        required: true,
        description: `The name of the local agent to run. One of: ${nameList}`,
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'The complete, self-contained task for the selected agent.',
      },
      resume: {
        type: 'boolean',
        description:
          'Require continuing this agent\'s previous interrupted run from its saved partial work; fails if none exists. Mutually exclusive with fresh.',
      },
      fresh: {
        type: 'boolean',
        description: 'Force a clean start, ignoring any interrupted previous run of this agent.',
      },
      background: {
        type: 'boolean',
        description:
          'Start the agent as a durable background conversation and return its subagent id immediately instead of waiting for the result. Follow up with ask_agent or send_message. Defaults to the agent file\'s background frontmatter, else false. Mutually exclusive with resume.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true },
          output: { type: 'array', required: true, items: { type: 'json' } },
          subagentId: { type: 'string' },
          label: { type: 'string' },
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
      // Read after registration, in the caller's scope, including this dispatch tool.
      const hostKnownTools = resolveHostToolNames(ctx, scopeOf(parent.ctx ?? ctx))
      if (args.resume === true && args.fresh === true) {
        throw new Error(`${cfg.toolName}: "resume" and "fresh" are mutually exclusive — pass at most one`)
      }
      // Re-check existence at execute time with a friendly, roster-aware error.
      const agent = loadAgent(dir, args.agent, nameList === '' ? [] : nameList.split(',').map((n) => n.trim()))
      // Synthesize the effective model/thinking for this dispatch: the file
      // frontmatter is the BASELINE and a workspace profile pin
      // (`.dsh-profile` → `$DSH_HOME/model-profiles.json` per-agent override)
      // may replace it. Both branches below — resume and fresh — consume the
      // composed values, so a profile switch applies to continuations too.
      const runtime = composeAgentRuntime(args.agent, {
        model: agent.meta.model,
        thinking: agent.meta.thinking,
      })
      const label = agent.meta.displayName ?? args.agent

      // Background dispatch: a durable continuable conversation on the same
      // provider (the alpha.4 interaction model). The call resolves at inbox
      // acceptance with the child's durable id instead of the run result;
      // follow-ups ride ask_agent / send_message and the runtime's settlement
      // notice reports how the conversation ended. The resume machinery stays
      // foreground-only: a background dispatch always opens the agent's NEW
      // conversation (foreground calls keep resuming interrupted one-shot
      // runs of the same agent).
      const wantsBackground = decideBackgroundMode(args.background, agent.meta.background)
      if (wantsBackground && args.resume === true) {
        throw new Error(
          `${cfg.toolName}: "background" and "resume" are mutually exclusive — a background dispatch always starts the agent's new conversation`,
        )
      }
      if (wantsBackground) {
        const { label: _requestLabel, ...request } = buildStartRequest({
          agentName: args.agent,
          prompt: args.prompt,
          parent,
          persona: agent.body,
          deep: agent.meta.deep,
          toolName: cfg.toolName,
          leafDenyTools: cfg.leafDenyTools,
          hostKnownTools,
          model: runtime.model,
          displayName: agent.meta.displayName,
          thinking: runtime.thinking as ThinkingLevel | undefined,
        })
        const { childId } = typeof ctx.subagents.startActivation === 'function'
          ? await activateWithReservedComposition(ctx, cfg.provider, label, request, exec.signal, 'parent', parent)
          : await legacySubagents(ctx).startContinuable({
              provider: cfg.provider,
              label,
              request,
              signal: exec.signal,
            })
        const followUpTool = cfg.askToolName ?? 'ask_agent'
        return {
          kind: 'agent-start' as const,
          subagentId: String(childId),
          label,
          output: [
            {
              type: 'text',
              text:
                `Started background agent "${label}" (durable subagent id ${String(childId)}). ` +
                `It is now working on the task in its own conversation, so continue your own work in parallel. ` +
                `Send follow-ups with ${followUpTool} (waits for the reply) or send_message (delivery only), ` +
                `addressing it by agent name "${label}" or by id ${String(childId)}. ` +
                `A runtime notice will report how this run settled.`,
            },
          ] as unknown as JsonValue[],
        }
      }

      // Resume decision: continue the parent's latest interrupted run of this
      // agent from its persisted partial log (see ./resume.ts). An explicit
      // resume=true overrides a deployment-level 'off'; everything else
      // follows the configured mode. Lookup is skipped entirely when it
      // cannot change the outcome.
      const configuredMode: ResumeMode = cfg.resume ?? 'auto'
      const effectiveMode: ResumeMode =
        configuredMode === 'off' && args.resume === true ? 'opt-in' : configuredMode
      const candidate =
        effectiveMode === 'off' || args.fresh === true
          ? undefined
          : await findResumableRun(ctx, parent, label, exec.signal)
      const decision = decideResume(effectiveMode, {
        explicitResume: args.resume === true,
        explicitFresh: args.fresh === true,
        hasCandidate: candidate !== undefined,
      })
      if (decision === 'explicit-resume-unavailable') {
        throw new Error(
          `${cfg.toolName}: resume requested, but no interrupted prior run of agent "${args.agent}" was found for this conversation ` +
          `(a prior run only counts while its last turn ended abnormally) — call again without "resume" to start fresh`,
        )
      }

      if (decision === 'resume' && candidate !== undefined) {
        const modelOptions = splitModel(runtime.model ?? '')
        const resumeOptions = {
          ...modelOptions,
          ...(runtime.thinking !== undefined
            ? { reasoningEffort: runtime.thinking as ReasoningEffortId }
            : {}),
        }
        const resumed = await driveResumedRun({
            ctx,
            parent,
            childId: candidate.childId,
            persona: agent.body,
            toolFilter:
              agent.meta.deep === 0
                ? { deny: [...leafDenyList(cfg.toolName, cfg.leafDenyTools, hostKnownTools)] }
                : undefined,
            agentOptions: Object.keys(resumeOptions).length > 0 ? resumeOptions : undefined,
            continuationPrompt: buildContinuationPrompt(candidate.classification.endedAs, args.prompt),
            noticeSummary: `resume interrupted "${args.agent}" subagent run`,
            signal: exec.signal,
        })
        if (resumed.stopReason !== 'completed') {
          const text = textOf(resumed.output as unknown as readonly unknown[])
          const headline =
            `${stopReasonError(String(resumed.stopReason))} (agent "${args.agent}", resumed from interrupted run)`
          throw new Error(
            text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`,
          )
        }
        const provenance =
          `Resumed from the interrupted prior run of agent "${args.agent}" ` +
          `(session ${String(candidate.childId)}; ${candidate.classification.endedAs}); ` +
          `the subagent kept its earlier partial work and continued from there.`
        return {
          kind: 'agent-result' as const,
          output: [{ type: 'text', text: provenance }, ...resumed.output] as unknown as JsonValue[],
        }
      }

      // persona = the file's body (system prompt); `deep` semantics, model
      // routing, and the frontmatter `thinking` effort (native
      // agentOptions.reasoningEffort) are applied by the pure builder (see
      // buildStartRequest).
      const { label: _requestLabel, ...request } = buildStartRequest({
        agentName: args.agent,
        prompt: args.prompt,
        parent,
        persona: agent.body,
        deep: agent.meta.deep,
        toolName: cfg.toolName,
        leafDenyTools: cfg.leafDenyTools,
        hostKnownTools,
        model: runtime.model,
        displayName: agent.meta.displayName,
        thinking: runtime.thinking as ThinkingLevel | undefined,
      })
      const signal = exec.signal

      const run = typeof ctx.subagents.startActivation === 'function'
        ? await activateWithReservedComposition(ctx, cfg.provider, foregroundLabel(label), request, signal, 'caller', parent)
        : await startLegacyForeground(ctx, cfg.provider, { ...request, label, signal })
      return {
        kind: 'agent-result' as const,
        // settleForegroundRun always disposes the run, even when result
        // rejects; a non-`completed` stop reason is surfaced as the error.
        // ContentBlock[] → the tool contract's JsonValue[] (structural cast).
        output: (await settleForegroundRun(ctx, run, args.agent, signal)) as unknown as JsonValue[],
      }
    },
  })
}
