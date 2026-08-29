/**
 * Frontmatter-declared reasoning-effort injection for registry-dispatched
 * children.
 *
 * Dual-track carrier since the v0.1.2-alpha era. `buildStartRequest` now puts
 * `reasoningEffort` into `SubagentStartRequest.agentOptions` natively (alpha
 * hosts honor it); this out-of-band waterfall remains because rc-era hosts
 * (≤ v0.1.1) silently drop the unknown field. While a `use_agent` run is
 * live, its child session id is mapped to the agent's frontmatter `thinking`
 * value here, and an `agent/request` waterfall listener stamps that effort
 * onto every model call config the loop proposes for that child. On alpha
 * hosts both carriers stamp the same value — idempotent. Only
 * registry-dispatched children are injected; all other agents pass through
 * untouched — a session id absent from the map (the main conversation, native
 * subagents, other plugins' agents) gets the loop's own config back
 * unchanged, including any `reasoningEffort` it already carries.
 *
 * The listener always awaits and returns `next()` first: `agent/request` is a
 * cordis waterfall, and skipping `next()` would veto the rest of the chain
 * (and the loop's built-in config resolution) instead of layering on top of
 * it.
 *
 * TODO(alpha floor): once the minimum supported host is v0.1.2-alpha+, retire
 * this module entirely — delete the waterfall, the EffortRegistry, and the
 * register/forget wiring in tool-run-agent.ts. Runtime probe for the era:
 * `ctx.subagents.getProvider(...)?.capabilities?.agentOptions === true`
 * (the spawn provider declares the capability only on alpha-era hosts).
 *
 * @module dsh-subagent-registry/effort-inject
 */
/** The registry installed by the plugin's `apply()`, if it has run. */
let activeRegistry;
/**
 * Reach the {@link EffortRegistry} installed by `apply()` from other modules
 * (the `use_agent` tool registers/forgets child session ids around runs)
 * without a circular import back through `index.ts`.
 */
export function getEffortRegistry() {
    return activeRegistry;
}
/**
 * Install the `agent/request` waterfall listener on the plugin context and
 * expose the child-id → effort mapping. Only registry-dispatched children are
 * injected; all other agents pass through untouched.
 */
export function installEffortInjection(ctx) {
    const efforts = new Map();
    ctx.on('agent/request', async ({ agent }, next) => {
        // MUST call next(): waterfall contract — its result is the config the
        // loop would use; we layer the effort on top instead of vetoing.
        const resolved = await next();
        const effort = efforts.get(String(agent.id));
        if (effort === undefined)
            return resolved;
        return { ...resolved, reasoningEffort: effort };
    });
    const registry = {
        register: (id, effort) => void efforts.set(String(id), effort),
        forget: (id) => void efforts.delete(String(id)),
    };
    activeRegistry = registry;
    return registry;
}
//# sourceMappingURL=effort-inject.js.map