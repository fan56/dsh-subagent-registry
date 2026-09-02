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
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
// Type-only (erased at emit): alpha.3 moved JsonValue out of dsh-session to
// dsh-util-values — the same module dsh-tools itself sources it from.
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ContentBlock, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { resolveChildDepth, type SubagentRun, type SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { expandHome, listAgentFiles, parseAgentMarkdown, type AgentFile, type ThinkingLevel } from './agents-dir.ts'
import { composeAgentRuntime } from './profile-resolution.ts'
import {
  buildContinuationPrompt,
  decideResume,
  driveResumedRun,
  findResumableRun,
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
 */
export function leafDenyList(toolName: string, leafDenyTools?: readonly string[]): readonly string[] {
  return leafDenyTools !== undefined && leafDenyTools.length > 0
    ? leafDenyTools
    : [...SPAWN_TOOL_NAMES, toolName]
}

/** Join text blocks from a canonical block array without trusting values. */
function textOf(output: readonly unknown[]): string {
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
 *   level deeper before their own per-request caps (native subagent tools
 *   default `maxDepth: 3`) take over as the recursion backstop.
 */
export function buildStartRequest(input: BuildStartRequestInput): Omit<SubagentStartRequest, 'signal'> {
  const { agentName, prompt, parent, persona, deep, toolName, leafDenyTools, model, displayName, thinking } = input
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
  const request: Omit<SubagentStartRequest, 'signal'> = {
    label: displayName ?? agentName,
    prompt: [{ type: 'text', text: prompt }],
    parent: parent as Parameters<typeof resolveChildDepth>[0],
    persona,
    ...(deep === 0
      ? {
          // Leaf: strip every spawn capability; no maxDepth at all.
          toolFilter: {
            deny: [...leafDenyList(toolName, leafDenyTools)],
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

/**
 * Collect and release one foreground subagent run without letting disposal
 * replace an independent result failure (mirrors the dsh-tool-subagent
 * `settleForegroundRun` pattern, adapted to this tool's error wording).
 *
 * The run's `result` is awaited through its own `.then()` and `dispose()` is
 * settled separately via `Promise.allSettled`, so a rejecting `result` still
 * guarantees `dispose()` runs, and a rejecting `dispose()` never masks a more
 * meaningful `result` failure. When both fail, both errors are surfaced as an
 * AggregateError.
 */
async function settleForegroundRun(run: SubagentRun, agentName: string): Promise<ContentBlock[]> {
  const [execution] = await Promise.allSettled([
    run.result.then((result) => {
      if (result.stopReason !== 'completed') {
        const text = textOf(result.output)
        const headline = `${stopReasonError(String(result.stopReason))} (agent "${agentName}")`
        const parts = [text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`]
        // The seam carries no failure detail on a plain `error`; the local
        // child's terminal turn/end reason is the only place the real cause
        // survives, so surface it when it exists.
        if (result.stopReason === 'error') {
          const underlying = childTurnError(run)
          if (underlying !== undefined) parts.push(`Child's turn/end error: ${underlying}`)
        }
        throw new Error(parts.join('\n'))
      }
      return result.output
    }),
  ])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [execution.reason, disposal.reason],
        `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw execution.reason
  }
  if (disposal.status === 'rejected') throw disposal.reason
  return execution.value
}

/**
 * Pull the child's own terminal failure out of its session log. The subagent
 * seam only reports `stopReason: 'error'` with no failure detail, but a local
 * in-process child records the structured `turn/end` reason verbatim; a remote
 * child exposes nothing and yields `undefined`.
 */
function childTurnError(run: SubagentRun): string | undefined {
  const agent = run.localAgent
  if (agent === undefined) return undefined
  try {
    const events = agent.session.snapshotEvents()
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (event.type !== 'turn/end') continue
      const reason = event.data.reason
      if (reason.kind !== 'error') continue
      const message = reason.error.message
      if (message.trim().length > 0) return message
    }
  } catch {
    // The session may already be detached; the headline still carries the failure.
  }
  return undefined
}

/** Map a non-`completed` stop reason to a human headline for the parent model. */
function stopReasonError(reason: string): string {
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
function loadAgent(dir: string, name: string, available: string[]): AgentFile {
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
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'agent-result' },
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
        let resumed: Awaited<ReturnType<typeof driveResumedRun>>
        try {
          resumed = await driveResumedRun({
            ctx,
            parent,
            childId: candidate.childId,
            persona: agent.body,
            toolFilter:
              agent.meta.deep === 0
                ? { deny: [...leafDenyList(cfg.toolName, cfg.leafDenyTools)] }
                : undefined,
            agentOptions: Object.keys(resumeOptions).length > 0 ? resumeOptions : undefined,
            continuationPrompt: buildContinuationPrompt(candidate.classification.endedAs, args.prompt),
            noticeSummary: `resume interrupted "${args.agent}" subagent run`,
            signal: exec.signal,
          })
        } catch (error) {
          // Fail-open for the drive too, not just the lookup: a resume that
          // cannot even start (concurrent duplicate resume raced us to the
          // session id, persistence load failed after inspection, setup rolled
          // back) degrades to a fresh dispatch — unless resume was explicitly
          // requested, or the caller is gone, in which case the original
          // error is the honest answer. A turn that RAN and ended badly is
          // not an infrastructure failure: it is settled below, preserving
          // the partial work, and never silently restarted.
          if (args.resume === true || exec.signal.aborted) throw error
          const freshRequest = buildStartRequest({
            agentName: args.agent,
            prompt: args.prompt,
            parent,
            persona: agent.body,
            deep: agent.meta.deep,
            toolName: cfg.toolName,
            leafDenyTools: cfg.leafDenyTools,
            model: runtime.model,
            displayName: agent.meta.displayName,
            thinking: runtime.thinking as ThinkingLevel | undefined,
          })
          const run = await ctx.subagents.start(cfg.provider, { ...freshRequest, signal: exec.signal })
          return {
            kind: 'agent-result' as const,
            output: [
              { type: 'text', text: `Resume of the interrupted prior run failed (${String(error)}); started a fresh run instead.` },
              ...await settleForegroundRun(run, args.agent),
            ] as unknown as JsonValue[],
          }
        }
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
      const request = buildStartRequest({
        agentName: args.agent,
        prompt: args.prompt,
        parent,
        persona: agent.body,
        deep: agent.meta.deep,
        toolName: cfg.toolName,
        leafDenyTools: cfg.leafDenyTools,
        model: runtime.model,
        displayName: agent.meta.displayName,
        thinking: runtime.thinking as ThinkingLevel | undefined,
      })
      const signal = exec.signal

      const run = await ctx.subagents.start(cfg.provider, { ...request, signal })
      return {
        kind: 'agent-result' as const,
        // settleForegroundRun always disposes the run, even when result
        // rejects; a non-`completed` stop reason is surfaced as the error.
        // ContentBlock[] → the tool contract's JsonValue[] (structural cast).
        output: (await settleForegroundRun(run, args.agent)) as unknown as JsonValue[],
      }
    },
  })
}
