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
import { type KeySources } from '@aiwayds/dsh-jev-core';
import type { PtcBindingNamespace } from '@deepseek-ai/dsh-ptc-runtime';
import type { PtcSubagentConfig } from '../config.ts';
import type { UsageLog } from '../usage.ts';
/** The program-visible global name of this namespace. */
export declare const JEV_GLOBAL = "jev";
/** One classify call as the codemode result reports it (metadata only). */
export type JevCallMeta = {
    /** The model that answered (may differ from the requested id when aliases resolve). */
    model: string;
    /** Normalized token accounting, null when the response carried none. */
    usage: {
        input_tokens: number;
        output_tokens: number;
    } | null;
    latencyMs: number;
};
/** Per-run collector the runner aggregates into the codemode result. */
export interface JevCollector {
    jevCalls: JevCallMeta[];
}
/** Everything the binding closes over; injected so tests stay offline. */
export interface JevBindingDeps {
    config: PtcSubagentConfig;
    log: UsageLog;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    keychainRunner?: (args: readonly string[]) => string | null;
    readFile?: typeof import('node:fs/promises').readFile;
}
/** The backend table — ported from the dsh-mcp-adapter family table. Model
 *  ids are PINNED versioned ids: aliases drift silently across releases. */
export interface JevBackend {
    readonly name: 'zen' | 'native' | 'openrouter';
    readonly endpoint: string;
    readonly defaultModel: string;
    readonly keyEnv: string;
    readonly keychainService: string;
    /** Only zen falls back to its default keychain service when JEV_KEYCHAIN
     *  is unset; the others require an explicit JEV_KEYCHAIN. */
    readonly keychainByDefault: boolean;
}
export declare const BACKENDS: Readonly<Record<JevBackend['name'], JevBackend>>;
/** Resolve a config value to a backend; anything but a known name lands on
 *  the config default `zen`. */
export declare function resolveBackend(name: string | undefined): JevBackend;
/**
 * The backend's key chain, expressed through the core's KeySources so the
 * keychain leg stays memoized and non-throwing: env `<keyEnv>` first, then
 * the keychain — zen's own service by default, the others only with an
 * explicit `JEV_KEYCHAIN`. An empty `env` object stops the core's generic
 * TYPESAFE/JEV env legs from bypassing the backend's own chain. The caller's
 * keychain runner (injected in tests) rides along when given.
 */
export declare function resolveKeySources(backend: JevBackend, env: NodeJS.ProcessEnv, keychainRunner?: (args: readonly string[]) => string | null): KeySources | null;
/** Whether the enabled backend's key chain resolves to a key (no network). */
export declare function resolveConfigured(deps: JevBindingDeps): boolean;
/** The structured failure the binding resolves instead of rejecting. Every
 *  member is lossless JSON, so the shape is directly a PtcJsonValue. */
export type JevBindingError = {
    error: 'disabled' | 'invalid-request' | 'secret-gate' | 'no-key' | 'timeout' | 'http' | 'invalid-response' | 'network';
    message: string;
    status?: number;
};
/** Read the secret-file literal list (one per line); unreadable = empty. */
export declare function readSecretLiterals(path: string, readFileImpl: typeof import('node:fs/promises').readFile): Promise<string[]>;
/** Whether any literal (len ≥ 8, so single words cannot wedge every call)
 *  appears in the outbound body. */
export declare function bodyContainsSecret(literals: readonly string[], body: string): boolean;
/**
 * Build the `jev` namespace for one codemode run. The abort signal is the
 * run's linked controller (the runner aborts it when the host cancels the
 * tool call); the collector receives one metadata row per successful call.
 */
export declare function createJevBinding(deps: JevBindingDeps, signal: AbortSignal, collector: JevCollector): PtcBindingNamespace;
