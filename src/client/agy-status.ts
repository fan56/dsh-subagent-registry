/**
 * Pure reduction of the host's external subagent catalog plus the parent
 * Session's durable settlement notices into the agy panel's rows.
 *
 * No Remote calls and no host types live here: the client adapter supplies
 * plain rows and parsed notices, so this file is directly unit-testable.
 */

/** The four terminal states plus the live/stale-inference bucket. */
export type AgyOutcome = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown'

/** One `subagentCatalog` projection row, narrowed to external members. */
export interface AgyCatalogRow {
  readonly id: string
  readonly createdAt: number
  readonly mode: 'external'
  readonly label?: string
  readonly name?: string
}

/** A `subagent-settled` notice attributed to one catalog id. */
export interface AgySettlement {
  readonly senderSessionId: string
  readonly stopReason?: string
}

/** One rendered row; `label` is always a non-empty display name. */
export interface AgyStatusRow {
  readonly id: string
  readonly label: string
  readonly name?: string
  readonly createdAt: number
  readonly outcome: AgyOutcome
}

/** Matches the plugin's volatile `agyTimeoutMs` default (10 minutes). */
export const DEFAULT_AGY_TIMEOUT_MS = 600_000
/** Grace after the agy deadline before a silent row becomes "unknown". */
export const AGY_STALE_GRACE_MS = 60_000
/** Keep the panel bounded; the catalog itself is append-only. */
export const AGY_MAX_ROWS = 20

/** Same stopReason triad the TUI panel uses (T25/externalStopOutcome). */
export function outcomeOf(stopReason: string | undefined): 'completed' | 'failed' | 'cancelled' {
  if (stopReason === 'completed') return 'completed'
  if (stopReason === 'aborted') return 'cancelled'
  // error / max-tokens / refusal / missing: the run did not complete cleanly.
  return 'failed'
}

/**
 * Parse the payload of one `user/message` event. The host's settlement notice
 * is a durable user message whose `source.kind` is `subagent-settled`; only
 * notices carrying a sender id can be reconciled with a catalog row.
 */
export function parseSettlement(eventData: unknown): AgySettlement | undefined {
  if (eventData === null || typeof eventData !== 'object') return undefined
  const source = (eventData as { source?: unknown }).source
  if (source === null || typeof source !== 'object') return undefined
  const candidate = source as { kind?: unknown; senderSessionId?: unknown; stopReason?: unknown }
  if (candidate.kind !== 'subagent-settled' || typeof candidate.senderSessionId !== 'string' || candidate.senderSessionId === '') return undefined
  return {
    senderSessionId: candidate.senderSessionId,
    stopReason: typeof candidate.stopReason === 'string' ? candidate.stopReason : undefined,
  }
}

/**
 * Fold catalog discoveries and settlements into at most `AGY_MAX_ROWS` rows.
 * Rows are de-duplicated by id (newest `createdAt` wins), sorted newest first.
 * A settlement always wins over the timeout fallback; without one a row stays
 * "running" until `createdAt + timeoutMs + AGY_STALE_GRACE_MS`, then "unknown".
 */
export function reduceAgyStatus(
  catalog: readonly AgyCatalogRow[],
  settlements: readonly AgySettlement[],
  now: number,
  timeoutMs: number = DEFAULT_AGY_TIMEOUT_MS,
): AgyStatusRow[] {
  const byId = new Map<string, AgyCatalogRow>()
  for (const row of catalog) {
    if (row.mode !== 'external' || typeof row.id !== 'string' || row.id === '') continue
    if (typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)) continue
    const previous = byId.get(row.id)
    if (previous === undefined || row.createdAt >= previous.createdAt) byId.set(row.id, row)
  }

  const settledById = new Map<string, AgySettlement>()
  for (const settlement of settlements) {
    if (typeof settlement?.senderSessionId !== 'string') continue
    // notices arrive in log order; the latest one for an id is authoritative.
    settledById.set(settlement.senderSessionId, settlement)
  }

  const rows: AgyStatusRow[] = []
  for (const row of byId.values()) {
    const settlement = settledById.get(row.id)
    const outcome: AgyOutcome = settlement !== undefined
      ? outcomeOf(settlement.stopReason)
      : now > row.createdAt + timeoutMs + AGY_STALE_GRACE_MS ? 'unknown' : 'running'
    rows.push({
      id: row.id,
      label: row.label || row.name || row.id,
      name: row.name,
      createdAt: row.createdAt,
      outcome,
    })
  }
  rows.sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
  return rows.slice(0, AGY_MAX_ROWS)
}
