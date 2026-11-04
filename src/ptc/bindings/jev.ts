/**
 * The `jev` binding namespace — a 1:1 passthrough to @aiwayds/dsh-jev-core's
 * `classify`/`isConfigured` (decision #9: concurrency is PTC's own ability,
 * the host adds no sugar).
 *
 * Programs see one global object `jev` with two async functions:
 *
 * - `jev.classify({ questions, state })` — one batched decision call, N
 *   atomic questions (choice / score / noul). Resolves with the core's
 *   strictly validated `{ answers, model, usage, latencyMs }`. It NEVER
 *   rejects into the program: every failure — disabled backend, missing key,
 *   HTTP error, timeout, unparseable answer — resolves a structured
 *   `{ error, message, ... }` result instead, so a batch loop can branch on
 *   the shape and keep going. The namespace's `JevError` error class exists
 *   for the runtime's typed-rejection contract, not for this binding's own
 *   results.
 * - `jev.isConfigured()` — the jev-optional branch point: true when the
 *   plugin is enabled AND the configured backend's key chain resolves.
 *
 * Configuration is read per call (volatile refs), so a settings-page edit
 * applies to the next classify without remounting anything. Defaults align
 * the zen free tier: `https://opencode.ai/zen/v1/systemone`, model
 * `jev-1.13-free`, key chain = env `JEV_ZEN_API_KEY` → macOS Keychain
 * `opencode-zen-inference` (native/openrouter require an explicit
 * `JEV_KEYCHAIN` before their keychain leg is consulted).
 *
 * Every call — including failures — lands one whitelisted row in the
 * plugin's usage.jsonl sink. The outbound body is scanned against the
 * `jevSecretFile` literal list (plus the built-in token patterns from the
 * core wire contract's threat model) before anything leaves the process; a
 * hit blocks the call with a structured `secret-gate` result.
 *
 * @module bindings/jev
 */

import {
  JevHttpError,
  JevInvalidResponseError,
  JevNoKeyError,
  JevTimeoutError,
  classify,
  isConfigured,
  type KeySources,
} from '@aiwayds/dsh-jev-core'
import type { JevQuestions } from '@aiwayds/dsh-jev-core'
import type { PtcBindingNamespace, PtcJsonValue } from '@deepseek-ai/dsh-ptc-runtime'
import { readFile as readFileImpl } from 'node:fs/promises'
import type { PtcSubagentConfig } from '../config.ts'
import type { JevUsageOutcome, UsageLog } from '../usage.ts'

/** The program-visible global name of this namespace. */
export const JEV_GLOBAL = 'jev'

/** One classify call as the codemode result reports it (metadata only). */
export type JevCallMeta = {
  /** The model that answered (may differ from the requested id when aliases resolve). */
  model: string
  /** Normalized token accounting, null when the response carried none. */
  usage: { input_tokens: number; output_tokens: number } | null
  latencyMs: number
}

/** Per-run collector the runner aggregates into the codemode result. */
export interface JevCollector {
  jevCalls: JevCallMeta[]
}

/** Everything the binding closes over; injected so tests stay offline. */
export interface JevBindingDeps {
  config: PtcSubagentConfig
  log: UsageLog
  env: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  keychainRunner?: (args: readonly string[]) => string | null
  readFile?: typeof import('node:fs/promises').readFile
}

/** The backend table — ported from the dsh-mcp-adapter family table. Model
 *  ids are PINNED versioned ids: aliases drift silently across releases. */
export interface JevBackend {
  readonly name: 'zen' | 'native' | 'openrouter'
  readonly endpoint: string
  readonly defaultModel: string
  readonly keyEnv: string
  readonly keychainService: string
  /** Only zen falls back to its default keychain service when JEV_KEYCHAIN
   *  is unset; the others require an explicit JEV_KEYCHAIN. */
  readonly keychainByDefault: boolean
}

export const BACKENDS: Readonly<Record<JevBackend['name'], JevBackend>> = {
  zen: {
    name: 'zen',
    endpoint: 'https://opencode.ai/zen/v1/systemone',
    defaultModel: 'jev-1.13-free',
    keyEnv: 'JEV_ZEN_API_KEY',
    keychainService: 'opencode-zen-inference',
    keychainByDefault: true,
  },
  native: {
    name: 'native',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    defaultModel: 'jev-1.13.0',
    keyEnv: 'TYPESAFE_API_KEY',
    keychainService: 'jev-typesafe',
    keychainByDefault: false,
  },
  openrouter: {
    name: 'openrouter',
    endpoint: 'https://openrouter.ai/api/alpha/decisions',
    defaultModel: 'typesafe/jev-1.13',
    keyEnv: 'OPENROUTER_API_KEY',
    keychainService: 'openrouter-inference',
    keychainByDefault: false,
  },
}

