// Migrated verbatim from @aiwayds/dsh-ptc-subagent (merged into this registry in 0.18.0); import paths re-pointed at lib/ptc/.
// jev binding tests — fully offline: the HTTP leg is a mock fetchImpl passed
// through the core's injection point, the keychain leg a fake runner, the
// usage sink a temp dir. Covers the three question types end to end, the
// disabled switch, structured failures (never a rejection into the program),
// the secret gate, the per-backend key chain, and the usage log rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createJevBinding, resolveBackend, resolveKeySources, bodyContainsSecret, readSecretLiterals } =
  await import('../lib/ptc/bindings/jev.js')
const { createUsageLog, usageFile } = await import('../lib/ptc/usage.js')
// The core memoizes keychain lookups per spec process-wide; the tests swap
// fake runners for the same spec, so the cache must reset between bindings.
const { clearKeychainCache } = await import('@aiwayds/dsh-jev-core')

/** Volatile-ref lookalike over a plain mutable box (the settings contract's
 *  read-per-use shape). */
function ref(box, key) {
  return { get: () => box[key] }
}

function makeConfig(overrides = {}) {
  const box = {
    jevEnabled: true,
    jevBackend: 'zen',
    jevModel: '',
    jevTimeoutMs: 3000,
    jevSecretFile: '',
    storageDir: '',
    ...overrides,
  }
  return {
    jevEnabled: ref(box, 'jevEnabled'),
    jevBackend: ref(box, 'jevBackend'),
    jevModel: ref(box, 'jevModel'),
    jevTimeoutMs: ref(box, 'jevTimeoutMs'),
    jevSecretFile: ref(box, 'jevSecretFile'),
    storageDir: ref(box, 'storageDir'),
  }
}

