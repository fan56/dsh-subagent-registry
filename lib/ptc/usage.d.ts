/**
 * usage.jsonl — the jev call telemetry sink for this plugin, one row per
 * `jev.classify` binding call (successes and failures alike — the fallback
 * rate is the health metric, so failed calls must be counted). Ported from
 * the dsh-mcp-adapter decisions.jsonl mechanics with the lane/verdict layers
 * dropped: this plugin has ONE seam, so the call layer is the whole log.
 *
 * Field whitelist enforced at the append site: extra fields on a caller's
 * row cannot leak into the file, and the state/questions text never travels
 * — metadata and token counts only.
 *
 * 512KB auto-compaction keeps the most recent quarter; appends serialize
 * through a per-log queue so a compaction rewrite can never interleave with
 * an append; every write failure is swallowed silently (fail-open extends to
 * the stats itself). Nothing here resolves the dsh home — the directory is
 * injected by the caller, which keeps the module testable against a temp
 * dir.
 *
 * @module usage
 */
/** The usage sink file name inside the plugin's storage directory. */
export declare const USAGE_FILE_NAME = "usage.jsonl";
/** Absolute usage.jsonl path for one directory. */
export declare function usageFile(dir: string): string;
/** Why a classify call ended — the family outcome vocabulary. */
export type JevUsageOutcome = 'ok' | 'timeout' | 'network' | 'http_4xx' | 'http_5xx' | 'bad_json' | 'secret_gate_blocked' | 'missing_key'
/** Local pre-flight refusal (malformed binding arguments) — nothing was sent. */
 | 'invalid_request';
/** Token accounting exactly as the strict validator normalized it. */
export interface JevUsageTokens {
    input_tokens: number;
    output_tokens: number;
}
/** One call-layer row. The whitelist is enforced by the only writer. */
export interface JevUsageRow {
    at: string;
    backend: string;
    model: string;
    questionCount: number;
    stateChars: number;
    latencyMs: number;
    usage: JevUsageTokens | null;
    outcome: JevUsageOutcome;
}
/** One injected log handle — build once at apply time, keep the reference. */
export interface UsageLog {
    /** Absolute path this log appends to. */
    file(): string;
    /** Append one call-layer row (field whitelist enforced). Never rejects. */
    append(rec: JevUsageRow): Promise<void>;
}
/**
 * Build the usage.jsonl log over one directory. Cheap and side-effect free:
 * the directory is created lazily on the first append.
 */
export declare function createUsageLog(logDir: string): UsageLog;
