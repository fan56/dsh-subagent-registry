/**
 * The `store` binding namespace — session-scoped, branch-aware key/value
 * state for codemode programs (decision #10).
 *
 * Programs see one global object `store` with two async functions:
 *
 * - `await store.store(key, value)` — append one write event to the live
 *   session log and resolve `{ ok: true, bytes }`. Over quota (256KB per
 *   value / 1MB per branch state) it resolves a structured
 *   `{ ok: false, error, message }` instead — the quotas exist because this
 *   state rides the durable session log, and the message says so.
 * - `await store.load(key)` — rebuild the current branch's state by
 *   replaying the session's event log and resolve `{ found: true, value }` /
 *   `{ found: false }`. Last write per key wins.
 *
 * Branch semantics fall out of dsh's event-sourced session model: writes are
 * ordinary session events, and a branch's log IS its path — a fork child
 * opens with its parent's prefix (pre-fork writes visible), the parent's
 * later writes never enter it, and a resumed session replays its full stored
 * log. No workspace-persistent storage domain is involved — see
 * docs/adr/0002-session-scoped-store.md.
 *
 * The event type is a plugin-owned `SessionEventMap` extension (the
 * appendable-keys interface is merge-extensible by plugins by contract), so
 * the write is a first-class durable session event, not a side file.
 *
 * Neither function ever rejects into the program: an absent session
 * (agent-less execution) is a structured `{ error: 'no-session' }` result.
 *
 * Host-API note: the design brief's `sessionManager.appendEntry` /
 * `getBranch` names do not exist in the 0.2.0-rc.2 host — the type-verified
 * equivalents are `Session.append(type, data)` for writes and the log itself
 * (`snapshotEvents()`) for the branch replay.
 *
 * @module bindings/store
 */

import type { Session } from '@deepseek-ai/dsh-session'
import type { PtcBindingNamespace, PtcJsonValue } from '@deepseek-ai/dsh-ptc-runtime'

/** The program-visible global name of this namespace. */
export const STORE_GLOBAL = 'store'

/** The plugin-owned session-log event type backing one write. */
export const STORE_EVENT_TYPE = 'ptc-subagent/store-write'

/** Quota per stored value (JSON serialization length), pi-parity. */
export const STORE_VALUE_LIMIT_BYTES = 256 * 1024

/** Quota over the whole branch state (sum of live values), pi-parity. */
export const STORE_TOTAL_LIMIT_BYTES = 1024 * 1024

/** Max key length — keys are log metadata, not a second payload channel. */
export const STORE_KEY_LIMIT_CHARS = 256

// The plugin-owned event vocabulary extension: one durable write. The
// SessionEventMap is the merge-extensible, append-only source of truth for
// an agent interaction; plugin-merged keys are first-class appendable types.
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'ptc-subagent/store-write': {
      key: string
      value: PtcJsonValue
    }
  }
}

/**
 * The events one branch replay considers: the session's FULL log (inherited
 * prefix included). Branch semantics fall out of the log itself: a fork
 * child's log opens with its parent's prefix — pre-fork writes are on the
 * child's path — while the parent's post-fork writes never enter it, and a
 * resumed session replays its stored log with the fork cut intact.
 */
export function branchEvents(session: Session): readonly { type: string; data: unknown }[] {
  return session.snapshotEvents()
}

/** Rebuild one branch's key → value map (last write per key wins). */
export function replayStore(events: readonly { type: string; data: unknown }[]): Map<string, PtcJsonValue> {
  const state = new Map<string, PtcJsonValue>()
  for (const event of events) {
    if (event.type !== STORE_EVENT_TYPE) continue
    const data = event.data as { key?: unknown; value?: unknown }
    if (typeof data.key !== 'string') continue
    state.set(data.key, data.value as PtcJsonValue)
  }
  return state
}

/** Serialized size of one value — the quota's unit (JSON length). */
export function valueBytes(value: PtcJsonValue): number {
  return JSON.stringify(value ?? null).length
}

