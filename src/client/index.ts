import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { PRESETS_CHANNEL, PRESETS_ENDPOINT_PREFIX, type PresetReply } from '../preset-contract.ts'
import { PresetsPage } from './PresetsPage.tsx'
import { PresetsController, type PresetsClient } from './presets-state.ts'
import { AgyPage } from './AgyPage.tsx'
import { AgyController, type AgyClient } from './agy-state.ts'
import { parseSettlement, type AgyCatalogRow, type AgySettlement } from './agy-status.ts'

// Supplied by build-client.mjs inside the ModuleLoader factory, never a global stylesheet.
declare const __PRESETS_CSS__: string
declare const __AGY_CSS__: string
export const PANEL_ID = 'subagent-presets' as MainPanelId
export const PANEL_LABEL = '子智能体'
export const AGY_PANEL_ID = 'subagent-agy' as MainPanelId
export const AGY_PANEL_LABEL = 'agy'
export const inject = ['slots', 'layout', 'connection', 'remote', 'remote.session', 'sessions']

export function SubagentIcon({ size }: { size?: number }) {
  const edge = typeof size === 'number' && size > 0 ? size : 16
  return createElement(
    'svg',
    {
      width: edge,
      height: edge,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
    createElement('circle', { cx: 6.5, cy: 5, r: 2 }),
    createElement('path', { d: 'M6.5 7v12' }),
    createElement('path', { d: 'M6.5 11c3.5 0 3.5-4.5 7-4.5' }),
    createElement('path', { d: 'M6.5 11c3.5 0 3.5 4.5 7 4.5' }),
    createElement('circle', { cx: 16.5, cy: 6.5, r: 2 }),
    createElement('circle', { cx: 16.5, cy: 15.5, r: 2 }),
  )
}

/** Distinct glyph so the agy panel is not visually confused with the presets panel. */
export function AgyIcon({ size }: { size?: number }) {
  const edge = typeof size === 'number' && size > 0 ? size : 16
  return createElement(
    'svg',
    {
      width: edge,
      height: edge,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
    createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }),
    createElement('path', { d: 'M8 12h8M12 8v8' }),
  )
}

const failureText = (error: unknown): string => {
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') return (error as { code: string }).code
  return String(error)
}

/** Adapt the injected host services to the narrow face AgyController consumes. */
function agyClientOf(ctx: Context & { readonly connection: ConnectionHandle }): AgyClient {
  return {
    currentSessionId() {
      // Host precedent: the Session retained under the `mainView` source is the current one.
      const list = ctx.sessions.list.getSnapshot()
      const rows = Object.values(list.byId) as readonly { id: string; retainedBy: { mainView?: number } }[]
      return rows.find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
    },
    catalog(sessionId) {
      const values = ctx.sessions.list.getSnapshot().projectionsBySession[sessionId]?.values as unknown as Record<string, unknown> | undefined
      const raw = values?.subagentCatalog
      if (!Array.isArray(raw)) return []
      const rows: AgyCatalogRow[] = []
      for (const value of raw) {
        if (value === null || typeof value !== 'object') continue
        const candidate = value as Partial<AgyCatalogRow>
        if (candidate.mode !== 'external' || typeof candidate.id !== 'string' || typeof candidate.createdAt !== 'number') continue
        rows.push({ id: candidate.id, createdAt: candidate.createdAt, mode: 'external', label: candidate.label, name: candidate.name })
      }
      return rows
    },
    async settlements(sessionId) {
      const request = { address: { kind: 'session', sessionId }, maxMessages: 200 } as Parameters<typeof ctx.remote.session.page>[0]
      const result = await ctx.remote.session.page(request)
      if (!result.ok) throw new Error(failureText(result.error))
      const found: AgySettlement[] = []
      for (const record of result.value.records) {
        const event = record.event as { type?: unknown; data?: unknown } | undefined
        if (event?.type !== 'user/message') continue
        const settlement = parseSettlement(event.data)
        if (settlement !== undefined) found.push(settlement)
      }
      return found
    },
    async refresh(sessionId) {
      await ctx.sessions.refreshProjections(sessionId as Parameters<typeof ctx.sessions.refreshProjections>[0])
    },
    async interrupt(id) {
      try {
        const result = await ctx.remote.subagents.interruptByUser(id as Parameters<typeof ctx.remote.subagents.interruptByUser>[0])
        return result.ok ? { ok: true } : { ok: false, error: failureText(result.error) }
      } catch (cause) { return { ok: false, error: failureText(cause) } }
    },
    subscribe(listener) { return ctx.sessions.list.subscribe(listener) },
  }
}

export function apply(ctx: Context & { readonly connection: ConnectionHandle }): void {
  const client: PresetsClient = {
    async call<T>(endpoint: 'list' | 'save' | 'remove', payload: unknown): Promise<PresetReply<T>> {
      const result = await ctx.connection.rpc.call(PRESETS_CHANNEL, `${PRESETS_ENDPOINT_PREFIX}${endpoint}`, payload)
      if (!result.ok) throw new Error(result.error.message)
      return result.value as PresetReply<T>
    },
    async models() {
      const result = await ctx.remote.session.modelCatalog()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  }
  const controller = new PresetsController(client)
  const browserLanguage = typeof navigator === 'undefined' ? undefined : navigator.language
  const agyController = new AgyController(agyClientOf(ctx), browserLanguage?.toLowerCase().startsWith('en') ? 'en' : 'zh')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@aiwayds/dsh-subagent-registry'
    style.textContent = __PRESETS_CSS__
    document.head.append(style)
    return () => { style.remove(); controller.dispose() }
  }, 'subagent-presets: style and controller')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@aiwayds/dsh-subagent-registry:agy'
    style.textContent = __AGY_CSS__
    document.head.append(style)
    return () => { style.remove(); agyController.dispose() }
  }, 'subagent-agy: style and controller')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, inject: () => ({ controller }),
  }, PresetsPage))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: AGY_PANEL_ID, inject: () => ({ controller: agyController }),
  }, AgyPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, label: PANEL_LABEL, order: 50,
  }, SubagentIcon))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: AGY_PANEL_ID, label: AGY_PANEL_LABEL, order: 60,
  }, AgyIcon))
}
