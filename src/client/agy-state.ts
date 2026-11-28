/** Controller behind the agy panel: reads the host projection face, folds it, and owns stop feedback. */
import type { Language } from '../preset-contract.ts'
import { agyStringsFor } from './strings.ts'
import { reduceAgyStatus, type AgyCatalogRow, type AgySettlement, type AgyStatusRow } from './agy-status.ts'

export interface AgySnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  rows: readonly AgyStatusRow[]
  language: Language
  /** Visible result of the last stop attempt; failures are never silent. */
  notice?: string
  error?: string
  busy: Readonly<Record<string, boolean>>
}

/** The narrow host face the panel needs; index.ts adapts ctx onto it. */
export interface AgyClient {
  /** Main-view Session id: the row retained under the `mainView` source. */
  currentSessionId(): string | undefined
  /** External catalog rows in that Session's projection. */
  catalog(sessionId: string): readonly AgyCatalogRow[]
  /** Durable `subagent-settled` notices in the parent Session history. */
  settlements(sessionId: string): Promise<readonly AgySettlement[]>
  /** Re-read the Host-authoritative projections. */
  refresh(sessionId: string): Promise<void>
  /** The Remote stop path; failures come back as a visible message. */
  interrupt(id: string): Promise<{ ok: boolean; error?: string }>
  /** Incremental projection/list changes. */
  subscribe(listener: () => void): () => void
}

const POLL_MS = 3_000

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One instance per plugin activation; React mount/unmount only starts and stops polling. */
export class AgyController {
  private snapshot: AgySnapshot
  private readonly listeners = new Set<() => void>()
  private disposed = false
  private active = false
  private loading?: Promise<void>
  private poll?: ReturnType<typeof setInterval>
  private unsubscribe?: () => void
  private readonly client: AgyClient

  constructor(client: AgyClient, language: Language = 'zh') {
    this.client = client
    this.snapshot = { status: 'idle', rows: [], language, busy: {} }
  }
  getSnapshot = (): AgySnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<AgySnapshot>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Mount: one full refresh, then incremental + short polling fallback. */
  open(): void {
    if (this.disposed || this.active) return
    this.active = true
    this.unsubscribe = this.client.subscribe(() => { void this.load(false) })
    this.poll = setInterval(() => { void this.load(false) }, POLL_MS)
    void this.load(true)
  }
  /** Unmount: keep the controller (and any in-flight stop) but stop background reads. */
  close(): void {
    this.active = false
    if (this.poll !== undefined) { clearInterval(this.poll); this.poll = undefined }
    if (this.unsubscribe !== undefined) { this.unsubscribe(); this.unsubscribe = undefined }
  }
  dispose(): void {
    this.close()
    this.disposed = true
    this.listeners.clear()
  }
  refresh(): void { void this.load(true) }

  load(withRefresh: boolean): Promise<void> {
    if (this.loading) return this.loading
    const sessionId = this.client.currentSessionId()
    if (sessionId === undefined) {
      this.publish({ status: 'ready', rows: [], error: undefined })
      return Promise.resolve()
    }
    if (withRefresh) this.publish({ status: 'loading' })
    this.loading = (async () => {
      try {
        if (withRefresh) await this.client.refresh(sessionId)
        const catalog = this.client.catalog(sessionId)
        let error: string | undefined
        let settlements: readonly AgySettlement[] = []
        try { settlements = await this.client.settlements(sessionId) }
        catch (cause) { error = agyStringsFor(this.snapshot.language).settlementFailed(messageOf(cause)) }
        this.publish({ status: 'ready', rows: reduceAgyStatus(catalog, settlements, Date.now()), error })
      } catch (cause) {
        this.publish({ status: 'error', error: messageOf(cause) })
      } finally {
        this.loading = undefined
      }
    })()
    return this.loading
  }

  /** Remote interrupt with explicit success/failure text; never a silent no-op. */
  async stop(id: string): Promise<void> {
    if (this.snapshot.busy[id]) return
    const t = agyStringsFor(this.snapshot.language)
    this.publish({ busy: { ...this.snapshot.busy, [id]: true }, notice: undefined })
    try {
      const result = await this.client.interrupt(id)
      if (result.ok) {
        this.publish({ notice: t.stopAccepted(id) })
        await this.load(true)
      } else this.publish({ notice: t.stopFailed(id, result.error ?? '') })
    } catch (cause) {
      this.publish({ notice: t.stopFailed(id, messageOf(cause)) })
    } finally {
      const busy = { ...this.snapshot.busy }
      delete busy[id]
      this.publish({ busy })
    }
  }
}
