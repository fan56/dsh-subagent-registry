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
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SubagentStartRequest, type SubagentActivation } from '@deepseek-ai/dsh-subagent';
import type { Language } from './preset-contract.ts';
import { type BuiltinAgyDefinition } from './builtin-agy.ts';
import { type ScopeKey } from '@deepseek-ai/dsh-scope';
import { type ChildComposition } from './host-compat.ts';
import { type AgentFile, type ThinkingLevel } from './agents-dir.ts';
import type { VolatileRef } from './ptc/config.ts';
import { type ResumeMode } from './resume.ts';
/**
 * The `disabledAgents` config value in either shape it arrives in: the live
 * volatile reference the loader hands `apply` (hot-swapped on a settings
 * write), or a plain array (tests, hand-built configs). Absent = nothing
 * disabled.
 */
export type DisabledAgentsInput = VolatileRef<readonly string[]> | readonly string[] | undefined;
/** Read the current disabled-agent list out of either input shape. */
export declare function currentDisabledAgents(input: DisabledAgentsInput): readonly string[];
/** Whether one agent name is toggled off through the `disabledAgents` key. */
export declare function isAgentDisabled(name: string, input: DisabledAgentsInput): boolean;
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
     * Extra deny names installed on EVERY child, unioned with the mandatory
     * spawn-tool list (including this plugin's own `toolName`). Children can
     * never call subagents; this lets a deployment deny additional spawners.
     */
    leafDenyTools?: readonly string[];
    /**
     * The follow-up tool's registered name (`ask_agent` by default), referenced
     * in the background dispatch's guidance text. Informational only.
     */
    askToolName?: string;
    /**
     * Agent names excluded from the roster (`disabledAgents` config key, the
     * `/registry-config` command's toggle). A pure configuration filter: a disabled
     * agent's `<name>.md` stays on disk untouched — it just disappears from the
     * tool description roster, and an execute-time re-check refuses to run it
     * even when the model names it directly.
     */
    disabledAgents?: DisabledAgentsInput;
    /**
     * Experimental built-in `agy` member wiring. Absent means the built-in is
     * never visible (the default); the switch is non-volatile so a flip remounts
     * the plugin, while the resolver cache is filled asynchronously at inject
     * time. The host manager resolves `cwd`; this seam only decides visibility.
     */
    agy?: {
        enabled: boolean;
        resolveExecutable: (name: string) => string | undefined;
    };
    /** UI language for the built-in member's localized roster line. */
    language?: Language;
}
/** Inputs of the built-in member visibility check (pure, injected seams). */
export interface AgyRoutingInput {
    enabled: boolean;
    resolveExecutable: (name: string) => string | undefined;
    disabledAgents?: DisabledAgentsInput;
    language?: Language;
}
/**
 * Resolve the built-in definition ignoring the roster toggle — execute needs
 * this shape so a model that hard-names a toggled-off agy gets the same
 * "disabled" error as any other agent instead of "unknown agent". A user-owned
 * `agy.md` (valid OR broken) always shadows the built-in; the async executable
 * lookup lives in the caller's cached resolver.
 */
export declare function builtinAgyIgnoringToggle(dir: string, input: AgyRoutingInput): BuiltinAgyDefinition | undefined;
/** Resolve the built-in agy definition visible in the roster (toggle applied). */
export declare function visibleBuiltinAgy(dir: string, input: AgyRoutingInput): BuiltinAgyDefinition | undefined;
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
export declare const SPAWN_TOOL_NAMES: readonly ["subagent", "subagent_fork", "subagent_codex", "subagent_claude_code", "workflow", "ralph"];
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
export declare function leafDenyList(toolName: string, leafDenyTools?: readonly string[], hostKnown?: ReadonlySet<string>): readonly string[];
/**
 * The names the host would accept in a `tools.restrict()` filter for the
 * plugin's own context — `ctx.tools.view().restrictableNames`, read
 * defensively: older hosts may lack `view()`, and anything unexpected here
 * must degrade to "pass the default list verbatim" (the pre-0.1.7 behavior),
 * never to "deny nothing".
 */
