// ACP error codes, the classification rule table and the two text exits.
// Run: node test/acp-errors.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import {
  ACP_CODES,
  ACP_CLASSIFICATION_RULES,
  ACP_DIAGNOSTIC_MAX_BYTES,
  AcpError,
  acpDiagnostic,
  acpErrorText,
  acpOutcomeFact,
  classifyAcpError,
  truncateUtf8,
} from '../lib/acp/errors.js'

// --- stable codes -----------------------------------------------------------

{
  assert.equal(ACP_CODES.NOT_INSTALLED, 'ACP_NOT_INSTALLED')
  assert.equal(ACP_CODES.AUTH_REQUIRED, 'ACP_AUTH_REQUIRED')
  assert.equal(ACP_CODES.QUOTA_EXHAUSTED, 'ACP_QUOTA_EXHAUSTED')
  assert.equal(ACP_CODES.EARLY_EXIT, 'ACP_EARLY_EXIT')
  assert.equal(ACP_CODES.FOREGROUND_ONLY, 'ACP_FOREGROUND_ONLY')
  const values = Object.values(ACP_CODES)
  assert.equal(new Set(values).size, values.length, 'every stable code is unique')
  console.log(`PASS stable codes: ${values.length} unique ACP_* values`)
}

// --- classification rule table, row by row ---------------------------------

{
  const samples = {
    ACP_NOT_INSTALLED: { errno: 'ENOENT' },
    ACP_SPAWN_FAILED: { errno: 'EACCES' },
    ACP_AUTH_REQUIRED: { rpcCode: -32000 },
    ACP_QUOTA_EXHAUSTED: { text: 'rate limit exceeded' },
    ACP_ABORTED: { aborted: true },
    ACP_EARLY_EXIT: { earlyExit: true },
    ACP_PROTOCOL: { protocol: true },
    ACP_AGENT_ERROR: { stopReason: 'max_turn_requests' },
  }
  for (const rule of ACP_CLASSIFICATION_RULES) {
    assert.ok(Object.values(ACP_CODES).includes(rule.code), `${rule.code}: code is stable`)
    const sample = samples[rule.code]
    assert.ok(sample, `${rule.code}: has a sample signal`)
    assert.equal(rule.match(sample), true, `${rule.code}: its own row matches`)
    const error = classifyAcpError(sample)
    assert.equal(error.code, rule.code, `${rule.code}: classifier picks the row`)
    assert.ok(error instanceof AcpError, `${rule.code}: returns an AcpError`)
  }
  assert.equal(ACP_CLASSIFICATION_RULES.length, 8, 'every documented rule is in the table')
  console.log(`PASS classification table: ${ACP_CLASSIFICATION_RULES.length} rows, each classified`)

  // Text-hit variants and the general fallback.
  assert.equal(classifyAcpError({ text: 'not logged in' }).code, ACP_CODES.AUTH_REQUIRED)
  assert.equal(classifyAcpError({ text: 'quota exhausted' }).code, ACP_CODES.QUOTA_EXHAUSTED)
  assert.equal(classifyAcpError({ text: 'HTTP 429' }).code, ACP_CODES.QUOTA_EXHAUSTED)
  assert.equal(classifyAcpError({ stopReason: 'some_future_reason' }).code, ACP_CODES.AGENT_ERROR)
  assert.equal(classifyAcpError({}).code, ACP_CODES.AGENT_ERROR, 'unrecognised shape falls back')
  assert.equal(
    classifyAcpError({ code: ACP_CODES.BAD_CWD, errno: 'ENOENT' }).code,
    ACP_CODES.BAD_CWD,
    'an explicit code wins over signals',
  )
  console.log('PASS classification: text hints, fallback and explicit-code override')
}

// --- RPC message echo is bounded, flattened and never carries `data` --------

{
  const error = classifyAcpError(
    { stopReason: 'error', rpcCode: -32000, rpcMessage: `line1\nline2\t${'中'.repeat(5000)}`, data: { token: 'SECRET' } },
    'prompt',
  )
  assert.equal(error.code, ACP_CODES.AGENT_ERROR)
  assert.equal(error.stage, 'prompt')
  assert.match(error.fact, /jsonrpc code -32000/)
  assert.match(error.fact, /message: line1 line2/)
  assert.ok(!error.fact.includes('SECRET'), 'the `data` field never reaches the fact')
  const echoed = error.fact.split('message: ')[1]
  assert.ok(Buffer.byteLength(echoed, 'utf8') <= 200, 'message stays inside its 200-byte cap')
  console.log('PASS rpc fact: bounded message, no data, stage carried')
}

// --- UTF-8 budget and two text exits ----------------------------------------

{
  const budget = truncateUtf8('中'.repeat(5000) + '👍'.repeat(5000), 4096)
  assert.ok(Buffer.byteLength(budget, 'utf8') <= 4096, 'budget respected')
  assert.equal(Buffer.from(budget, 'utf8').toString('utf8'), budget, 'no broken multi-byte sequence')
  assert.ok(!budget.includes('\uFFFD'), 'no replacement character')
  assert.equal(truncateUtf8('中'.repeat(5000), 4096).length, Math.floor(4096 / 3), 'cuts at a code-point edge')
  console.log('PASS truncateUtf8: 4096-byte budget, multi-byte intact')

  const long = new AcpError(ACP_CODES.AGENT_ERROR, 'prompt', `message: ${'中'.repeat(5000)}`)
  const diagnostic = acpDiagnostic(long)
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= ACP_DIAGNOSTIC_MAX_BYTES)
  assert.ok(diagnostic.startsWith(`[${ACP_CODES.AGENT_ERROR}] `), 'stable code leads the line')
  assert.match(diagnostic, / · stage: prompt · /)
  assert.match(diagnostic, / · 下一步: /)
  assert.ok(!diagnostic.includes('\uFFFD'))
  console.log('PASS diagnostic: <=4096 bytes, code first, stage and next step present')

  const installed = new AcpError(ACP_CODES.NOT_INSTALLED, 'initialize', 'errno ENOENT')
  const full = acpErrorText(installed)
  assert.ok(full.includes(`[${ACP_CODES.NOT_INSTALLED}]`), 'code in the pre-release text')
  assert.ok(full.includes('(agent "agy", external ACP "agy acp")'), 'agent suffix')
  assert.ok(full.includes('errno ENOENT'), 'safe fact')
  assert.ok(full.includes('stage: initialize'), 'stage')
  assert.ok(full.includes('agy --version'), 'actionable next step')

  const compact = acpDiagnostic(installed)
  assert.ok(!compact.includes('(agent "agy"'), 'diagnostic stays compact')
  assert.ok(compact.includes('errno ENOENT'))
  console.log('PASS two exits: full pre-release text and compact post-release diagnostic')

  const aborted = classifyAcpError({ aborted: true }, 'initialize')
  assert.equal(aborted.code, ACP_CODES.ABORTED)
  assert.ok(!aborted.fact, 'cancellation carries no diagnostic fact')
  assert.equal(acpOutcomeFact({ exitCode: 1, signal: null }), 'exit code 1')
  assert.equal(acpOutcomeFact({ exitCode: null, signal: 'SIGTERM' }), 'signal SIGTERM')
  console.log('PASS cancellation and process-outcome facts')
}
