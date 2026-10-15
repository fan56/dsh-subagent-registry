import { PRESET_KEYS, type PresetEntry, type PresetFields, type PresetKey, type PresetList, type PresetReply, type SavePreset } from '../preset-contract.ts'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'

export type DraftMode = 'create' | 'copy' | 'edit' | 'repair'
export interface Draft {
  mode: DraftMode
  original?: PresetEntry
  fields: PresetFields
  body: string
  source: string
  advanced: boolean
}
export interface Failure { error: string; code: string; field?: string }
type DiscardAction = 'list' | 'refresh' | 'repair'
export type Confirmation =
  | { kind: 'discard'; action: DiscardAction }
  | { kind: 'delete'; entry: PresetEntry }
  | { kind: 'display'; request: SavePreset }
export interface PresetsSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  list?: PresetList
  draft?: Draft
  failure?: Failure
  listError?: Failure
  busy: boolean
  confirmation?: Confirmation
  notice?: string
  catalog?: ModelCatalog
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  catalogError?: string
}
export interface PresetsClient {
  call<T>(endpoint: 'list' | 'save' | 'remove', payload: unknown): Promise<PresetReply<T>>
  models(): Promise<ModelCatalog>
}

export function saveRequest(draft: Draft): SavePreset {
  const { original, mode } = draft
  const updating = mode === 'edit' || mode === 'repair'
  const request: SavePreset = { id: updating ? original!.id : draft.fields.name ?? '', version: updating ? original!.version : null }
  if (mode === 'repair') return { ...request, source: draft.source }
  const patch: SavePreset['patch'] = {}
  for (const key of PRESET_KEYS) {
    if (updating && key === 'name') continue
    const value = draft.fields[key] ?? ''
    const before = updating ? original!.fields[key] ?? '' : ''
    if (value !== before) patch[key] = value === '' ? null : value
  }
  if (Object.keys(patch).length) request.patch = patch
  if (updating ? draft.body !== original!.body : draft.body !== '') request.body = draft.body
  return request
}

export function isDirty(draft?: Draft): boolean {
  if (!draft) return false
  if (draft.mode === 'repair') return draft.source !== draft.original!.source
  const request = saveRequest(draft)
  return Boolean(request.patch || (draft.mode === 'edit' ? request.body !== undefined : draft.body !== ''))
}

const caught = (error: unknown): Failure => ({ error: error instanceof Error ? error.message : String(error), code: 'transport' })

