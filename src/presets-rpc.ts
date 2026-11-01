import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { PRESETS_CHANNEL, PRESETS_ENDPOINT_PREFIX, type PresetReply } from './preset-contract.ts'
import { createPresetStore } from './preset-store.ts'

/** Public exact Connection routes inherit the /api authentication and Host/Origin fence. */
export async function registerPresetsRpc(ctx: Context, directory: string, refreshRoster: () => Promise<void>): Promise<void> {
  const store = createPresetStore(directory)
  const { clientRequestSchema } = await import('@deepseek-ai/dsh-client-connection')
  for (const endpoint of ['list', 'save', 'remove']) {
    const method = `${PRESETS_ENDPOINT_PREFIX}${endpoint}`
    // rpc.handle captures the provider's shadow context, which cannot read webServer
    // on either supported SDK. Exact Connection routes use the existing authenticated bridge.
    ctx.connection.fetch.register({
      path: `${PRESETS_CHANNEL}/${method}`, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response('expected application/json', { status: 415 })
        let raw: unknown
        try { raw = await request.json() } catch { return new Response('invalid JSON', { status: 400 }) }
        const envelope = clientRequestSchema.safeParse(raw)
        if (!envelope.success || envelope.data.method !== method) return new Response('invalid RPC envelope', { status: 400 })
        let reply: PresetReply<unknown>
        try {
          request.signal.throwIfAborted()
          const payload = envelope.data.payload
          let value: unknown
          if (endpoint === 'list') {
            if (payload !== null && payload !== undefined) throw Object.assign(new Error('列表请求不接受参数'), { code: 'invalid_input' })
            value = await store.list()
          } else if (endpoint === 'save') value = await store.save(payload)
          else { await store.remove(payload); value = null }
          // A completed file operation stays committed even if the request is then cancelled.
          try { await refreshRoster() } catch (error) {
            throw Object.assign(new Error(`文件操作已完成，但名册刷新失败，请刷新重试：${error instanceof Error ? error.message : String(error)}`), { code: 'roster_refresh_failed' })
          }
          reply = { ok: true, value }
        } catch (error) {
          const detail = error instanceof Error ? error : new Error(String(error))
          const code = 'code' in detail && typeof detail.code === 'string' ? detail.code : 'io_error'
          const field = 'field' in detail && typeof detail.field === 'string' ? detail.field : undefined
          reply = { ok: false, error: detail.message, code, ...(field === undefined ? {} : { field }) }
        }
        return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result: { ok: true, value: reply } })
      },
    })
  }
}