/** A fresh offline binding: temp usage dir, mock fetch, no real keychain. */
function makeBinding({ config = makeConfig(), env = {}, fetchImpl, keychainRunner = () => null, readFile } = {}) {
  clearKeychainCache()
  const dir = mkdtempSync(join(tmpdir(), 'ptc-subagent-jev-test-'))
  const log = createUsageLog(dir)
  const collector = { jevCalls: [] }
  const controller = new AbortController()
  const binding = createJevBinding(
    { config, log, env, fetchImpl, keychainRunner, ...(readFile !== undefined ? { readFile } : {}) },
    controller.signal,
    collector,
  )
  return {
    binding,
    collector,
    controller,
    classify: (args) => binding.functions.classify(args),
    isConfigured: () => binding.functions.isConfigured(undefined),
    usageRows: () => {
      try {
        return readFileSync(usageFile(dir), 'utf8').trim().split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
      } catch (error) {
        if (error.code === 'ENOENT') return [] // zero appends — the sink stays silent
        throw error
      }
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** A strictly valid System One response for one of each question type. */
const VALID_RESPONSE = {
  answers: {
    rel: { choice: 'on_topic', probabilities: { on_topic: 0.9, off_topic: 0.1 } },
    quality: { score: 2, probabilities: [0.05, 0.15, 0.6, 0.2] },
    approve: { noul: 0.82 },
  },
  model: 'jev-1.13-test',
  usage: { input_tokens: 120, output_tokens: 15 },
}

const THREE_QUESTIONS = {
  rel: { type: 'choice', criteria: { on_topic: 'about the query', off_topic: 'unrelated' } },
  quality: { type: 'score', criteria: ['Poor', 'Fair', 'Good', 'Excellent'] },
  approve: { type: 'noul', criteria: { true: 'ready', false: 'not ready' } },
}

function okFetch(assertions = () => {}) {
  return async (url, init) => {
    assertions(url, init)
    return new Response(JSON.stringify(VALID_RESPONSE), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

test('classify resolves the three question types through the core and reports metadata', async () => {
  const seen = []
  const t = makeBinding({
    env: { JEV_ZEN_API_KEY: 'k-test' },
    fetchImpl: okFetch((url, init) => seen.push({ url, init })),
  })
  try {
    const out = await t.classify({ questions: THREE_QUESTIONS, state: 'one batched state' })
    assert.equal(out.error, undefined, 'a healthy call is not a structured failure')
    assert.equal(out.answers.rel.kind, 'choice')
    assert.equal(out.answers.rel.value, 'on_topic')
    assert.equal(out.answers.quality.kind, 'score')
    assert.equal(out.answers.quality.value, 2)
    assert.equal(out.answers.approve.kind, 'noul')
    assert.equal(out.answers.approve.value, 0.82)
    assert.equal(out.model, 'jev-1.13-test')
    assert.deepEqual(out.usage, { input_tokens: 120, output_tokens: 15 })
    // The collector got exactly one metadata row.
    assert.equal(t.collector.jevCalls.length, 1)
    assert.deepEqual(t.collector.jevCalls[0], { model: 'jev-1.13-test', usage: { input_tokens: 120, output_tokens: 15 }, latencyMs: t.collector.jevCalls[0].latencyMs })
    // The wire hit the zen endpoint with the resolved default model and the env key.
    assert.equal(seen[0].url, 'https://opencode.ai/zen/v1/systemone')
    const body = JSON.parse(seen[0].init.body)
    assert.equal(body.model, 'jev-1.13-free')
    assert.equal(seen[0].init.headers.authorization, 'Bearer k-test')
    assert.equal(Object.keys(body.questions).length, 3)
    // One ok row in the usage log.
    const rows = t.usageRows()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].outcome, 'ok')
    assert.equal(rows[0].backend, 'zen')
    assert.equal(rows[0].questionCount, 3)
    assert.deepEqual(rows[0].usage, { input_tokens: 120, output_tokens: 15 })
    assert.equal(rows[0].state, undefined, 'state text never reaches the log')
  } finally {
    t.cleanup()
  }
})

test('disabled resolves {error: disabled} without any network call or log write', async () => {
  let called = 0
  const t = makeBinding({
    config: makeConfig({ jevEnabled: false }),
    fetchImpl: okFetch(() => { called += 1 }),
  })
  try {
    const out = await t.classify({ questions: THREE_QUESTIONS, state: 'state' })
    assert.deepEqual(out, {
      error: 'disabled',
      message: 'the jev decision layer is disabled (enable it via the jevEnabled setting)',
    })
    assert.equal(called, 0)
    assert.equal(t.usageRows().length, 0)
    assert.equal(t.collector.jevCalls.length, 0)
  } finally {
    t.cleanup()
  }
})

test('HTTP errors resolve structured failures and log the outcome', async () => {
  const t = makeBinding({
    env: { JEV_ZEN_API_KEY: 'k-test' },
    fetchImpl: async () => new Response('rate limited', { status: 503 }),
  })
  try {
    const out = await t.classify({ questions: THREE_QUESTIONS, state: 'state' })
    assert.equal(out.error, 'http')
    assert.equal(out.status, 503)
    assert.match(out.message, /503/)
    const rows = t.usageRows()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].outcome, 'http_5xx')
    assert.equal(rows[0].latencyMs >= 0, true)
  } finally {
    t.cleanup()
  }
})

test('a missing key resolves no-key without a network call', async () => {
  let called = 0
  const t = makeBinding({ fetchImpl: okFetch(() => { called += 1 }) })
  try {
    const out = await t.classify({ questions: THREE_QUESTIONS, state: 'state' })
    assert.equal(out.error, 'no-key')
    assert.equal(called, 0)
    assert.equal(t.usageRows()[0].outcome, 'missing_key')
  } finally {
    t.cleanup()
  }
})

test('malformed binding arguments resolve invalid-request and never reach the wire', async () => {
  let called = 0
  const t = makeBinding({
    env: { JEV_ZEN_API_KEY: 'k-test' },
    fetchImpl: okFetch(() => { called += 1 }),
  })
  try {
    for (const bad of [undefined, 'nope', { questions: null, state: 's' }, { questions: {}, state: '' }, { questions: {}, state: 's' }]) {
      const out = await t.classify(bad)
      assert.equal(out.error, 'invalid-request', JSON.stringify(bad))
    }
    assert.equal(called, 0)
    assert.equal(t.usageRows().length, 5)
    assert.ok(t.usageRows().every((r) => r.outcome === 'invalid_request'))
  } finally {
    t.cleanup()
  }
})

test('the secret gate blocks the call when the state carries a listed literal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ptc-subagent-secret-'))
  const secretPath = join(dir, 'secrets.txt')
  writeFileSync(secretPath, 'sk-live-abcdefgh12345\n', 'utf8')
  let called = 0
  const t = makeBinding({
    config: makeConfig({ jevSecretFile: secretPath }),
    env: { JEV_ZEN_API_KEY: 'k-test' },
    fetchImpl: okFetch(() => { called += 1 }),
  })
  try {
    const out = await t.classify({ questions: THREE_QUESTIONS, state: 'leaked sk-live-abcdefgh12345 in state' })
    assert.equal(out.error, 'secret-gate')
    assert.equal(called, 0)
    assert.equal(t.usageRows()[0].outcome, 'secret_gate_blocked')
    // A clean state passes the same gate.
    const ok = await t.classify({ questions: THREE_QUESTIONS, state: 'perfectly clean state' })
    assert.equal(ok.error, undefined)
    assert.equal(called, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    t.cleanup()
  }
})

