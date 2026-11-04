// The /registry-config command: the fake-ctx wizard flow (disable toggle + opt-in
// installs + the ptcEnabled linkage), the NO_PROVIDER / no-ask-surface
// degradation to the manual recipe, the declined-panel no-op, the
// settings-conflict retry, and the host-command registration guard.
// Run: node test/subagents-command.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  registerSubagentsCommand,
  handleSubagentsCommand,
  writeRegistryConfig,
  makePtcEnabledReader,
  loadSubagentsStrings,
  DISABLE_QUESTION_ID,
  OPT_IN_QUESTION_ID,
  SUBAGENTS_SETTINGS_NAMESPACE,
} from '../lib/subagents-command.js'

const EN = loadSubagentsStrings('en')

/** Three-agent roster dir, fresh per scenario. */
function agentsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'subagents-command-'))
  for (const name of ['alpha', 'beta', 'gamma']) {
    writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\ndescription: "the ${name} agent"\n---\nBody.\n`)
  }
  return dir
}

/**
 * Fake ctx: records registrations, effects, ask requests, settings writes.
 * `services` maps names answered by ctx.get(); `describeValue` is the entry
 * config the settings surface reports; `mutate` can be overridden per test.
 */
function fakeCtx({ services = {}, describeValue = {}, mutateImpl, askImpl } = {}) {
  const recorded = {
    commands: [],
    effects: [],
    asks: [],
    mutations: [],
    describeCalls: 0,
    refreshes: 0,
  }
  const settings = {
    describe() {
      recorded.describeCalls++
      return [{ ns: SUBAGENTS_SETTINGS_NAMESPACE, revision: 7, value: { ...describeValue } }]
    },
    async mutate(ns, ops, expectedRevision) {
      recorded.mutations.push({ ns, ops, expectedRevision })
      if (mutateImpl) await mutateImpl(recorded.mutations.length, ns, ops)
    },
  }
  const userQuestions = {
    async ask(request) {
      recorded.asks.push(request)
      if (askImpl) return askImpl(request)
      return { answers: [] }
    },
  }
  const commandsDefault = {
    register(definition) { recorded.commands.push(definition) },
  }
  const ctx = {
    recorded,
    effect(fn, name) {
      recorded.effects.push(name)
      fn()
    },
    get(name) {
      // An explicit null/undefined entry in services means "absent service";
      // otherwise the default doubles stand in.
      if (name in services) return services[name]
      if (name === 'settings') return settings
      if (name === 'userQuestions') return userQuestions
      if (name === 'commands') return commandsDefault
      return undefined
    },
  }
  ctx.refreshRoster = async () => { recorded.refreshes++ }
  return ctx
}

function makeDeps(ctx, dir, extra = {}) {
  return {
    ctx,
    agentsDir: dir,
    language: 'en',
    disabledAgents: [],
    refreshRoster: ctx.refreshRoster,
    isPtcEnabled: extra.isPtcEnabled ?? (() => false),
    ...extra,
  }
}

const INVOCATION = { agent: { id: 'root-1' }, rawInput: '', signal: new AbortController().signal }

// --- registration: effect + definition on a commands-bearing host ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx()
    registerSubagentsCommand(makeDeps(ctx, dir))
    assert.deepEqual(ctx.recorded.effects, ['dsh-subagent-registry:/registry-config'], 'the effect carries the stable label')
    assert.equal(ctx.recorded.commands.length, 1)
    assert.equal(ctx.recorded.commands[0].name, 'registry-config')
    assert.equal(ctx.recorded.commands[0].description, EN.commandDescription)
    assert.match(ctx.recorded.commands[0].name, /^[a-z][a-z0-9-]*$/, 'the command name follows the host naming rule')
    // A host without the commands service: registration is a silent no-op.
    const bare = fakeCtx({ services: { commands: undefined } })
    registerSubagentsCommand(makeDeps(bare, dir))
    assert.equal(bare.recorded.effects.length, 0, 'no effect without the commands service')
    console.log('PASS registration: effect + definition; guarded on missing commands service')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- collision guard: a host refusing the name warns and keeps mounting ---

{
  const dir = agentsDir()
  try {
    // The exact duplicate-name error the host's NamedEntries insert throws
    // (global scope wording) — e.g. when a host/tui twin already registered
    // the same command name.
    const hostDuplicate = new Error(
      'command "registry-config" is already registered (for a per-agent variant, mount a command-injected plugin under that agent\'s `agent.ctx`)',
    )
    const ctx = fakeCtx({ services: { commands: { register() { throw hostDuplicate } } } })
    const warnings = []
    const originalWarn = console.warn
    console.warn = (...parts) => { warnings.push(parts.map(String).join(' ')) }
    let returned
    try {
      returned = registerSubagentsCommand(makeDeps(ctx, dir))
    } finally {
      console.warn = originalWarn
    }
    assert.doesNotThrow(() => { void returned }, 'the duplicate-name throw must not escape registration')
    assert.deepEqual(ctx.recorded.effects, ['dsh-subagent-registry:/registry-config'], 'the effect still carries the label')
    assert.equal(warnings.length, 1, 'exactly one console.warn for the refusal')
    assert.match(warnings[0], /'\/registry-config' command not registered/)
    assert.match(warnings[0], /already registered/, 'the host refusal detail rides the warning')
    // A non-duplicate registration failure degrades the same way (warn + skip,
    // never a startup crash).
    const boom = fakeCtx({ services: { commands: { register() { throw new TypeError('boom') } } } })
    const boomWarnings = []
    const originalWarn2 = console.warn
    console.warn = (...parts) => { boomWarnings.push(parts.map(String).join(' ')) }
    try {
      registerSubagentsCommand(makeDeps(boom, dir))
    } finally {
      console.warn = originalWarn2
    }
    assert.equal(boomWarnings.length, 1)
    assert.match(boomWarnings[0], /boom/)
    console.log('PASS collision guard: host duplicate-name throw degrades to warn, startup unaffected')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- wizard flow: disable beta + install minimal-subagent ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({
      askImpl: () => ({
        answers: [
          { id: DISABLE_QUESTION_ID, selected: ['beta'] },
          { id: OPT_IN_QUESTION_ID, selected: ['minimal-subagent'] },
        ],
      }),
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir), INVOCATION)
    assert.equal(result.kind, 'success')
    // The ask carried both questions, the live agent, and the signal.
    assert.equal(ctx.recorded.asks.length, 1)
    const ask = ctx.recorded.asks[0]
    assert.equal(ask.agent, INVOCATION.agent, 'the ask scopes to the invocation agent')
    assert.equal(ask.signal, INVOCATION.signal, 'the invocation signal passes through')
    assert.ok(ask.questions.some((q) => q.id === DISABLE_QUESTION_ID))
    const optIn = ask.questions.find((q) => q.id === OPT_IN_QUESTION_ID)
    assert.equal(optIn.multiSelect, true)
    assert.deepEqual(optIn.options.map((o) => o.label), ['ptc-subagent', 'minimal-subagent'])
    // The disable question listed every roster agent with state marks.
    const disable = ask.questions.find((q) => q.id === DISABLE_QUESTION_ID)
    assert.deepEqual(disable.options.map((o) => o.label), ['alpha', 'beta', 'gamma'])
    assert.equal(disable.options[0].description, EN.markEnabled)
    // One settings write carrying the new list.
    assert.equal(ctx.recorded.mutations.length, 1)
    assert.equal(ctx.recorded.mutations[0].ns, SUBAGENTS_SETTINGS_NAMESPACE)
    assert.equal(ctx.recorded.mutations[0].expectedRevision, 7, 'the describe revision rode the write')
    const setOps = ctx.recorded.mutations[0].ops.filter((op) => op.op === 'set')
    assert.ok(setOps.some((op) => op.path[0] === 'disabledAgents' && op.value.join(',') === 'beta'), 'disabledAgents := [beta]')
    // The template installed; the roster refreshed.
    assert.ok(existsSync(join(dir, 'minimal-subagent.md')), 'minimal-subagent.md installed')
    assert.equal(ctx.recorded.refreshes, 1, 'refreshRoster ran after the write')
    assert.match(result.text, /Disabled: beta/)
    assert.match(result.text, /Installed: minimal-subagent/)
    assert.ok(!result.text.includes('ptcEnabled'), 'no ptc line when ptc was not part of the change')
    console.log('PASS wizard flow: toggle + install + mutate + refresh')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- ptc linkage ON: selecting ptc-subagent flips ptcEnabled and installs ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({
      askImpl: () => ({ answers: [{ id: OPT_IN_QUESTION_ID, selected: ['ptc-subagent'] }] }),
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir, { isPtcEnabled: () => false }), INVOCATION)
    assert.equal(result.kind, 'success')
    const setOps = ctx.recorded.mutations[0].ops.filter((op) => op.op === 'set')
    const ptcOp = setOps.find((op) => op.path[0] === 'ptcEnabled')
    assert.ok(ptcOp && ptcOp.value === true, 'ptcEnabled := true on selection')
    assert.ok(existsSync(join(dir, 'ptc-subagent.md')), 'the ptc template installed')
    const disabledOp = setOps.find((op) => op.path[0] === 'disabledAgents')
    assert.equal(disabledOp, undefined, 'no disabledAgents write when the roster toggle is untouched')
    assert.match(result.text, /ptcEnabled → true/)
    console.log('PASS ptc linkage: select → enable + install')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- ptc linkage OFF: unselecting parks the file in disabledAgents, keeps it ---

{
  const dir = agentsDir()
  writeFileSync(join(dir, 'ptc-subagent.md'), '---\nname: ptc-subagent\n---\nPreviously installed.')
  try {
    const ctx = fakeCtx({
      askImpl: () => ({ answers: [{ id: OPT_IN_QUESTION_ID, selected: [] }] }),
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir, { isPtcEnabled: () => true }), INVOCATION)
    assert.equal(result.kind, 'success')
    const setOps = ctx.recorded.mutations[0].ops.filter((op) => op.op === 'set')
    assert.ok(setOps.some((op) => op.path[0] === 'ptcEnabled' && op.value === false), 'ptcEnabled := false on unselect')
    const disabledOp = setOps.find((op) => op.path[0] === 'disabledAgents')
    assert.ok(disabledOp && disabledOp.value.includes('ptc-subagent'), 'ptc-subagent parked in disabledAgents')
    assert.ok(
      readFileSync(join(dir, 'ptc-subagent.md'), 'utf8').includes('Previously installed.'),
      'the installed md is kept, never deleted',
    )
    assert.match(result.text, /ptcEnabled → false/)
    console.log('PASS ptc linkage: unselect → disable + park, file kept')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- NO_PROVIDER (headless): degrade to the manual recipe ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({
      askImpl: () => {
        throw Object.assign(new Error('no user-questions answerer accepted the request'), { code: 'NO_PROVIDER' })
      },
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir), INVOCATION)
    assert.equal(result.kind, 'error', 'the degradation is a CommandResult error')
    assert.match(result.text, /no user-questions answerer/, 'the ask failure detail is included')
    assert.match(result.text, /disabledAgents/, 'the manual recipe names the toggle key')
    assert.match(result.text, /ptcEnabled/, 'the manual recipe names the codemode switch')
    assert.match(result.text, /templates\/opt-in-agents/, 'the manual recipe names the template path')
    assert.equal(ctx.recorded.mutations.length, 0, 'a failed ask writes nothing')
    assert.equal(ctx.recorded.refreshes, 0, 'a failed ask refreshes nothing')
    console.log('PASS NO_PROVIDER: error + manual config recipe')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- no ask surface at all: same manual recipe, no throw ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({ services: { userQuestions: undefined } })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir), INVOCATION)
    assert.equal(result.kind, 'error')
    assert.match(result.text, /No ask surface is available/)
    assert.match(result.text, /disabledAgents/)
    console.log('PASS missing userQuestions service: error + recipe')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- declined panel: success no-op, nothing written ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({ askImpl: () => ({ answers: [] }) })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir, { isPtcEnabled: () => true }), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(result.text, EN.noChanges)
    assert.equal(ctx.recorded.mutations.length, 0)
    assert.equal(ctx.recorded.refreshes, 0)
    // Answering ONLY the disable question leaves ptcEnabled alone.
    const partial = fakeCtx({ askImpl: () => ({ answers: [{ id: DISABLE_QUESTION_ID, selected: [] }] }) })
    const partialResult = await handleSubagentsCommand(makeDeps(partial, dir, { isPtcEnabled: () => true }), INVOCATION)
    assert.equal(partialResult.kind, 'success')
    assert.equal(partialResult.text, EN.noChanges, 'empty disable set + empty opt-in set = unchanged')
    assert.equal(partial.recorded.mutations.length, 0, 'no ptc flip when the opt-in question was not answered')
    console.log('PASS declined / partially answered panel: no-op, no ptc flip')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- re-enable via unchecked box: the toggle set replaces the old one ---

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx({
      askImpl: () => ({ answers: [{ id: DISABLE_QUESTION_ID, selected: ['gamma'] }] }),
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir, {
      disabledAgents: ['beta', 'gamma'],
    }), INVOCATION)
    assert.equal(result.kind, 'success')
    const disabledOp = ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'disabledAgents')
    assert.deepEqual(disabledOp.value, ['gamma'], 'checked set becomes the new list (beta re-enabled, gamma kept)')
    assert.match(result.text, /Enabled: beta/)
    assert.ok(!result.text.includes('Disabled:'), 'gamma stays disabled — no newly-disabled line repeats it')
    console.log('PASS toggle replacement: re-enable + disable in one write')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- settings conflict: one retry against a fresh revision, then success ---

{
  const dir = agentsDir()
  try {
    let attempts = 0
    const ctx = fakeCtx({
      askImpl: () => ({ answers: [{ id: DISABLE_QUESTION_ID, selected: ['beta'] }] }),
      mutateImpl: (n) => {
        attempts++
        if (n === 1) throw Object.assign(new Error('SETTINGS_CONFLICT'), { code: 'SETTINGS_CONFLICT' })
      },
    })
    const result = await handleSubagentsCommand(makeDeps(ctx, dir), INVOCATION)
    assert.equal(result.kind, 'success', 'the retry landed')
    assert.equal(attempts, 2, 'exactly one conflict retry')
    assert.equal(ctx.recorded.describeCalls, 2, 'each attempt re-read a fresh revision')
    // A persistent conflict (or any other failure) surfaces the persist error + recipe.
    const failing = fakeCtx({
      askImpl: () => ({ answers: [{ id: DISABLE_QUESTION_ID, selected: ['beta'] }] }),
      mutateImpl: () => {
        throw new Error('disk gone')
      },
    })
    const failed = await handleSubagentsCommand(makeDeps(failing, dir), INVOCATION)
    assert.equal(failed.kind, 'error')
    assert.match(failed.text, /disk gone/)
    assert.match(failed.text, /disabledAgents/)
    console.log('PASS settings write: conflict retry once; failure surfaces recipe')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- writeRegistryConfig: missing settings service ---

{
  const bareCtx = { get: () => undefined }
  const message = await writeRegistryConfig(bareCtx, [{ op: 'set', path: ['x'], value: 1 }])
  assert.equal(message, 'Settings service is not available.', 'missing service reports instead of throwing')
  console.log('PASS writeRegistryConfig: missing settings service reported')
}

// --- makePtcEnabledReader: settings surface first, apply value fallback ---

{
  const liveCtx = {
    get: () => ({ describe: () => [{ ns: SUBAGENTS_SETTINGS_NAMESPACE, value: { ptcEnabled: true } }] }),
  }
  assert.equal(makePtcEnabledReader(liveCtx, false)(), true, 'live settings value wins')
  const absentCtx = { get: () => undefined }
  assert.equal(makePtcEnabledReader(absentCtx, true)(), true, 'apply-time fallback without the service')
  const brokenCtx = { get: () => { throw new Error('no') } }
  assert.equal(makePtcEnabledReader(brokenCtx, false)(), false, 'a throwing describe degrades to the fallback')
  console.log('PASS makePtcEnabledReader: live value, fallback, defensive')
}

console.log('\nAll subagents-command assertions passed.')
