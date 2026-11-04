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
/**
 * Normalize one config value into a live reference. The loader hands
 * `.volatile()` schema fields to `apply` as live `Volatile<T>` refs; a plain
 * value (tests, an older loader, a hand-built config object) is wrapped in a
 * constant reference so the consumers can read `.get()` unconditionally.
 */
export function asVolatileRef(value) {
    if (value !== undefined && value !== null && typeof value.get === 'function') {
        return value;
    }
    return { get: () => value };
}
/** Normalize the six jev keys off the merged Config object. */
export function ptcConfigOf(config) {
    return {
        jevEnabled: asVolatileRef(config['jevEnabled']),
        jevBackend: asVolatileRef(config['jevBackend']),
        jevModel: asVolatileRef(config['jevModel']),
        jevTimeoutMs: asVolatileRef(config['jevTimeoutMs']),
        jevSecretFile: asVolatileRef(config['jevSecretFile']),
        storageDir: asVolatileRef(config['storageDir']),
    };
}
//# sourceMappingURL=config.js.map