test('bodyContainsSecret ignores short literals and unreadable files', async () => {
  assert.equal(bodyContainsSecret(['short'], 'x short y'), false, 'sub-8-char literals cannot wedge every call')
  assert.equal(bodyContainsSecret(['sk-live-abcdefgh'], 'bearer sk-live-abcdefgh ok'), true)
  assert.deepEqual(await readSecretLiterals('', async () => { throw new Error('never called') }), [])
  assert.deepEqual(
    await readSecretLiterals('/definitely/missing/path', async () => { throw new Error('ENOENT') }),
    [],
    'an unreadable secret file is an empty list, never a throw',
  )
})

test('isConfigured reflects the switch and the backend key chain', async () => {
  const off = makeBinding({ config: makeConfig({ jevEnabled: false }) })
  try {
    assert.equal(await off.isConfigured(), false, 'disabled is unconfigured regardless of keys')
  } finally {
    off.cleanup()
  }
  const withKey = makeBinding({ env: { JEV_ZEN_API_KEY: 'k' } })
  try {
    assert.equal(await withKey.isConfigured(), true)
  } finally {
    withKey.cleanup()
  }
  const withoutKey = makeBinding({ keychainRunner: () => null })
  try {
    assert.equal(await withoutKey.isConfigured(), false)
  } finally {
    withoutKey.cleanup()
  }
  const viaKeychain = makeBinding({ keychainRunner: () => 'chain-secret' })
  try {
    assert.equal(await viaKeychain.isConfigured(), true, 'zen falls back to its default keychain service')
  } finally {
    viaKeychain.cleanup()
  }
})

test('the per-backend key chain: env first, keychain second, strict env isolation', () => {
  // zen: env JEV_ZEN_API_KEY wins.
  assert.equal(resolveKeySources(resolveBackend('zen'), { JEV_ZEN_API_KEY: 'direct' }).apiKey, 'direct')
  // zen: without env, the default keychain service — and the generic env legs
  // are deliberately unreachable (an empty env object is passed through).
  const zenChain = resolveKeySources(resolveBackend('zen'), { TYPESAFE_API_KEY: 'other-backend-key' })
  assert.equal(zenChain.apiKey, undefined)
  assert.equal(zenChain.keychainSpec, 'opencode-zen-inference')
  // native: requires an explicit JEV_KEYCHAIN.
  assert.equal(resolveKeySources(resolveBackend('native'), {}), null)
  assert.equal(resolveKeySources(resolveBackend('native'), { JEV_KEYCHAIN: 'my-service' }).keychainSpec, 'my-service')
  // openrouter: same rule, its own env name.
  assert.equal(resolveKeySources(resolveBackend('openrouter'), { OPENROUTER_API_KEY: 'or' }).apiKey, 'or')
  assert.equal(resolveKeySources(resolveBackend('openrouter'), {}), null)
})

test('the namespace declares the JevError error class contract', () => {
  const t = makeBinding({ env: { JEV_ZEN_API_KEY: 'k' } })
  try {
    assert.equal(t.binding.global, 'jev')
    assert.deepEqual(t.binding.errorClass, { name: 'JevError', memberNameProperty: 'op' })
    assert.deepEqual(Object.keys(t.binding.functions).sort(), ['classify', 'isConfigured'])
  } finally {
    t.cleanup()
  }
})
