/**
 * PTC/jev plugin configuration — the six volatile keys migrated from
 * `@aiwayds/dsh-ptc-subagent` (merged into this registry in 0.18.0), merged
 * into the registry's single Config schema by the caller.
 *
 * Five `jev*` keys are the plugin's independent copy of the dsh ecosystem's
 * per-surface jev settings philosophy (dsh-mcp-adapter keeps its own seven;
 * this plugin needs five — the laya pace-maker is a core-passthrough no-op
 * here by design). All are VOLATILE (dsh 0.1.7 settings contract: a
 * settings-page write swaps the value in place without remounting the
 * plugin), so every consumer reads through the ref per use — nothing is
 * captured at `apply` time.
 *
 * Defaults align the zen free tier: `jevBackend: 'zen'` resolves the
 * `https://opencode.ai/zen/v1/systemone` endpoint, the `jev-1.13-free`
 * model, and the `JEV_ZEN_API_KEY` → macOS Keychain `opencode-zen-inference`
 * key chain. `jevEnabled` defaults to false: a fresh install makes ZERO jev
 * calls — `jev.classify` answers `{ error: 'disabled' }` and nothing else
 * changes.
 *
 * @module ptc/config
 */

/** Live-reference shape for one volatile config value (read per use). The
 *  structural twin of cordis' `Volatile<T>` — declared locally so the module
 *  stays dependency-free in tests. */
export interface VolatileRef<T> {
  get(): T
}

/** The backend a classify call routes to. */
export type JevBackendName = 'zen' | 'native' | 'openrouter'

/** Resolved value of the jev keys, as the codemode toolchain reads them. */
export interface PtcSubagentConfig {
  /** Default-off master switch: false means `jev.classify` is a structured
   *  no-op and no usage sink writes happen. */
  jevEnabled: VolatileRef<boolean>
  /** Decision backend: zen (free, opencode.ai) | native (typesafe
   *  first-party) | openrouter (decisions protocol). */
  jevBackend: VolatileRef<JevBackendName>
  /** Pinned model id; '' = resolve the backend default at call time
   *  (jev-1.13-free / jev-1.13.0 / typesafe/jev-1.13) — an upgrade is a
   *  deliberate act. */
  jevModel: VolatileRef<string>
  /** Single-request timeout in ms (positive integer); one AbortSignal, NO
   *  retry — the program's own Promise.all fan-out is the concurrency story. */
  jevTimeoutMs: VolatileRef<number>
  /** External secret list for the outbound secret gate (one literal per
   *  line); swapping the path hot reloads the list. */
  jevSecretFile: VolatileRef<string>
  /** Usage-sink directory override; empty (default) =
   *  `<dsh home>/storages/ptc-subagent`. */
  storageDir: VolatileRef<string>
}

/**
 * Normalize one config value into a live reference. The loader hands
 * `.volatile()` schema fields to `apply` as live `Volatile<T>` refs; a plain
 * value (tests, an older loader, a hand-built config object) is wrapped in a
 * constant reference so the consumers can read `.get()` unconditionally.
 */
export function asVolatileRef<T>(value: VolatileRef<T> | T | undefined): VolatileRef<T> {
  if (value !== undefined && value !== null && typeof (value as VolatileRef<T>).get === 'function') {
    return value as VolatileRef<T>
  }
  return { get: () => value as T }
}

/** Normalize the six jev keys off the merged Config object. */
export function ptcConfigOf(config: Record<string, unknown>): PtcSubagentConfig {
  return {
    jevEnabled: asVolatileRef(config['jevEnabled'] as boolean | VolatileRef<boolean>),
    jevBackend: asVolatileRef(config['jevBackend'] as JevBackendName | VolatileRef<JevBackendName>),
    jevModel: asVolatileRef(config['jevModel'] as string | VolatileRef<string>),
    jevTimeoutMs: asVolatileRef(config['jevTimeoutMs'] as number | VolatileRef<number>),
    jevSecretFile: asVolatileRef(config['jevSecretFile'] as string | VolatileRef<string>),
    storageDir: asVolatileRef(config['storageDir'] as string | VolatileRef<string>),
  }
}
