/**
 * Frontmatter-declared reasoning-effort injection for registry-dispatched
 * children.
 *
 * dsh's `SubagentStartRequest.agentOptions` cannot carry a reasoning effort
 * (closed interface; extra fields are silently dropped downstream), so the
 * effort travels out of band: while a `use_agent` run is live, its child
 * session id is mapped to the agent's frontmatter `thinking` value here, and
 * an `agent/request` waterfall listener stamps that effort onto every model
 * call config the loop proposes for that child. Only registry-dispatched
 * children are injected; all other agents pass through untouched — a session
 * id absent from the map (the main conversation, native subagents, other
 * plugins' agents) gets the loop's own config back unchanged, including any
 * `reasoningEffort` it already carries.
 *
 * The listener always awaits and returns `next()` first: `agent/request` is a
 * cordis waterfall, and skipping `next()` would veto the rest of the chain
 * (and the loop's built-in config resolution) instead of layering on top of
 * it.
 *
 * @module dsh-subagent-registry/effort-inject
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
/** Registration handle for the live child-session → effort mapping. */
export interface EffortRegistry {
    /** Map one child session id to the effort stamped onto its requests. */
    register: (id: SessionId, effort: ReasoningEffortId) => void;
    /** Drop the mapping once the run settles (prevents unbounded growth). */
    forget: (id: SessionId) => void;
}
/**
 * Reach the {@link EffortRegistry} installed by `apply()` from other modules
 * (the `use_agent` tool registers/forgets child session ids around runs)
 * without a circular import back through `index.ts`.
 */
export declare function getEffortRegistry(): EffortRegistry | undefined;
/**
 * Install the `agent/request` waterfall listener on the plugin context and
 * expose the child-id → effort mapping. Only registry-dispatched children are
 * injected; all other agents pass through untouched.
 */
export declare function installEffortInjection(ctx: Context): EffortRegistry;
