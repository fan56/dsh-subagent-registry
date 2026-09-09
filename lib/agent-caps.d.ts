/**
 * Per-agent cap lookup for host UIs (dsh-tui-pi's subagent policy).
 *
 * The policy knows a child only by its durable label — the registry writes
 * `displayName ?? agentName` into the child's descriptor at dispatch. This
 * module resolves that label back to the agent file's frontmatter
 * `maxRounds` (see ./agents-dir.ts), so a per-agent round cap rides the
 * agent .md as the single source of truth and works on every surface.
 *
 * Resolution is LAZY and FAIL-CLOSED to the caller's fallback: the policy
 * asks only at the first cap crossing for a child, and any failure —
 * unknown label, ambiguous display name, unreadable dir — returns
 * `undefined`, meaning "apply the global cap". A missing per-agent cap must
 * never widen the limit, only narrow the resolution.
 *
 * @module dsh-subagent-registry/agent-caps
 */
/**
 * The round cap declared on one agent's frontmatter, or `undefined` when the
 * label does not resolve to an agent with a `maxRounds` key.
 *
 * Label matching, strictest first: an exact `name` hit wins; otherwise a
 * unique `display_name` hit is accepted. An ambiguous display name (two
 * agents sharing one) resolves to nothing — a cap applied to the wrong
 * agent is worse than the global cap applied to both.
 *
 * Re-reads the agents dir on every call: the roster is user-owned and
 * editable at runtime (`/agents` manager), so a cached read would serve a
 * stale cap after an edit. Call frequency is one per child per cap
 * crossing — file IO here is irrelevant.
 */
export declare function readAgentMaxRounds(label: string, dir: string): number | undefined;
