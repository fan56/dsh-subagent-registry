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
export const NESTED_DELEGATION_ERROR_CODE = 'DSH_REGISTRY_NESTED_DELEGATION_UNSUPPORTED'

/** The actionable hint appended to every refusal. */
const NEXT_STEP =
  'Dispatch from the main conversation instead: have the main agent call use_agent directly ' +
  '(or dispatch several top-level subagents in parallel). Nested subagents are not supported.'

/** Refusal carrying the stable code as `error.code`. */
export class NestedDelegationError extends Error {
  readonly code: string = NESTED_DELEGATION_ERROR_CODE

  constructor(detail: string) {
    super(`${NESTED_DELEGATION_ERROR_CODE}: ${detail} ${NEXT_STEP}`)
    this.name = 'NestedDelegationError'
  }
}

/** Structural minimum of a calling agent's session header. */
interface CallerHeader {
  readonly parentSession?: unknown
}

/** Structural minimum of the session carried by the caller. */
interface CallerSession {
  readonly header?: CallerHeader
}

/** The identity `assertTopLevelCaller` reads from a tool execution or a parent agent. */
export interface CallerIdentity {
  readonly agent?: {
    readonly id?: unknown
    readonly session?: CallerSession
  }
  readonly session?: CallerSession
}

// ---------------------------------------------------------------------------
// Registry child record
// ---------------------------------------------------------------------------

/**
 * Durable ids of every child this registry spawned (fresh, background and the
 * cold-resumed children are all recorded when dispatched). Kept as strings so
 * the record works across the SessionId branded-string generations. A child
 * id stays here for the parent session's lifetime; it is pruned with the
 * composition reservation when the parent is disposed.
 */
const registryChildren = new Set<string>()

/** Record a child this registry just dispatched. */
export function recordRegistryChild(id: unknown): void {
  if (id !== undefined && id !== null) registryChildren.add(String(id))
}

/** Forget a child whose dispatch failed before it materialized, or was disposed. */
export function releaseRegistryChild(id: unknown): void {
  if (id !== undefined && id !== null) registryChildren.delete(String(id))
}

/** Whether an id belongs to a child this registry spawned. */
export function isRegistryChild(id: unknown): boolean {
  return id !== undefined && id !== null && registryChildren.has(String(id))
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

function refusal(detail: string): never {
  throw new NestedDelegationError(detail)
}

/**
 * Admit only a verified top-level caller. Call this as the FIRST statement of
 * every handler that starts or resumes an agent — before reading tools,
 * files, host services, or writing any record. Fails closed: an absent agent,
 * an absent session, a non-empty `parentSession`, or a known registry child
 * is refused with {@link NESTED_DELEGATION_ERROR_CODE}.
 */
export function assertTopLevelCaller(exec: CallerIdentity | undefined): void {
  const agent = exec?.agent
  const session = exec?.session ?? agent?.session
  if (agent === undefined || agent === null || session === undefined || session === null) {
    return refusal(
      `the calling agent or its session is unavailable, so a top-level caller cannot be verified`,
    )
  }
  if (agent.id === undefined || agent.id === null || agent.id === '') {
    return refusal(
      `the calling agent has no durable id, so a top-level caller cannot be verified`,
    )
  }
  const header = session.header
  if (header === undefined || header === null) {
    return refusal(
      `the calling agent's session header is unavailable, so a top-level caller cannot be verified`,
    )
  }
  const parentSession = header.parentSession
  if (parentSession !== undefined && parentSession !== null && parentSession !== '') {
    return refusal(
      `the caller (session ${String(agent.id)}) is a subagent child of session ${String(parentSession)}`,
    )
  }
  if (isRegistryChild(agent.id)) {
    return refusal(
      `the caller (session ${String(agent.id)}) is a subagent spawned by this registry`,
    )
  }
}

// ---------------------------------------------------------------------------
// Guarded entry-point manifest (kept in sync by test/caller-guard.test.mjs)
// ---------------------------------------------------------------------------

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
export const REGISTRY_DELEGATION_ENTRY_POINTS = [
  'tool-run-agent.ts::use_agent.execute',
  'tool-run-agent.ts::activateWithReservedComposition',
  'tool-run-agent.ts::startLegacyForeground',
  'tool-run-agent.ts::activateExternal',
  'resume.ts::driveResumedRun',
  'resume.ts::driveLegacyResume',
] as const
