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

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

/** The usage sink file name inside the plugin's storage directory. */
export const USAGE_FILE_NAME = 'usage.jsonl'

/** Absolute usage.jsonl path for one directory. */
export function usageFile(dir: string): string {
  return join(dir, USAGE_FILE_NAME)
}

/** Why a classify call ended — the family outcome vocabulary. */
export type JevUsageOutcome =
  | 'ok'
  | 'timeout'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'bad_json'
  | 'secret_gate_blocked'
  | 'missing_key'
  /** Local pre-flight refusal (malformed binding arguments) — nothing was sent. */
  | 'invalid_request'

/** Token accounting exactly as the strict validator normalized it. */
export interface JevUsageTokens {
  input_tokens: number
  output_tokens: number
}

/** One call-layer row. The whitelist is enforced by the only writer. */
export interface JevUsageRow {
  at: string
  backend: string
  model: string
  questionCount: number
  stateChars: number
  latencyMs: number
  usage: JevUsageTokens | null
  outcome: JevUsageOutcome
}

const COMPACT_LIMIT = 512 * 1024 // ~512KB cap, same as the family ilog sidecars

/** One injected log handle — build once at apply time, keep the reference. */
export interface UsageLog {
  /** Absolute path this log appends to. */
  file(): string
  /** Append one call-layer row (field whitelist enforced). Never rejects. */
  append(rec: JevUsageRow): Promise<void>
}

/**
 * Build the usage.jsonl log over one directory. Cheap and side-effect free:
 * the directory is created lazily on the first append.
 */
export function createUsageLog(logDir: string): UsageLog {
  const file = usageFile(logDir)

  // Serialized so the compaction rewrite cannot interleave with an append.
  // Per-log, so two logs never block each other.
  let queue: Promise<unknown> = Promise.resolve()

  function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = queue.then(op, op)
    queue = run.catch(() => undefined)
    return run
  }

  /** All write failures die HERE — never upstream. */
  async function appendLine(line: string): Promise<void> {
    await enqueue(async () => {
      try {
        await mkdir(logDir, { recursive: true })
        await appendFile(file, `${line}\n`, 'utf8')
        await compactIfNeeded(file)
      } catch {
        // fail-open: a broken stats sink must never break the feature
      }
    })
  }

  // ~512KB cap; keep the most recent quarter when exceeded (headroom for the
  // next window).
  async function compactIfNeeded(target: string): Promise<void> {
    let raw: string
    try {
      raw = await readFile(target, 'utf8')
    } catch {
      return
    }
    if (raw.length <= COMPACT_LIMIT) return
    const lines = raw.split('\n').filter((l) => l.trim() !== '')
    const keep = lines.slice(-Math.max(1, Math.floor(lines.length / 4)))
    const tmp = `${target}.tmp-${randomUUID()}`
    try {
      await writeFile(tmp, keep.map((l) => `${l}\n`).join(''), 'utf8')
      await rename(tmp, target)
    } catch {
      // swallow — the next append retries the compaction
    }
  }

  async function append(rec: JevUsageRow): Promise<void> {
    // Field whitelist: anything extra on the caller's row is dropped, so no
    // state text can sneak in.
    await appendLine(JSON.stringify({
      at: rec.at,
      backend: rec.backend,
      model: rec.model,
      questionCount: rec.questionCount,
      stateChars: rec.stateChars,
      latencyMs: rec.latencyMs,
      usage:
        rec.usage === null
          ? null
          : { input_tokens: rec.usage.input_tokens, output_tokens: rec.usage.output_tokens },
      outcome: rec.outcome,
    }))
  }

  return { file: () => file, append }
}
