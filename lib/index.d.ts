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
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import { type RunAgentConfig } from './tool-run-agent.ts';
export declare const name = "dsh-subagent-registry";
/**
 * Tool injection seam + the subagent (provider) seam + the agent factory seam
 * (`ctx.agents.resume` drives interrupted-run continuation), like
 * dsh-tool-subagent plus the resume dependency.
 */
export declare const inject: string[];
/**
 * Plugin config. `agentsDir` defaults to `~/.dsh/agents`, `provider` reuses
 * dsh-base's already-assembled `spawn` provider, `toolName` names the tool,
 * `leafDenyTools` overrides the tool list removed from `deep: 0` (leaf)
 * agents' children (default: all agent-spawning tools in the dsh base
 * distribution plus `toolName` itself), and `resume` selects when `use_agent`
 * continues a prior interrupted run of the same agent (default `auto`).
 */
export declare const Config: z<Schemastery.ObjectS<{
    agentsDir: z<string, string>;
    provider: z<string, string>;
    toolName: z<string, string>;
    leafDenyTools: z<string[], string[]>;
    resume: z<"off" | "auto" | "opt-in", "off" | "auto" | "opt-in">;
}>, Schemastery.ObjectT<{
    agentsDir: z<string, string>;
    provider: z<string, string>;
    toolName: z<string, string>;
    leafDenyTools: z<string[], string[]>;
    resume: z<"off" | "auto" | "opt-in", "off" | "auto" | "opt-in">;
}>>;
export declare function apply(ctx: Context, config: RunAgentConfig): void;
