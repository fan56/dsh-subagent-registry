/**
 * The `registry-acp` provider: a one-shot, foreground-only dispatcher for the
 * built-in `agy` member. It advertises no start capabilities, owns a small
 * serialisation counter for agy's SQLite contention, and never reads the
 * working directory — the host manager already resolved `request.cwd`.
 *
 * @module acp/provider
 */

import {
  NO_START_CAPABILITIES,
  type ResolvedSubagentStartRequest,
  type SubagentRun,
  type SubagentProvider,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { assertTopLevelCaller } from '../caller-guard.ts'
import { ACP_CODES, classifyAcpError } from './errors.ts'
import { startAgyRun, type AgyPermissionPolicy, type AgyRunDeps } from './run.ts'

export interface AgyAcpProviderOptions {
  /** Executable and arguments (defaults: `agy`, `['acp']`). */
  command?: string
  args?: readonly string[]
  /** Concurrency cap for agy's database; default 1. Over-cap calls fail, never queue. */
  maxConcurrent?: number
  /** `agyPermission`; default `reject`. */
  permission?: AgyPermissionPolicy
  handshakeTimeoutMs?: number
  timeoutMs?: number
  eofGraceMs?: number
  graceMs?: number
  model?: string
  env?: NodeJS.ProcessEnv
  /** Subprocess seam supplied by the host (`ctx.subprocess.spawn`). */
  spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Diagnostic sink for post-publication failures. */
  onError?: (error: Error, stopReason: SubagentStopReason) => void
  /** Log sink (tests capture it; production passes `ctx.logger`). */
  log?: AgyRunDeps
}

/**
 * Max concurrent agy processes. The host does not queue over-cap calls; this
 * counter follows the same rule so a parallel tool step cannot wedge behind a
 * chain of ten-minute tasks.
 */
export const DEFAULT_MAX_CONCURRENT = 1

export class AgyAcpProvider implements SubagentProvider {
  readonly name = 'registry-acp'
  readonly capabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false
  // Intentionally no `prepareContinuable`: the host routes this provider
  // through the external start path, which never reserves a childId/persona.

  active = 0
  private readonly options: AgyAcpProviderOptions
  private readonly deps: AgyRunDeps

  constructor(options: AgyAcpProviderOptions) {
    this.options = options
    this.deps = options.log ?? {}
  }

  /** Read per start: `agyMaxConcurrent` is volatile and must apply without a remount. */
  get maxConcurrent(): number {
    return this.options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
  }

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    // Reuse the existing identity check verbatim; a nested caller (including a
    // native tool that somehow selects this provider) is refused before spawn.
    assertTopLevelCaller({ agent: request.parent })
    if (request.signal.aborted) throw classifyAcpError({ code: ACP_CODES.ABORTED }, 'process')
    if (this.active >= this.maxConcurrent) {
      throw classifyAcpError({ code: ACP_CODES.BUSY }, 'process')
    }
    this.active++

    let run: SubagentRun
    try {
      // A per-dispatch model family on the activation spec (set by a
      // `use_agent` agyModel argument) overrides the volatile config value.
      const perCallModel = (request as ResolvedSubagentStartRequest & { model?: string }).model
      const model = perCallModel !== undefined && perCallModel !== '' ? perCallModel : this.options.model
      run = await startAgyRun(request, {
        cwd: request.cwd,
        command: this.options.command,
        args: this.options.args,
        permission: this.options.permission,
        handshakeTimeoutMs: this.options.handshakeTimeoutMs,
        timeoutMs: this.options.timeoutMs,
        eofGraceMs: this.options.eofGraceMs,
        graceMs: this.options.graceMs,
        model,
        env: this.options.env,
        spawn: this.options.spawn,
        onError: this.options.onError,
      }, this.deps)
    } catch (error: unknown) {
      this.active--
      throw error
    }

    let released = false
    const release = (): void => {
      if (released) return
      released = true
      this.active--
    }
    const dispose = (): Promise<void> => run.dispose().then(
      () => {},
      // The host's dispose() can reject during teardown; a delayed rejection
      // must not escape into an already-settled abort/settle path.
      (error: unknown) => {
        this.deps.warn?.(`[agy-acp] dispose failed: ${error instanceof Error ? error.message : String(error)}`)
      },
    ).finally(() => {
      request.signal.removeEventListener('abort', onAbort)
      release()
    })
    const onAbort = (): void => {
      // The host forwards the caller's signal only during startup. After the
      // run is published nothing forwards it, so observe it here and dispose.
      // A rejected dispose must not become an unhandled rejection: release the
      // slot and finish the abort path regardless.
      void dispose().catch((error: unknown) => {
        this.deps.warn?.(`[agy-acp] dispose on abort failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    if (request.signal.aborted) onAbort()
    else request.signal.addEventListener('abort', onAbort, { once: true })

    return { id: run.id, result: run.result, dispose }
  }
}