/** Resolve a config value to a backend; anything but a known name lands on
 *  the config default `zen`. */
export function resolveBackend(name: string | undefined): JevBackend {
  if (name === 'native' || name === 'openrouter') return BACKENDS[name]
  return BACKENDS.zen
}

/** A blank env value carries no key. */
function blankEnv(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/**
 * The backend's key chain, expressed through the core's KeySources so the
 * keychain leg stays memoized and non-throwing: env `<keyEnv>` first, then
 * the keychain — zen's own service by default, the others only with an
 * explicit `JEV_KEYCHAIN`. An empty `env` object stops the core's generic
 * TYPESAFE/JEV env legs from bypassing the backend's own chain. The caller's
 * keychain runner (injected in tests) rides along when given.
 */
export function resolveKeySources(
  backend: JevBackend,
  env: NodeJS.ProcessEnv,
  keychainRunner?: (args: readonly string[]) => string | null,
): KeySources | null {
  const direct = env[backend.keyEnv]
  if (!blankEnv(direct)) return { apiKey: direct, env: {} }
  const keychainSpec = !blankEnv(env['JEV_KEYCHAIN'])
    ? env['JEV_KEYCHAIN']
    : (backend.keychainByDefault ? backend.keychainService : undefined)
  if (keychainSpec === undefined) return null
  return {
    keychainSpec,
    env: {},
    ...(keychainRunner !== undefined ? { keychainRunner } : {}),
  }
}

/** Whether the enabled backend's key chain resolves to a key (no network). */
export function resolveConfigured(deps: JevBindingDeps): boolean {
  if (!deps.config.jevEnabled.get()) return false
  const backend = resolveBackend(deps.config.jevBackend.get())
  const sources = resolveKeySources(backend, deps.env, deps.keychainRunner)
  if (sources === null) return false
  return isConfigured(sources)
}

// ---- outbound secret gate ----

/** The structured failure the binding resolves instead of rejecting. Every
 *  member is lossless JSON, so the shape is directly a PtcJsonValue. */
export type JevBindingError = {
  error: 'disabled' | 'invalid-request' | 'secret-gate' | 'no-key' | 'timeout' | 'http' | 'invalid-response' | 'network'
  message: string
  status?: number
}

/** Read the secret-file literal list (one per line); unreadable = empty. */
export function readSecretLiterals(path: string, readFileImpl: typeof import('node:fs/promises').readFile): Promise<string[]> {
  if (path.trim() === '') return Promise.resolve([])
  return readFileImpl(path, 'utf8')
    .then((raw) => raw.split('\n').map((l) => l.trim()).filter((l) => l !== ''))
    .catch(() => [])
}

/** Whether any literal (len ≥ 8, so single words cannot wedge every call)
 *  appears in the outbound body. */
export function bodyContainsSecret(literals: readonly string[], body: string): boolean {
  return literals.some((l) => l.length >= 8 && body.includes(l))
}

function isoNow(): string {
  return new Date().toISOString()
}

/** Map a thrown value to a structured result + log outcome. */
function failureResult(error: unknown): { result: JevBindingError; outcome: JevUsageOutcome } {
  if (error instanceof JevNoKeyError) return { result: { error: 'no-key', message: error.message }, outcome: 'missing_key' }
  if (error instanceof JevTimeoutError) return { result: { error: 'timeout', message: error.message }, outcome: 'timeout' }
  if (error instanceof JevHttpError) {
    return {
      result: { error: 'http', message: error.message, status: error.status },
      outcome: error.status >= 500 ? 'http_5xx' : 'http_4xx',
    }
  }
  if (error instanceof JevInvalidResponseError) {
    return { result: { error: 'invalid-response', message: error.message }, outcome: 'bad_json' }
  }
  return {
    result: { error: 'network', message: error instanceof Error ? error.message : String(error) },
    outcome: 'network',
  }
}

/** Minimal structural validation of the binding's own arguments — the core
 *  re-validates the wire shape, this only catches garbage early. */
function validateArgs(args: unknown): { questions: JevQuestions; state: string } | string {
  if (typeof args !== 'object' || args === null) return 'classify expects { questions, state }'
  const record = args as { questions?: unknown; state?: unknown }
  if (typeof record.state !== 'string' || record.state === '') return 'classify: state must be a non-empty string'
  if (typeof record.questions !== 'object' || record.questions === null || Array.isArray(record.questions)) {
    return 'classify: questions must be an object keyed by question id'
  }
  const questions = record.questions as JevQuestions
  if (Object.keys(questions).length === 0) return 'classify: questions must not be empty'
  return { questions, state: record.state }
}

/**
 * Build the `jev` namespace for one codemode run. The abort signal is the
 * run's linked controller (the runner aborts it when the host cancels the
 * tool call); the collector receives one metadata row per successful call.
 */
export function createJevBinding(deps: JevBindingDeps, signal: AbortSignal, collector: JevCollector): PtcBindingNamespace {
  async function classifyImpl(args: unknown): Promise<PtcJsonValue> {
    // Per-call volatile reads: a settings-page edit applies to the NEXT call.
    if (!deps.config.jevEnabled.get()) {
      return { error: 'disabled', message: 'the jev decision layer is disabled (enable it via the jevEnabled setting)' }
    }
    const parsed = validateArgs(args)
    if (typeof parsed === 'string') {
      await deps.log.append({
        at: isoNow(), backend: resolveBackend(deps.config.jevBackend.get()).name,
        model: '', questionCount: 0, stateChars: 0, latencyMs: 0, usage: null, outcome: 'invalid_request',
      })
      return { error: 'invalid-request', message: parsed }
    }
    const backend = resolveBackend(deps.config.jevBackend.get())
    const model = deps.config.jevModel.get().trim() !== '' ? deps.config.jevModel.get().trim() : backend.defaultModel
    const timeoutMs = deps.config.jevTimeoutMs.get()

    const sources = resolveKeySources(backend, deps.env, deps.keychainRunner)
    const bodyText = JSON.stringify({ state: parsed.state, questions: parsed.questions })
    const secretFile = deps.config.jevSecretFile.get()
    const literals = await readSecretLiterals(secretFile, deps.readFile ?? readFileImpl)
    if (bodyContainsSecret(literals, bodyText)) {
      await deps.log.append({
        at: isoNow(), backend: backend.name, model, questionCount: Object.keys(parsed.questions).length,
        stateChars: parsed.state.length, latencyMs: 0, usage: null, outcome: 'secret_gate_blocked',
      })
      return {
        error: 'secret-gate',
        message: 'the request body matched a secret from jevSecretFile — nothing was sent; redact the state and retry',
      }
    }

    const startedAt = Date.now()
    try {
      const result = await classify({
        questions: parsed.questions,
        state: parsed.state,
        endpoint: backend.endpoint,
        model,
        timeoutMs,
        signal,
        ...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
        ...(sources ?? {}),
      })
      const tokens = result.usage === null
        ? null
        : {
            input_tokens: typeof result.usage.input_tokens === 'number' ? result.usage.input_tokens : 0,
            output_tokens: typeof result.usage.output_tokens === 'number' ? result.usage.output_tokens : 0,
          }
      collector.jevCalls.push({ model: result.model, usage: tokens, latencyMs: result.latencyMs })
      await deps.log.append({
        at: isoNow(), backend: backend.name, model: result.model,
        questionCount: Object.keys(parsed.questions).length, stateChars: parsed.state.length,
        latencyMs: result.latencyMs, usage: tokens, outcome: 'ok',
      })
      const answers = result.answers as unknown as Record<string, PtcJsonValue>
      return { answers, model: result.model, usage: tokens, latencyMs: result.latencyMs }
    } catch (error) {
      const { result, outcome } = failureResult(error)
      await deps.log.append({
        at: isoNow(), backend: backend.name, model, questionCount: Object.keys(parsed.questions).length,
        stateChars: parsed.state.length, latencyMs: Date.now() - startedAt, usage: null, outcome,
      })
      return result
    }
  }

  return {
    global: JEV_GLOBAL,
    errorClass: { name: 'JevError', memberNameProperty: 'op' },
    functions: {
      classify: classifyImpl,
      isConfigured: async () => resolveConfigured(deps),
    },
  }
}
