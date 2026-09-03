/**
 * dsh-subagent-registry — register locally-defined custom agents.
 *
 * At session startup this plugin registers two tools (both names
 * configurable): `use_agent` calls any agent defined in
 * `~/.dsh/agents/<name>.md` by name — foreground one-shot with interrupted-run
 * resume, or (since dsh v0.1.2-alpha.4) a durable `background` conversation
 * that returns the child's id immediately; and `ask_agent` sends a follow-up
 * to a background run and waits for its reply, closing the parent↔child
 * interaction loop on top of the continuation manager's bidirectional
 * `sendMessage`. Each custom agent runs as its own subagent with the file
 * body as its persona, through the already-assembled `spawn` provider. No
 * patch to the dsh base's own tool-subagent; the roster is surfaced directly
 * in the tool description so the model can dispatch by name.
 *
 * @module dsh-subagent-registry
 */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { agentsDir, expandHome } from './agents-dir.ts'
import { seedBundledAgents } from './seed-defaults.ts'
import { runAgentTool, type RunAgentConfig } from './tool-run-agent.ts'
import { askAgentTool } from './interactive.ts'

// Profile-aware runtime synthesis (the read side of the model-profile
// feature): dsh-tui-pi imports these from this package.
export { agentsDir, dshHome } from './agents-dir.ts'
export { composeAgentRuntime, readModelProfilesDoc, workspaceProfileName } from './profile-resolution.ts'

export const name = 'dsh-subagent-registry'

/**
 * Tool injection seam + the subagent (provider) seam + the agent factory seam
 * (`ctx.agents.resume` drives interrupted-run continuation), like
 * dsh-tool-subagent plus the resume dependency.
 */
export const inject = ['tools', 'subagents', 'agents']

/**
 * Plugin config. `agentsDir` defaults to the dsh-home agents dir
 * (`$DSH_HOME/agents`, i.e. `~/.dsh/agents`), `provider` reuses
 * dsh-base's already-assembled `spawn` provider, `toolName` names the
 * dispatch tool, `askToolName` names the follow-up tool, `leafDenyTools`
 * overrides the tool list removed from `deep: 0` (leaf) agents' children
 * (default: all agent-spawning tools in the dsh base distribution plus
 * `toolName` itself), and `resume` selects when `use_agent` continues a
 * prior interrupted run of the same agent (default `auto`).
 */
export const Config = z.object({
  agentsDir: z.string().default('~/.dsh/agents'),
  provider: z.string().default('spawn'),
  toolName: z.string().default('use_agent'),
  askToolName: z.string().default('ask_agent'),
  leafDenyTools: z.array(z.string()).default([]),
  resume: z.union(['auto', 'opt-in', 'off']).default('auto'),
})

export function apply(ctx: Context, config: RunAgentConfig): void {
  // Resolve the agents dir against the dsh home: the schema default literal
  // means "the agents dir under the dsh home", so `$DSH_HOME` is honored by
  // the same resolution the host uses (dshHome) — this keeps seeding, the
  // tool's roster and the profile store (`$DSH_HOME/model-profiles.json`)
  // under one root. A configured custom path is taken verbatim (after `~`
  // expansion).
  const dir = config.agentsDir === '~/.dsh/agents' ? agentsDir() : expandHome(config.agentsDir)
  const runConfig: RunAgentConfig = { ...config, agentsDir: dir }
  // One-time seeding of the bundled default roster (workhorse / oldfox /
  // rubber-duck) into the configured agents dir: a fresh install starts
  // with a usable roster. Runs synchronously BEFORE the tool registers, so
  // the roster the model sees already includes the defaults; runs only
  // while the dir holds no agents, so existing files and deletions are
  // always user-owned. Best-effort: an unwritable dir must not break the
  // plugin mount, so failures are swallowed.
  try {
    seedBundledAgents(dir)
  } catch {
    // Seeding is an install convenience, never a hard dependency.
  }
  // Register the dispatch + follow-up tools as soon as the configured subagent provider
  // (e.g. `spawn`) is available. Cordis activates mutually independent
  // plugins in parallel, so the provider backend plugin's `apply` may run
  // *after* this plugin's apply; a synchronous fail-early pre-check here would
  // therefore lose the race and drop the tool. Instead we register
  // immediately when the provider already exists, and otherwise wait for the
  // `subagent/provider-added` event (emitted by ctx.subagents.registerProvider)
  // before registering. The tool's execute always re-resolves the provider at
  // call time through ctx.subagents.start, so no further check is needed.
  const registerTool = (): void => {
    ctx.effect(() => {
      const dispatch = ctx.tools.register(runAgentTool(ctx, runConfig))
      const followUp = ctx.tools.register(
        askAgentTool(ctx, {
          agentsDir: dir,
          toolName: config.askToolName ?? 'ask_agent',
          dispatchToolName: config.toolName,
        }),
      )
      return [dispatch, followUp]
    }, `dsh-subagent-registry:${config.toolName}`)
  }
  // TODO(upstream): upstream added a read-only `list_subagent_models`
  // tool on the 0.1.2 alpha line (model-selection policy; spawns nothing, so
  // the maxAgents fence is untouched). Investigated against the 0.1.2-rc.1
  // closure — still NOT attachable from
  // a third-party plugin today: `registerListSubagentModels(ctx, policy)` is a
  // module-private function of @deepseek-ai/dsh-tool-subagent (its entry
  // exports only `Config/apply/inject/name`), its required `policy` argument is
  // the route list that plugin itself projects into each Session
  // (`subagentModelSelectionPolicy` state key, fed by the host
  // `subagent-model-selection` setting), and the global tool name is owned by
  // that plugin's delegation-tool instances ("at most one instance in a tool
  // scope may own model selection"). Revisit only if upstream exports a public
  // discovery seam; until then the roster's frontmatter `model` routes stay
  // the model-visible surface for where a pinned subagent may land.
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
