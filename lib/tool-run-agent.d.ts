/**
 * The `use_agent` tool: delegates to a locally-defined custom agent by name.
 *
 * The roster (available agent names + sanitized descriptions) is read once at
 * tool-definition time so the tool's static description lets the main
 * conversation model pick an agent by name. At execute time the target
 * `<agents-dir>/<name>.md` is re-read, its frontmatter `model` (a
 * `provider/model` route) is split into `agentOptions`, and its body is
 * passed as the child's `persona`. The delegation runs through the
 * already-assembled `spawn` subagent provider (same single-instance realm dsh
 * uses), so the child is a real dsh subagent with its own system prompt.
 *
 * When the same agent was already run in this conversation and that run was
 * interrupted (error, cancellation, crash, token limit), the tool instead
 * resumes the persisted child session and continues it from its partial work
 * (see `./resume.ts`), unless the caller passes `fresh: true`.
 *
 * @module dsh-subagent-registry/tool-run-agent
 */
import type { Context } from '@deepseek-ai/cordis';
import { type SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import { type ResumeMode } from './resume.ts';
/** The writable knob surface for this plugin (a subset of the Config schema). */
export interface RunAgentConfig {
    agentsDir: string;
    provider: string;
    toolName: string;
    /**
     * When `use_agent` continues a prior interrupted run of the same agent:
     * `auto` (default) resumes whenever one exists, `opt-in` only when the
     * caller passes `resume: true`, `off` never (an explicit `resume: true`
     * still overrides the deployment default).
     */
    resume?: ResumeMode;
    /**
     * Optional explicit deny list installed on a `deep: 0` (leaf) agent's child.
     * An empty/absent list means the computed default: every agent-spawning tool
     * in the dsh base distribution plus this plugin's own `toolName` (so a
     * customized tool name is still denied). A non-empty list replaces the
     * default entirely — the caller then owns it, including our tool name.
     */
    leafDenyTools?: readonly string[];
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
export declare const SPAWN_TOOL_NAMES: readonly ["subagent", "subagent_fork", "workflow", "ralph"];
/**
 * The deny list installed on a `deep: 0` (leaf) agent's child, both at fresh
 * dispatch and again at resume: an explicit non-empty `leafDenyTools` replaces
 * the default (every agent-spawning tool in the dsh base distribution plus
 * this plugin's own `toolName`).
 */
export declare function leafDenyList(toolName: string, leafDenyTools?: readonly string[]): readonly string[];
/**
 * Sanitize a frontmatter `description` into clean display prose:
 * 1. drop the leading run of backslashes left by an escaped-quote residue
 *    (`\\\\"…"`), 2. peel one pair of surrounding quotes, 3. drop any stray
 *    backslashes, 4. drop a `>` wedged between two CJK characters (markdown
 *    blockquote artifact, e.g. `稳>定性`), 5. collapse whitespace.
 */
export declare function sanitizeDescription(raw: string): string;
/**
 * Split a dsh model route (`provider/model`) into `agentOptions`. Tolerant of
 * suffixes and unusual shapes (e.g. `deepseek-v4-flash（正式版）`): the first
 * slash splits provider from model and trailing parenthetical notes are kept
 * in the model string. A value without a slash yields provider-only routing.
 */
export declare function splitModel(model: string): {
    provider?: string;
    model?: string;
};
/** Inputs of the request builder, factored apart from the tool's execute closure. */
export interface BuildStartRequestInput {
    agentName: string;
    prompt: string;
    /** The delegating agent; only its delegation depth is read. */
    parent: {
        options: {
            subagentDepth?: number;
        };
        session: {
            header: {
                delegationDepth?: number;
            };
        };
    };
    /** The agent file body, passed through verbatim as the child's persona. */
    persona: string;
    /** The parsed frontmatter `deep` (default 1); 0 = leaf. */
    deep: number;
    /** This plugin's registered tool name (denied on leaves). */
    toolName: string;
    /** Optional explicit replacement for the default leaf deny list. */
    leafDenyTools?: readonly string[];
    /** Optional dsh `provider/model` route from the agent frontmatter. */
    model?: string;
    /** Optional display name used as the running child's display label (falls back to agentName). */
    displayName?: string;
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
export declare function buildStartRequest(input: BuildStartRequestInput): Omit<SubagentStartRequest, 'signal'>;
/** The cordis `ctx.tools.register`-ready definition for the `use_agent` tool. */
export declare function runAgentTool(ctx: Context, cfg: RunAgentConfig): import("@deepseek-ai/dsh-tools").ToolDefinition;