export declare function resolveHostToolNames(ctx: Context, scope?: ScopeKey): ReadonlySet<string> | undefined;
/** Mandatory spawn-tool names the host does NOT register (so the intersect
 * in {@link leafDenyList} drops them). `undefined` means the host exposed no
 * restrictable-name view, so no intersection — and no drop — happened. */
export declare function missingSpawnTools(hostKnown?: ReadonlySet<string>): readonly string[];
/** Stable diagnostic text for the mandatory names the host cannot deny. */
export declare function spawnToolWarningMessage(missing: readonly string[]): string;
/**
 * Warn whenever the host-known intersection drops a mandatory spawn tool.
 * Silently losing a name would let a child keep a spawner the plugin promised
 * to deny, so the omission is always reported. No-op when the host view is
 * unavailable (the deny list is then passed verbatim, nothing is dropped).
 */
export declare function warnMissingSpawnTools(ctx: Context, hostKnown?: ReadonlySet<string>): void;
/** Inert nesting fields that are explicitly set and therefore deprecated. */
export declare function deprecatedDelegationFields(input: {
    deepDeclared?: boolean;
    maxDepth?: unknown;
}): readonly string[];
/** Stable deprecation text; the fields remain parsed/validated but inert. */
export declare function delegationDeprecationMessage(fields: readonly string[]): string;
/** Warn for deprecated nesting fields. The dispatch is unchanged. */
export declare function warnDeprecatedDelegation(ctx: Context, input: {
    deepDeclared?: boolean;
    maxDepth?: unknown;
}): void;
/** Join text blocks from a canonical block array without trusting values. */
export declare function textOf(output: readonly unknown[]): string;
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
    /** @deprecated Inert compatibility field: parsed from frontmatter, no longer read (subagents cannot spawn subagents). */
    deep: number;
    /** This plugin's registered tool name (always denied on children). */
    toolName: string;
    /** Optional extra deny names, unioned with the mandatory spawn-tool list. */
    leafDenyTools?: readonly string[];
    /**
     * The host's registered global tool names (`resolveHostToolNames`), used to
     * intersect the deny list — see `leafDenyList`.
     */
    hostKnownTools?: ReadonlySet<string>;
    /** Optional dsh `provider/model` route from the agent frontmatter. */
    model?: string;
    /** Optional display name used as the running child's display label (falls back to agentName). */
    displayName?: string;
    /**
     * Optional frontmatter `thinking` level of the agent, projected verbatim
     * into `SubagentStartRequest.agentOptions.reasoningEffort` — the host's
     * native carrier (requires the provider's `agentOptions` capability, which
     * the in-process `spawn` provider declares; the start service rejects
     * loudly on a provider without it instead of dropping the value).
     */
    thinking?: ThinkingLevel;
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
export declare function buildStartRequest(input: BuildStartRequestInput): Omit<SubagentStartRequest, 'signal'> & ChildComposition;
/**
 * Start one external one-shot activation (the built-in `agy` member) with the
 * MINIMAL spec: no `childId`, no `name`, no `persona`/`toolFilter` reservation.
 * Those fields belong to in-process children; an external provider rejects
 * a reserved childId as UNSUPPORTED_CAPABILITY and has no local Agent to carry
 * a parked composition. The persona is inlined into `prompt` by the caller.
 */
export declare function activateExternal(ctx: Context, provider: string, label: string, prompt: ContentBlock[], signal: AbortSignal, delivery: 'parent' | 'caller', parent: Agent): Promise<SubagentActivation>;
/** Map a non-`completed` stop reason to a human headline for the parent model. */
export declare function stopReasonError(reason: string): string;
/** Read + parse one agent file, throwing a friendly, roster-aware error. */
export declare function loadAgent(dir: string, name: string, available: string[]): AgentFile;
/** The cordis `ctx.tools.register`-ready definition for the `use_agent` tool. */
export declare function runAgentTool(ctx: Context, cfg: RunAgentConfig): import("@deepseek-ai/dsh-tools").ToolDefinition;
