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
import { basename, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
// Type-only (erased at emit): alpha.3 moved JsonValue out of dsh-session to
// dsh-util-values — the same module dsh-tools itself sources it from.
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ContentBlock, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { resolveChildDepth, type SubagentResult, type SubagentStartRequest, type SubagentActivation, type SubagentActivationSpec } from '@deepseek-ai/dsh-subagent'
import type { Language } from './preset-contract.ts'
import {
  BUILTIN_AGY_ID,
  builtinAgyRosterLine,
  resolveBuiltinAgy,
  type BuiltinAgyDefinition,
} from './builtin-agy.ts'
import { ACP_CODES, AcpError, acpErrorText, classifyAcpError } from './acp/errors.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { scopeOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { assertTopLevelCaller, recordRegistryChild, releaseRegistryChild } from './caller-guard.ts'
import {
  legacySubagents,
  rc2ChildSurface,
  reserveChildComposition,
  releaseChildComposition,
  type ChildComposition,
  type DispatchRequest,
} from './host-compat.ts'
import { expandHome, listAgentFiles, parseAgentMarkdown, type AgentFile, type ThinkingLevel } from './agents-dir.ts'
import { composeAgentRuntime } from './profile-resolution.ts'
import { decideBackgroundMode } from './interactive.ts'
import type { VolatileRef } from './ptc/config.ts'
import {
  buildContinuationPrompt,
  decideResume,
  driveResumedRun,
  findResumableRun,
  foregroundLabel,
  accountingTurnEnd,
  readStoredEvents,
  type ResumeMode,
} from './resume.ts'

/**
 * The `disabledAgents` config value in either shape it arrives in: the live
 * volatile reference the loader hands `apply` (hot-swapped on a settings
 * write), or a plain array (tests, hand-built configs). Absent = nothing
 * disabled.
 */
export type DisabledAgentsInput = VolatileRef<readonly string[]> | readonly string[] | undefined

/** Read the current disabled-agent list out of either input shape. */
export function currentDisabledAgents(input: DisabledAgentsInput): readonly string[] {
  if (input === undefined) return []
  const ref = input as VolatileRef<readonly string[]>
  if (typeof ref.get === 'function') return ref.get() ?? []
  return input as readonly string[]
}

/** Whether one agent name is toggled off through the `disabledAgents` key. */
export function isAgentDisabled(name: string, input: DisabledAgentsInput): boolean {
  return currentDisabledAgents(input).includes(name)
}

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
   * Extra deny names installed on EVERY child, unioned with the mandatory
   * spawn-tool list (including this plugin's own `toolName`). Children can
   * never call subagents; this lets a deployment deny additional spawners.
   */
  leafDenyTools?: readonly string[]
  /**
   * The follow-up tool's registered name (`ask_agent` by default), referenced
   * in the background dispatch's guidance text. Informational only.
   */
  askToolName?: string
  /**
   * Agent names excluded from the roster (`disabledAgents` config key, the
   * `/registry-config` command's toggle). A pure configuration filter: a disabled
   * agent's `<name>.md` stays on disk untouched — it just disappears from the
   * tool description roster, and an execute-time re-check refuses to run it
   * even when the model names it directly.
   */
  disabledAgents?: DisabledAgentsInput
  /**
   * Experimental built-in `agy` member wiring. Absent means the built-in is
   * never visible (the default); the switch is non-volatile so a flip remounts
   * the plugin, while the resolver cache is filled asynchronously at inject
   * time. The host manager resolves `cwd`; this seam only decides visibility.
   */
  agy?: {
    enabled: boolean
    resolveExecutable: (name: string) => string | undefined
  }
  /**
   * Default ACP model family for the built-in agy member (`agyModel` config key,
   * volatile). Empty/undefined means agy's own default; a per-call `agyModel`
   * argument on `use_agent` overrides this value.
   */
  agyModel?: string
  /** UI language for the built-in member's localized roster line. */
  language?: Language
}

/** Inputs of the built-in member visibility check (pure, injected seams). */
export interface AgyRoutingInput {
  enabled: boolean
  resolveExecutable: (name: string) => string | undefined
  disabledAgents?: DisabledAgentsInput
  language?: Language
}

/**
 * Resolve the built-in definition ignoring the roster toggle — execute needs
 * this shape so a model that hard-names a toggled-off agy gets the same
 * "disabled" error as any other agent instead of "unknown agent". A user-owned
 * `agy.md` (valid OR broken) always shadows the built-in; the async executable
 * lookup lives in the caller's cached resolver.
 */
export function builtinAgyIgnoringToggle(dir: string, input: AgyRoutingInput): BuiltinAgyDefinition | undefined {
  if (input.enabled !== true) return undefined
  const { agents, broken } = listAgentFiles(dir)
  const userNames = new Set(agents.map((agent) => agent.meta.name))
  for (const file of broken) userNames.add(basename(file.path, '.md'))
  return resolveBuiltinAgy({
    language: input.language ?? 'zh',
    enabled: true,
    resolveExecutable: input.resolveExecutable,
    parseUserAgent: (name) => (userNames.has(name) ? { ok: true } : undefined),
  })
}

/** Resolve the built-in agy definition visible in the roster (toggle applied). */
export function visibleBuiltinAgy(dir: string, input: AgyRoutingInput): BuiltinAgyDefinition | undefined {
  const definition = builtinAgyIgnoringToggle(dir, input)
  if (definition === undefined) return undefined
  if (currentDisabledAgents(input.disabledAgents).includes(BUILTIN_AGY_ID)) return undefined
  return definition
}

/** Collect the built-in agy inputs from the tool config into the pure seam. */
function agyRoutingOf(cfg: RunAgentConfig): AgyRoutingInput {
  return {
    enabled: cfg.agy?.enabled === true,
    resolveExecutable: cfg.agy?.resolveExecutable ?? (() => undefined),
    disabledAgents: cfg.disabledAgents,
    language: cfg.language,
  }
}

/**
 * Every known agent-spawning tool name in the dsh base distribution, PLUS this
 * plugin's own configurable `use_agent` tool name (registered separately
 * through `RunAgentConfig.toolName`). Every child gets all of these denied:
 * subagents cannot call subagents. `dsh-tool-workflow` fans work out across
 * many subagents and `dsh-tool-ralph` starts a fresh child every round, so
 * both are agent-spawning even though they are not `subagent`-named.
 * `send_message`/`interrupt_agent`/`list_agents` only address already-running
 * children, so they stay visible.
 */
export const SPAWN_TOOL_NAMES = [
  // dsh-base patch: dsh-tool-subagent registered with these toolNames.
  'subagent',
  'subagent_fork',
  'subagent_codex',
  'subagent_claude_code',
  // dsh-base patch: dsh-tool-workflow (toolName default 'workflow', spawn).
  'workflow',
  // dsh-base patch: dsh-tool-ralph (fixed tool name 'ralph', fresh children).
  'ralph',
] as const

/**
 * The deny list installed on EVERY child, at fresh dispatch and again at
 * resume: the mandatory spawn-tool names unioned with this plugin's own
 * `toolName` and the caller's `leafDenyTools` (so a customized tool name or a
 * deployment-specific spawner is always covered). Duplicates are collapsed.
 *
 * `hostKnown` is the host's currently-registered global tool names (see
 * `resolveHostToolNames`); when provided, the union is intersected with it.
 * The stock spawn-tool names are a static enumeration over a distribution
 * whose composition moves — dsh 0.1.7-rc.1 stopped registering
 * `dsh-tool-ralph` while its `tools.restrict()` became fail-fast on unknown
 * names, so passing a stale name verbatim aborts the whole spawn. The
 * mandatory union is what we WANT denied; the intersection is what the host
 * will accept without a fail-fast restriction error.
 */
export function leafDenyList(
  toolName: string,
  leafDenyTools?: readonly string[],
  hostKnown?: ReadonlySet<string>,
): readonly string[] {
  const union = [...new Set([...SPAWN_TOOL_NAMES, toolName, ...(leafDenyTools ?? [])])]
  return hostKnown ? union.filter(name => hostKnown.has(name)) : union
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

// ---------------------------------------------------------------------------
// Diagnostics: mandatory spawners dropped by the host intersection, and inert
// nesting fields. Both are warnings only — neither changes a dispatch.
// ---------------------------------------------------------------------------

/** Mandatory spawn-tool names the host does NOT register (so the intersect
 * in {@link leafDenyList} drops them). `undefined` means the host exposed no
 * restrictable-name view, so no intersection — and no drop — happened. */
export function missingSpawnTools(hostKnown?: ReadonlySet<string>): readonly string[] {
  if (hostKnown === undefined) return []
  return SPAWN_TOOL_NAMES.filter(name => !hostKnown.has(name))
}

/** Stable diagnostic text for the mandatory names the host cannot deny. */
export function spawnToolWarningMessage(missing: readonly string[]): string {
  return (
    `dsh-subagent-registry: the host does not register mandatory spawn tool(s) ${missing.join(', ')}; ` +
    `they are dropped from the child deny list by the host-known intersection — verify the host cannot re-expose them`
  )
}

/** Emit a diagnostic through the host logger when present, else console.warn. */
function emitDiagnostic(ctx: Context, message: string): void {
  const logger = (ctx as unknown as { logger?: { warn?: (message: string) => void } }).logger
  if (logger != null && typeof logger.warn === 'function') logger.warn(message)
  else console.warn(message)
}

/**
 * Warn whenever the host-known intersection drops a mandatory spawn tool.
 * Silently losing a name would let a child keep a spawner the plugin promised
 * to deny, so the omission is always reported. No-op when the host view is
 * unavailable (the deny list is then passed verbatim, nothing is dropped).
 */
export function warnMissingSpawnTools(ctx: Context, hostKnown?: ReadonlySet<string>): void {
  const missing = missingSpawnTools(hostKnown)
  if (missing.length === 0) return
  emitDiagnostic(ctx, spawnToolWarningMessage(missing))
}

/** Inert nesting fields that are explicitly set and therefore deprecated. */
export function deprecatedDelegationFields(input: {
  deepDeclared?: boolean
  maxDepth?: unknown
}): readonly string[] {
  const fields: string[] = []
  if (input.deepDeclared === true) fields.push('deep')
  if (input.maxDepth !== undefined) fields.push('maxDepth')
  return fields
}

/** Stable deprecation text; the fields remain parsed/validated but inert. */
export function delegationDeprecationMessage(fields: readonly string[]): string {
  return (
    `dsh-subagent-registry: ${fields.join(' and ')} is deprecated and inert ` +
    `(subagents cannot spawn subagents); remove it from the agent frontmatter / start request`
  )
}

/** Warn for deprecated nesting fields. The dispatch is unchanged. */
export function warnDeprecatedDelegation(ctx: Context, input: {
  deepDeclared?: boolean
  maxDepth?: unknown
}): void {
  const fields = deprecatedDelegationFields(input)
  if (fields.length === 0) return
  emitDiagnostic(ctx, delegationDeprecationMessage(fields))
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

/**
 * Build the static roster (agents already sorted by listAgentFiles).
 * `disabledAgents` names are excluded entirely — the toggle is a roster
 * filter, never a file operation (see {@link RunAgentConfig.disabledAgents}).
 */
function buildRoster(dir: string, cfg: RunAgentConfig): Roster {
  const { agents, broken } = listAgentFiles(dir)
  const disabledAgents = cfg.disabledAgents
  const lines = agents
    .filter((agent) => !isAgentDisabled(agent.meta.name, disabledAgents))
    .map((agent) => {
      const label = agent.meta.displayName !== undefined
        ? `${agent.meta.name} (${agent.meta.displayName})`
        : agent.meta.name
      return `- ${label}: ${sanitizeDescription(agent.meta.description ?? '')}`
    })
  const names = agents
    .filter((agent) => !isAgentDisabled(agent.meta.name, disabledAgents))
    .map((agent) => agent.meta.name)
  // Built-in external member: only when enabled, resolvable, not toggled off,
  // and no user-owned agy.md shadows it (valid or broken).
  const agy = visibleBuiltinAgy(dir, agyRoutingOf(cfg))
  if (agy !== undefined) {
    lines.push(builtinAgyRosterLine(agy))
    names.push(agy.name)
  }
  if (broken.length > 0) {
    lines.push(`- (unparsable agents excluded: ${broken.map((b) => b.path).join(', ')})`)
  }
  return { rosterText: lines.join('\n'), nameList: names.join(', ') }
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
  /** @deprecated Inert compatibility field: parsed from frontmatter, no longer read (subagents cannot spawn subagents). */
  deep: number
  /** This plugin's registered tool name (always denied on children). */
  toolName: string
  /** Optional extra deny names, unioned with the mandatory spawn-tool list. */
  leafDenyTools?: readonly string[]
  /**
   * The host's registered global tool names (`resolveHostToolNames`), used to
   * intersect the deny list — see `leafDenyList`.
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
 * Build the one-shot subagent start request for one custom agent.
 *
 * Every child gets a `toolFilter` deny list that removes every agent-spawning
 * tool from its registry (the in-process driver applies it as a scoped
 * `tools.restrict()` in the creation window, so the tools vanish from the
 * prompt AND refuse to execute). The child keeps its full non-spawn tool set.
 * `deep` is an inert compatibility field: it no longer produces a `maxDepth`
 * or any nested spawn capability — subagents cannot call subagents.
 */
export function buildStartRequest(input: BuildStartRequestInput): Omit<SubagentStartRequest, 'signal'> & ChildComposition {
  const { agentName, prompt, parent, persona, toolName, leafDenyTools, hostKnownTools, model, displayName, thinking } = input
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
    // Every child: strip every spawn capability. No maxDepth — nested
    // subagents are unsupported, not depth-budgeted.
    toolFilter: {
      deny: [...leafDenyList(toolName, leafDenyTools, hostKnownTools)],
    },
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

/**
 * Caller cancellation owns accepted foreground work until teardown finishes.
 * The activation result is raced against an abort promise: a rejection is
 * synchronous (never waits for a run that hangs after cancellation), the race
 * settles once, and `dispose()` is idempotent. The child's own output blocks
 * are returned verbatim — no provenance block, no aggregation.
 */
async function settleForegroundRun(ctx: Context, run: ForegroundRun, agentName: string, signal: AbortSignal): Promise<readonly ContentBlock[]> {
  let disposal: Promise<void> | undefined
  const dispose = () => disposal ??= Promise.resolve().then(() => run.dispose())
  let abortHandled = false
  let rejectAbort!: (error: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => {
    if (abortHandled) return
    abortHandled = true
    if (run.cancel) run.cancel()
    else void dispose().catch(() => {})
    rejectAbort(new DOMException('subagent run aborted', 'AbortError'))
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  const [execution] = await Promise.allSettled([
    Promise.race([
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
      aborted,
    ]),
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

/** Start one fresh child on a legacy host: the service's one-shot result, no descendant join or drain. */
async function startLegacyForeground(
  ctx: Context,
  provider: string,
  request: SubagentStartRequest & ChildComposition,
  parent: Agent,
): Promise<ForegroundRun> {
  // Identity first: a child that reached this handler must not make the host
  // create another child, even on the legacy start path.
  assertTopLevelCaller({ agent: parent })
  const run = await legacySubagents(ctx).start(provider, request)
  recordRegistryChild(run.id)
  return {
    childId: run.id,
    result: run.result,
    ...(run.localAgent !== undefined ? { cancel: () => run.localAgent?.cancel({ kind: 'parent' }) } : {}),
    dispose: async () => {
      releaseRegistryChild(run.id)
      await run.dispose()
    },
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
  // Identity first: no id reservation, composition record or host call for a
  // nested / unverifiable caller.
  assertTopLevelCaller({ agent: parent })
  const childId = randomUUID() as SessionId
  reserveChildComposition(childId, parent.id, {
    persona: request.persona,
    ...(request.toolFilter !== undefined ? { toolFilter: request.toolFilter } : {}),
  })
  try {
    // 0.2.2-rc.2 flattened `SubagentActivationSpec`: the start-request fields
    // ride the spec itself; pre-rc.2 lines read the nested `request`. The
    // dispatch object carries this plugin's `ChildComposition` extras either
    // way — every host generation ignores what it does not know — and the
    // reserved `childId` reaches the spec on both shapes. The cast is the
    // cross-generation wire contract, not a narrowing dodge.
    const spec = (rc2ChildSurface(ctx)
      ? { provider, label, childId, signal, delivery, ...request }
      : { provider, label, childId, signal, delivery, request }) as SubagentActivationSpec
    return await ctx.subagents.startActivation(spec)
  } catch (error) {
    releaseChildComposition(childId)
    throw error
  }
}

/**
 * Start one external one-shot activation (the built-in `agy` member) with the
 * MINIMAL spec: no `childId`, no `name`, no `persona`/`toolFilter` reservation.
 * Those fields belong to in-process children; an external provider rejects
 * a reserved childId as UNSUPPORTED_CAPABILITY and has no local Agent to carry
 * a parked composition. The persona is inlined into `prompt` by the caller.
 *
 * `model` is an optional per-dispatch model family for the built-in agy member.
 * It rides as an extra spec field (not `agentOptions`, which this provider does
 * not advertise) and the host manager forwards it verbatim to `provider.start`.
 */
export async function activateExternal(
  ctx: Context,
  provider: string,
  label: string,
  prompt: ContentBlock[],
  signal: AbortSignal,
  delivery: 'parent' | 'caller',
  parent: Agent,
  model?: string,
): Promise<SubagentActivation> {
  assertTopLevelCaller({ agent: parent })
  const spec: SubagentActivationSpec & { model?: string } = { provider, label, prompt, parent, signal, delivery }
  if (model !== undefined && model !== '') spec.model = model
  return await ctx.subagents.startActivation(spec)
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
  // Roster snapshot for the static description: disabled agents are excluded
  // at build time (refreshRoster rebuilds the definition when the toggle
  // changes). The execute-time check below re-reads the live value, so a
  // hot-swap takes effect immediately even before the description refreshes.
  const { rosterText, nameList } = buildRoster(dir, cfg)
  const agyMember = visibleBuiltinAgy(dir, agyRoutingOf(cfg))
  // S7: use_agent itself is concurrency-safe, but agy runs are capped and
  // over-cap calls fail immediately — teach the model to dispatch one at a time.
  // A stopped agy run is a user decision, not a transient failure: suppress the
  // model's tendency to re-dispatch on its own after a cancellation settlement.
  const agyNote = agyMember === undefined ? '' :
    `\nExternal member "${agyMember.name}" (${agyMember.displayName}) runs over ACP as a one-shot foreground worker: ` +
    `no background/follow-up/resume, self-contained prompt required. Dispatch agy tasks ONE AT A TIME — ` +
    `this tool is concurrency-safe, but agy runs are capped (see agyMaxConcurrent); a second parallel call ` +
    `over the cap fails immediately with ACP_BUSY.` +
    `\nPass agyModel to pick a model family for this one call (a valid ACP model family such as ` +
    `"claude-sonnet-5-5"); it overrides the agyModel config key and is refused for any other agent.` +
    `\nA cancelled agy run is NOT a transient error: if the user pressed stop, or the result says the run ` +
    `was cancelled/aborted (ACP_ABORTED / "subagent run was cancelled") — do NOT retry the same task on ` +
    `your own. Report the cancellation and wait for the user's instruction; re-dispatch only if the user ` +
    `explicitly asks for it.`
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
    `it always opens the agent's new conversation.${agyNote}\n` +
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
      agyModel: {
        type: 'string',
        description:
          'Optional model family for the built-in agy member only, e.g. "claude-sonnet-5-5" (no thinking-tier suffix). Overrides the agyModel plugin config for this call; passing it for any other agent is an error.',
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
      // Identity first: a child (registry-spawned or host-forked) or any caller
      // whose identity cannot be verified is refused before any host read,
      // file read, record write or event emission.
      assertTopLevelCaller(exec)
      const parent = exec.agent as Agent
      // Read after registration, in the caller's scope, including this dispatch tool.
      const hostKnownTools = resolveHostToolNames(ctx, scopeOf(parent.ctx ?? ctx))
      // A mandatory spawner missing from the host's restrictable names is
      // dropped by the intersection below; report it instead of losing it
      // silently. No-op when the host view is unavailable (nothing dropped).
      warnMissingSpawnTools(ctx, hostKnownTools)
      if (args.resume === true && args.fresh === true) {
        throw new Error(`${cfg.toolName}: "resume" and "fresh" are mutually exclusive — pass at most one`)
      }
      // Built-in external agy has NO agent file: route BEFORE loadAgent so a
      // valid dispatch never collapses into `unknown agent "agy"`. A user-owned
      // agy.md shadows this branch and follows the ordinary in-process path.
      const routableAgy = builtinAgyIgnoringToggle(dir, agyRoutingOf(cfg))
      const isBuiltinAgy = routableAgy !== undefined && args.agent === BUILTIN_AGY_ID
      const perCallModel = typeof args.agyModel === 'string' && args.agyModel !== '' ? args.agyModel : undefined
      if (perCallModel !== undefined && !isBuiltinAgy) {
        throw new Error('agyModel only applies to the built-in agy member')
      }
      if (isBuiltinAgy) {
        if (isAgentDisabled(args.agent, cfg.disabledAgents)) {
          throw new Error(
            `agent "${args.agent}" is disabled by the disabledAgents plugin config ` +
            `(roster toggle; the built-in agy member stays defined) — enable it via the /registry-config command ` +
            `or remove it from the disabledAgents list in the plugin entry config`,
          )
        }
        // Foreground one-shot only: no background/resume/fresh. Pre-release
        // failure → full ACP_* text via assert.rejects-friendly Error.
        if (args.background === true || args.resume === true || args.fresh === true) {
          throw new Error(acpErrorText(classifyAcpError({ code: ACP_CODES.FOREGROUND_ONLY }, 'process')))
        }
        // persona inline: the external provider has no local Agent to carry a
        // parked composition, so the brief rides the user prompt verbatim.
        const promptText = `${routableAgy.body}\n\n---\n\n${args.prompt}`
        let activation: SubagentActivation
        try {
          activation = await activateExternal(
            ctx, 'registry-acp', routableAgy.displayName,
            [{ type: 'text', text: promptText }], exec.signal, 'parent', parent,
            perCallModel ?? cfg.agyModel,
          )
        } catch (error) {
          // A pre-publication provider failure carries its own code/copy.
          if (error instanceof AcpError) throw new Error(acpErrorText(error), { cause: error })
          throw error
        }
        // Reuse the existing foreground settle: it waits for dispose() before
        // throwing, consumes the child diagnostic and returns child output
        // verbatim (including the provider's source header).
        return {
          kind: 'agent-result' as const,
          output: (await settleForegroundRun(ctx, activation, args.agent, exec.signal)) as unknown as JsonValue[],
        }
      }
      // Re-check existence at execute time with a friendly, roster-aware error.
      const agent = loadAgent(dir, args.agent, nameList === '' ? [] : nameList.split(',').map((n) => n.trim()))
      // `deep` (and any `maxDepth` a caller carries) stay inert, but an
      // explicit declaration now earns a one-line deprecation warning.
      warnDeprecatedDelegation(ctx, { deepDeclared: agent.meta.deepDeclared })
      // Re-check the toggle at execute time against the LIVE disabledAgents
      // value: the description's roster snapshot may lag a hot-swap, and a
      // model that hard-names a disabled agent must be refused here — the
      // file stays on disk, only the call is rejected.
      if (isAgentDisabled(args.agent, cfg.disabledAgents)) {
        throw new Error(
          `agent "${args.agent}" is disabled by the disabledAgents plugin config ` +
          `(roster toggle; the ${args.agent}.md file is untouched) — enable it via the /registry-config command ` +
          `or remove it from the disabledAgents list in the plugin entry config`,
        )
      }
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
        // Register the durable id in the registry-child record even on a legacy
        // host (where no composition reservation exists). The activation path
        // already records it; re-recording is idempotent.
        recordRegistryChild(childId)
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
            // Every child (fresh or resumed) loses every spawn tool.
            toolFilter: { deny: [...leafDenyList(cfg.toolName, cfg.leafDenyTools, hostKnownTools)] },
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

      // persona = the file's body (system prompt); model routing and the
      // frontmatter `thinking` effort (native agentOptions.reasoningEffort)
      // are applied by the pure builder (see buildStartRequest). `deep` is an
      // inert compatibility field.
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
        : await startLegacyForeground(ctx, cfg.provider, { ...request, label, signal }, parent)
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
