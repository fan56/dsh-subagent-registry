// Migrated verbatim from @aiwayds/dsh-ptc-subagent (merged into this registry in 0.18.0); import paths re-pointed at lib/ptc/.
// usage.jsonl sink tests — the injected-directory port of the family
// decisions.jsonl mechanics: queued appends, the field whitelist, 512KB
// compaction keeping the most recent quarter, and swallowed write failures.
// Fully offline (temp dirs only).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createUsageLog, usageFile, USAGE_FILE_NAME } = await import('../lib/ptc/usage.js')

function freshLog() {
  const dir = mkdtempSync(join(tmpdir(), 'ptc-subagent-usage-'))
  return {
    dir,
    log: createUsageLog(dir),
    file: usageFile(dir),
    rows: () => readFileSync(usageFile(dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function row(overrides = {}) {
  return {
    at: '2026-10-14T00:00:00.000Z',
    backend: 'zen',
    model: 'jev-1.13-free',
    questionCount: 3,
    stateChars: 512,
    latencyMs: 448,
    usage: { input_tokens: 120, output_tokens: 15 },
    outcome: 'ok',
    ...overrides,
  }
}

test('appends are line JSON; concurrent appends serialize into clean lines', async () => {
  const t = freshLog()
  try {
    await Promise.all([
      t.log.append(row({ outcome: 'ok' })),
      t.log.append(row({ outcome: 'timeout', model: 'x' })),
      t.log.append(row({ outcome: 'http_4xx' })),
    ])
    const rows = t.rows()
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.map((r) => r.outcome).sort(), ['http_4xx', 'ok', 'timeout'])
  } finally {
    t.cleanup()
  }
})

test('the field whitelist drops caller extras — state text can never reach the file', async () => {
  const t = freshLog()
  try {
    await t.log.append(row({ state: 'SECRET PROMPT CONTENT', questions: { q: {} }, extra: 'junk' }))
    const raw = readFileSync(t.file, 'utf8')
    assert.ok(!raw.includes('SECRET PROMPT CONTENT'), 'no state text on disk')
    const parsed = JSON.parse(raw)
    assert.deepEqual(Object.keys(parsed).sort(), [
      'at', 'backend', 'latencyMs', 'model', 'outcome', 'questionCount', 'stateChars', 'usage',
    ])
  } finally {
    t.cleanup()
  }
})

test('a null usage row serializes as null, not an object of zeros', async () => {
  const t = freshLog()
  try {
    await t.log.append(row({ usage: null, outcome: 'missing_key' }))
    assert.equal(t.rows()[0].usage, null)
  } finally {
    t.cleanup()
  }
})

test('compaction keeps only the most recent quarter past 512KB', async () => {
  const t = freshLog()
  try {
    // ~3600 rows × ~170 bytes ≈ 610KB — just over the cap.
    const total = 3600
    for (let i = 0; i < total; i += 1) {
      await t.log.append(row({ questionCount: i }))
    }
    assert.ok(statSync(t.file).size > 0)
    const rows = t.rows()
    assert.ok(rows.length < total, `compaction shrank the log (${rows.length} rows kept of ${total})`)
    assert.ok(rows.length >= total / 4, 'at least the most recent quarter survives')
    // The KEPT rows are the newest ones (highest questionCount), in order.
    const counts = rows.map((r) => r.questionCount)
    assert.equal(counts.at(-1), total - 1, 'the newest row survives')
    assert.deepEqual(counts, [...counts].sort((a, b) => a - b), 'log order is preserved')
    assert.ok(counts[0] >= Math.floor(total / 4) - 1, 'the kept window is the recent one')
  } finally {
    t.cleanup()
  }
})

test('write failures are swallowed — a broken sink never breaks the caller', async (t0) => {
  const dir = mkdtempSync(join(tmpdir(), 'ptc-subagent-usage-bad-'))
  // A FILE where the directory should be: mkdir + append both fail.
  const blocker = join(dir, 'blocker')
  writeFileSync(blocker, 'not a directory', 'utf8')
  const log = createUsageLog(join(blocker, 'nested'))
  let failed = false
  try {
    await log.append(row())
  } catch {
    failed = true
  }
  assert.equal(failed, false, 'append never rejects')
  await log.append(row())
  assert.equal(existsSync(join(blocker, 'nested', USAGE_FILE_NAME)), false)
  rmSync(dir, { recursive: true, force: true })
})

test('the directory is created lazily — building the log touches nothing', () => {
  const dir = join(tmpdir(), `ptc-subagent-usage-lazy-${Date.now()}-${process.pid}`)
  const log = createUsageLog(dir)
  assert.equal(existsSync(dir), false, 'no side effects at construction')
  rmSync(dir, { recursive: true, force: true })
  void log
})
