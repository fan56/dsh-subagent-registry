/**
 * dsh-subagent-registry — register locally-defined custom agents.
 *
 * At session startup this plugin registers the `use_agent` tool (configurable
 * via `toolName`). The tool lets the main-conversation model call any agent
 * defined in `~/.dsh/agents/<name>.md` by name, running it as its own
 * subagent (with the file body as its persona, through the already-assembled
 * `spawn` provider). No patch to the dsh base's own tool-subagent; the roster
 * is surfaced directly in the tool description so the model can dispatch by
 * name.
 *
 * @module dsh-subagent-registry
 */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { expandHome } from './agents-dir.ts'
import { seedBundledAgents } from './seed-defaults.ts'
import { runAgentTool, type RunAgentConfig } from './tool-run-agent.ts'

export const name = 'dsh-subagent-registry'

/**
 * Tool injection seam + the subagent (provider) seam + the agent factory seam
 * (`ctx.agents.resume` drives interrupted-run continuation), like
 * dsh-tool-subagent plus the resume dependency.
 */
export const inject = ['tools', 'subagents', 'agents']

/**
 * Plugin config. `agentsDir` defaults to `~/.dsh/agents`, `provider` reuses
 * dsh-base's already-assembled `spawn` provider, `toolName` names the tool,
 * `leafDenyTools` overrides the tool list removed from `deep: 0` (leaf)
 * agents' children (default: all agent-spawning tools in the dsh base
 * distribution plus `toolName` itself), and `resume` selects when `use_agent`
 * continues a prior interrupted run of the same agent (default `auto`).
 */
export const Config = z.object({
  agentsDir: z.string().default('~/.dsh/agents'),
  provider: z.string().default('spawn'),
  toolName: z.string().default('use_agent'),
  leafDenyTools: z.array(z.string()).default([]),
  resume: z.union(['auto', 'opt-in', 'off']).default('auto'),
})

export function apply(ctx: Context, config: RunAgentConfig): void {
  // One-time seeding of the bundled default roster (workhorse / oldfox /
  // rubber-duck) into the configured agents dir: a fresh install starts
  // with a usable roster. Runs synchronously BEFORE the tool registers, so
  // the roster the model sees already includes the defaults; runs only
  // while the dir holds no agents, so existing files and deletions are
  // always user-owned. Best-effort: an unwritable dir must not break the
  // plugin mount, so failures are swallowed.
  try {
    seedBundledAgents(expandHome(config.agentsDir))
  } catch {
    // Seeding is an install convenience, never a hard dependency.
  }
  // Register the `use_agent` tool as soon as the configured subagent provider
  // (e.g. `spawn`) is available. Cordis activates mutually independent
  // plugins in parallel, so the provider backend plugin's `apply` may run
  // *after* this plugin's apply; a synchronous fail-early pre-check here would
  // therefore lose the race and drop the tool. Instead we register
  // immediately when the provider already exists, and otherwise wait for the
  // `subagent/provider-added` event (emitted by ctx.subagents.registerProvider)
  // before registering. The tool's execute always re-resolves the provider at
  // call time through ctx.subagents.start, so no further check is needed.
  const registerTool = (): void => {
    ctx.effect(() => ctx.tools.register(runAgentTool(ctx, config)), `dsh-subagent-registry:${config.toolName}`)
  }
  // TODO(alpha): upstream v0.1.2-alpha adds a read-only `list_subagent_models`
  // tool (model-selection policy; spawns nothing, so the maxAgents fence is
  // untouched). Consider registering it — or surfacing the same catalog in the
  // roster text — once the host floor reaches alpha, so users can preview the
  // routes a pinned/model-chosen subagent may take.
  if (ctx.subagents.getProvider(config.provider) !== undefined) {
    registerTool()
    return
  }
  let removeListener: (() => void) | undefined
  removeListener = ctx.on('subagent/provider-added', () => {
    if (ctx.subagents.getProvider(config.provider) !== undefined) {
      registerTool()
      removeListener?.()
    }
  })
}
