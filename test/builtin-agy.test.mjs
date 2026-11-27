// Built-in agy member: injected resolver/parser, shadowing, config gates and
// language fallback. No host, no real PATH lookup, no ~/.dsh access.
// Run: node test/builtin-agy.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import {
  BUILTIN_AGY_COMMAND,
  BUILTIN_AGY_ID,
  builtinAgyEdition,
  builtinAgyRosterLine,
  resolveBuiltinAgy,
} from '../lib/builtin-agy.js'

const EXE = '/usr/local/bin/agy'

/** Injected seams: change one field per case, keep the rest at their happy path. */
function input(overrides = {}) {
  return {
    language: 'en',
    enabled: true,
    disabledAgents: [],
    resolveExecutable: (name) => (name === BUILTIN_AGY_ID ? EXE : undefined),
    parseUserAgent: () => undefined,
    ...overrides,
  }
}

// --- injected resolver: found / not found -----------------------------------

{
  assert.equal(BUILTIN_AGY_ID, 'agy')
  assert.deepEqual([...BUILTIN_AGY_COMMAND], ['agy', 'acp'], 'the spawn command is fixed')

  let resolvedName
  const found = resolveBuiltinAgy(input({
    resolveExecutable: (name) => { resolvedName = name; return EXE },
  }))
  assert.equal(resolvedName, 'agy', 'the injected resolver is actually used')
  assert.equal(found.name, 'agy')
  assert.deepEqual([...found.command], ['agy', 'acp'])
  assert.equal(found.body.length > 0, true, 'persona body ships with the definition')

  const missing = resolveBuiltinAgy(input({ resolveExecutable: () => undefined }))
  assert.equal(missing, undefined, 'not found → not in the roster')
  console.log('PASS injected resolver: found → in roster, not found → hidden')
}

// --- user-file shadowing (valid and broken) ---------------------------------

{
  let parsedName
  const shadowValid = resolveBuiltinAgy(input({
    parseUserAgent: (name) => { parsedName = name; return { ok: true } },
  }))
  assert.equal(parsedName, 'agy', 'the injected parser is actually used')
  assert.equal(shadowValid, undefined, 'a valid user agy.md shadows the built-in')

  const shadowBroken = resolveBuiltinAgy(input({ parseUserAgent: () => ({ ok: false }) }))
  assert.equal(shadowBroken, undefined, 'a broken user agy.md also shadows the built-in')
  console.log('PASS shadowing: valid and broken user files both win')
}

// --- config gates ------------------------------------------------------------

{
  assert.equal(resolveBuiltinAgy(input({ enabled: false })), undefined, 'agyEnabled:false hides it')
  assert.equal(
    resolveBuiltinAgy(input({ disabledAgents: ['agy'] })),
    undefined,
    'disabledAgents hides it',
  )
  assert.equal(
    resolveBuiltinAgy(input({ disabledAgents: ['other'] }))?.name,
    'agy',
    'an unrelated disabled name does not hide it',
  )
  console.log('PASS config gates: agyEnabled and disabledAgents')
}

// --- language editions and fallback -----------------------------------------

{
  const zh = resolveBuiltinAgy(input({ language: 'zh' }))
  assert.equal(zh.displayName, 'Gemini 套餐 · 实验性')
  assert.ok(zh.description.includes('实验性'), 'zh description marks it experimental')
  assert.match(zh.body, /外部专员/, 'zh persona')

  for (const language of ['en', 'ru', 'es']) {
    const edition = resolveBuiltinAgy(input({ language }))
    assert.equal(edition.displayName, 'Gemini plan · Experimental', `${language} falls back to en`)
    assert.ok(edition.description.includes('Experimental'), `${language} description marks it experimental`)
    assert.equal(edition, builtinAgyEdition(language))
  }
  assert.equal(builtinAgyEdition('zh'), zh)
  console.log('PASS language: zh / en editions, ru / es fall back to en')
}

// --- roster line -------------------------------------------------------------

{
  const line = builtinAgyRosterLine(resolveBuiltinAgy(input({ language: 'zh' })))
  assert.ok(line.startsWith('- agy (Gemini 套餐 · 实验性): '), 'roster label shape')
  assert.ok(line.includes('Google Antigravity CLI'), 'description follows the label')
  console.log('PASS roster line: - agy (Gemini 套餐 · 实验性): …')
}