/** One instance per plugin activation: React mounting/unmounting never owns drafts. */
export class PresetsController {
  private snapshot: PresetsSnapshot = { status: 'idle', busy: false, catalogStatus: 'idle' }
  private readonly listeners = new Set<() => void>()
  private disposed = false
  private loading?: Promise<void>
  private catalogLoading?: Promise<void>
  private readonly client: PresetsClient
  constructor(client: PresetsClient) { this.client = client }
  getSnapshot = (): PresetsSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  dispose(): void { this.disposed = true; this.listeners.clear() }
  private publish(patch: Partial<PresetsSnapshot>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  /** Opening refreshes the roster without replacing an in-progress draft or its revision. */
  open(): void { void this.load(); void this.loadModels() }
  load(): Promise<void> {
    if (this.loading) return this.loading
    this.publish({ status: 'loading' })
    this.loading = this.fetchList().finally(() => { this.loading = undefined })
    return this.loading
  }
  private async fetchList(): Promise<void> {
    try {
      const reply = await this.client.call<PresetList>('list', null)
      if (reply.ok) this.publish({ status: 'ready', list: reply.value, listError: undefined })
      else this.publish({ status: 'error', listError: reply })
    } catch (error) { this.publish({ status: 'error', listError: caught(error) }) }
  }
  loadModels(): Promise<void> {
    if (this.catalogLoading) return this.catalogLoading
    this.publish({ catalogStatus: 'loading', catalogError: undefined })
    this.catalogLoading = this.client.models().then(
      catalog => this.publish({ catalogStatus: 'ready', catalog, catalogError: undefined }),
      error => this.publish({ catalogStatus: 'error', catalogError: caught(error).error }),
    ).finally(() => { this.catalogLoading = undefined })
    return this.catalogLoading
  }
  start(mode: DraftMode, original?: PresetEntry): void {
    if (this.snapshot.busy || this.snapshot.draft) return
    if (original && (!original.structured || original.error) && mode !== 'repair') mode = 'repair'
    const fields = mode === 'create' ? {} : { ...original!.fields }
    if (mode === 'copy') delete fields.name
    if (mode === 'edit' || mode === 'repair') fields.name = original!.id
    this.publish({ draft: { mode, original, fields, body: original?.body ?? '', source: original?.source ?? '', advanced: false }, failure: undefined, notice: undefined })
  }
  field(key: PresetKey, value: string): void {
    const draft = this.snapshot.draft
    if (!draft || this.snapshot.busy || this.snapshot.confirmation || ((draft.mode === 'edit' || draft.mode === 'repair') && key === 'name')) return
    this.publish({ draft: { ...draft, fields: { ...draft.fields, [key]: value } }, failure: undefined })
  }
  text(key: 'body' | 'source', value: string): void {
    if (!this.snapshot.draft || this.snapshot.busy || this.snapshot.confirmation) return
    this.publish({ draft: { ...this.snapshot.draft, [key]: value }, failure: undefined })
  }
  advanced(open: boolean): void {
    if (this.snapshot.draft) this.publish({ draft: { ...this.snapshot.draft, advanced: open } })
  }
  discard(action: DiscardAction): void {
    if (this.snapshot.busy || this.snapshot.confirmation) return
    if (isDirty(this.snapshot.draft)) this.publish({ confirmation: { kind: 'discard', action } })
    else this.finishDiscard(action)
  }
  private finishDiscard(action: DiscardAction): void {
    if (action === 'repair') {
      const original = this.snapshot.draft?.original
      this.publish({ draft: undefined, confirmation: undefined, failure: undefined })
      if (original) this.start('repair', original)
      return
    }
    this.publish({ draft: undefined, confirmation: undefined, failure: undefined, notice: undefined })
    if (action === 'refresh') this.open()
  }
  askDelete(entry: PresetEntry): void {
    if (!this.snapshot.busy && !this.snapshot.confirmation) this.publish({ confirmation: { kind: 'delete', entry }, failure: undefined })
  }
  cancelConfirmation(): void { if (!this.snapshot.busy) this.publish({ confirmation: undefined }) }
  async confirm(): Promise<void> {
    const confirmation = this.snapshot.confirmation
    if (!confirmation || this.snapshot.busy) return
    if (confirmation.kind === 'discard') this.finishDiscard(confirmation.action)
    else if (confirmation.kind === 'display') await this.persist({ ...confirmation.request, confirmDisplayName: true })
    else {
      this.publish({ busy: true, confirmation: undefined, failure: undefined })
      try {
        const reply = await this.client.call<null>('remove', { id: confirmation.entry.id, version: confirmation.entry.version })
        if (!reply.ok) this.publish({ failure: reply })
        else { this.publish({ notice: `已删除 ${confirmation.entry.id}.md` }); await this.loading; await this.load() }
      } catch (error) { this.publish({ failure: caught(error) }) }
      finally { this.publish({ busy: false }) }
    }
  }
  async save(): Promise<void> {
    const draft = this.snapshot.draft
    if (!draft || this.snapshot.busy || this.snapshot.confirmation) return
    const request = saveRequest(draft)
    const previous = draft.original?.fields.display_name ?? ''
    if (draft.mode === 'edit' && (draft.fields.display_name ?? '') !== previous) this.publish({ confirmation: { kind: 'display', request } })
    else await this.persist(request)
  }
  private async persist(request: SavePreset): Promise<void> {
    this.publish({ busy: true, confirmation: undefined, failure: undefined })
    try {
      const reply = await this.client.call<PresetEntry>('save', request)
      if (!reply.ok) {
        // Raw repair is parsed only by the host; it requests label confirmation after validation.
        if (reply.code === 'confirmation_required') this.publish({ confirmation: { kind: 'display', request } })
        else this.publish({ failure: reply })
      } else {
        this.publish({ draft: undefined, notice: `已保存 ${reply.value.id}.md` })
        await this.loading
        await this.load()
      }
    } catch (error) { this.publish({ failure: caught(error) }) }
    finally { this.publish({ busy: false }) }
  }
}
