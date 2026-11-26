/**
 * Top-level-caller guard for every registry handler that can start or resume
 * an agent.
 *
 * `toolFilter.deny` removes the spawn tools from a registry child's visible
 * schema, but a host-forked child can still hold a handle to `use_agent` from
 * before the restriction (or reach it through a scoped tool). This guard is
 * the second line of defence: identity is re-checked at the handler edge,
 * before any host call, record write or event emission. A caller is admitted
 * only when its agent + session exist, the session has no `parentSession`, and
 * its id is not one of this registry's own children. Anything else — a
 * registry child, a host-forked child, or an indeterminate identity — fails
 * closed with one stable error code.
 */
/** Stable error code for every refused nested / unverifiable delegation. */
export declare const NESTED_DELEGATION_ERROR_CODE = "DSH_REGISTRY_NESTED_DELEGATION_UNSUPPORTED";
/** Refusal carrying the stable code as `error.code`. */
export declare class NestedDelegationError extends Error {
    readonly code: string;
    constructor(detail: string);
}
/** Structural minimum of a calling agent's session header. */
interface CallerHeader {
    readonly parentSession?: unknown;
}
/** Structural minimum of the session carried by the caller. */
interface CallerSession {
    readonly header?: CallerHeader;
}
/** The identity `assertTopLevelCaller` reads from a tool execution or a parent agent. */
export interface CallerIdentity {
    readonly agent?: {
        readonly id?: unknown;
        readonly session?: CallerSession;
    };
    readonly session?: CallerSession;
}
/** Record a child this registry just dispatched. */
export declare function recordRegistryChild(id: unknown): void;
/** Forget a child whose dispatch failed before it materialized, or was disposed. */
export declare function releaseRegistryChild(id: unknown): void;
/** Whether an id belongs to a child this registry spawned. */
export declare function isRegistryChild(id: unknown): boolean;
/**
 * Admit only a verified top-level caller. Call this as the FIRST statement of
 * every handler that starts or resumes an agent — before reading tools,
 * files, host services, or writing any record. Fails closed: an absent agent,
 * an absent session, a non-empty `parentSession`, or a known registry child
 * is refused with {@link NESTED_DELEGATION_ERROR_CODE}.
 */
export declare function assertTopLevelCaller(exec: CallerIdentity | undefined): void;
/**
 * Every registry handler entry point that may start or resume an agent. Each
 * one calls `assertTopLevelCaller` before its host call. The static guard test
 * reads this list so a new bypass cannot be added without updating both the
 * manifest and the guard coverage.
 *
 * `use_agent.execute` guards the whole tool handler, including its background
 * (`startActivation` / legacy `startContinuable`) and foreground
 * (`startActivation` / legacy `start`) dispatch branches; the two helpers each
 * carry their own guard for a direct call. `driveResumedRun` and its inner
 * `driveLegacyResume` (the `agents.resume` call site) are both guarded.
 */
export declare const REGISTRY_DELEGATION_ENTRY_POINTS: readonly ["tool-run-agent.ts::use_agent.execute", "tool-run-agent.ts::activateWithReservedComposition", "tool-run-agent.ts::startLegacyForeground", "resume.ts::driveResumedRun", "resume.ts::driveLegacyResume"];
export {};