/** Validate one key; a string is the failure reason (a type guard, so the
 *  call site keeps the narrowed key). */
export function validateKey(key: unknown): key is string {
  return typeof key === 'string' && key !== '' && key.length <= STORE_KEY_LIMIT_CHARS
}

/** Total bytes of one branch state. */
export function stateBytes(state: ReadonlyMap<string, PtcJsonValue>): number {
  let total = 0
  for (const value of state.values()) total += valueBytes(value)
  return total
}

export interface StoreCollector {
  /** Count of accepted writes in this run (the codemode result reports it). */
  storeWrites: number
}

/** The structured failure shapes (never thrown into the program). */
export type StoreWriteResult =
  | { ok: true; bytes: number }
  | { ok: false; error: 'no-session' | 'invalid-key' | 'invalid-value' | 'quota-exceeded'; message: string }

export type StoreLoadResult =
  | { found: true; value: PtcJsonValue }
  | { found: false }
  | { error: 'no-session' | 'invalid-key'; message: string }

/**
 * Build the `store` namespace for one codemode run. The session handle comes
 * from the executing call's agent (`exec.agent?.session`); agent-less
 * executions get structured `no-session` results.
 */
export function createStoreBinding(session: Session | undefined, collector: StoreCollector): PtcBindingNamespace {
  function requireSession(): Session | string {
    if (session === undefined) return 'store: no live session is attached to this execution'
    return session
  }

  const functions: Record<string, (args: unknown) => Promise<PtcJsonValue>> = {
    async store(args): Promise<PtcJsonValue> {
      const resolved = requireSession()
      if (typeof resolved === 'string') {
        return { ok: false, error: 'no-session', message: resolved }
      }
      if (typeof args !== 'object' || args === null) {
        return { ok: false, error: 'invalid-value', message: 'store expects { key, value }' }
      }
      const { key, value } = args as { key?: unknown; value?: unknown }
      if (!validateKey(key)) {
        return { ok: false, error: 'invalid-key', message: `store: key must be a non-empty string of at most ${STORE_KEY_LIMIT_CHARS} chars` }
      }
      const bytes = valueBytes(value as PtcJsonValue)
      if (bytes > STORE_VALUE_LIMIT_BYTES) {
        return {
          ok: false,
          error: 'quota-exceeded',
          message: `store: value is ${bytes} bytes, over the ${STORE_VALUE_LIMIT_BYTES}-byte per-value quota — store rides the durable session log, so large payloads belong in files (write via run_code host tools), not in store`,
        }
      }
      const state = replayStore(branchEvents(resolved))
      const previous = state.has(key) ? valueBytes(state.get(key) as PtcJsonValue) : 0
      if (stateBytes(state) - previous + bytes > STORE_TOTAL_LIMIT_BYTES) {
        return {
          ok: false,
          error: 'quota-exceeded',
          message: `store: this branch's state is at the ${STORE_TOTAL_LIMIT_BYTES}-byte total quota — drop old keys or move bulk data into files; the quota exists because store rides the durable session log`,
        }
      }
      resolved.append(STORE_EVENT_TYPE, { key, value: (value ?? null) as PtcJsonValue })
      collector.storeWrites += 1
      return { ok: true, bytes }
    },
    async load(args): Promise<PtcJsonValue> {
      const resolved = requireSession()
      if (typeof resolved === 'string') return { error: 'no-session', message: resolved }
      if (typeof args !== 'object' || args === null) {
        return { error: 'invalid-key', message: 'load expects { key }' }
      }
      const key = (args as { key?: unknown }).key
      if (!validateKey(key)) {
        return { error: 'invalid-key', message: `load: key must be a non-empty string of at most ${STORE_KEY_LIMIT_CHARS} chars` }
      }
      const state = replayStore(branchEvents(resolved))
      if (!state.has(key)) return { found: false }
      return { found: true, value: state.get(key) as PtcJsonValue }
    },
  }

  return {
    global: STORE_GLOBAL,
    functions,
  }
}
