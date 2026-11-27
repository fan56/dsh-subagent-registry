// /registry-config + agy: Q2 stays byte-identical with or without agy wiring;
// the standalone agy question (Q3) owns agyEnabled; MF-A lock — answering Q3
// alone must never flip ptcEnabled or park ptc-subagent in disabledAgents.
// Run: node test/registry-command-agy.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AGY_QUESTION_ID,
  DISABLE_QUESTION_ID,
  OPT_IN_QUESTION_ID,
  SUBAGENTS_SETTINGS_NAMESPACE,
  agyQuestionLabels,
  buildAgyQuestion,
  buildDisableQuestion,
  buildOptInQuestion,
  handleSubagentsCommand,
  loadSubagentsStrings,
  writeRegistryConfig,
} from '../lib/subagents-command.js'

const EN = loadSubagentsStrings('en')
const AGY_LABELS = agyQuestionLabels(EN)
const INVOCATION = { agent: { id: 'root-1' }, rawInput: '', signal: new AbortController().signal }
const DEFINITION = { name: 'agy', displayName: 'Gemini plan · Experimental' }

function agentsDir(withPtc = false) {
  const dir = mkdtempSync(join(tmpdir(), 'registry-command-agy-'))
  for (const name of ['alpha', 'beta', 'gamma']) {
    writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\ndescription: "the ${name} agent"\n---\nBody.\n`)
  }
  if (withPtc) writeFileSync(join(dir, 'ptc-subagent.md'), '---\nname: ptc-subagent\n---\nBody.\n')
  return dir
}

function fakeCtx(answers) {
  const recorded = { asks: [], mutations: [], refreshes: 0, edits: [] }
  const ctx = {
    recorded,
    get(name) {
      if (name === 'userQuestions') return {
        async ask(request) {
          recorded.asks.push(request)
          return { answers }
        },
      }
      if (name === 'settings') return {
        describe: () => [{ ns: SUBAGENTS_SETTINGS_NAMESPACE, revision: 7, value: {} }],
        async mutate(ns, ops, revision) { recorded.mutations.push({ ns, ops, revision }) },
      }
      return undefined
    },
  }
  return ctx
}

function withConfigEditor(ctx, current = { ptcEnabled: true, agyEnabled: false }) {
  const original = ctx.get.bind(ctx)
  const editor = {
    entries: () => [{ options: { id: SUBAGENTS_SETTINGS_NAMESPACE } }],
    async edit(_entry, change) { ctx.recorded.edits.push(change({ ...current }, {})) },
  }
  ctx.get = (name) => name === 'configEditor' ? editor : original(name)
  return ctx
}

function deps(ctx, dir, agy, extra = {}) {
  return {
    ctx,
    agentsDir: dir,
    language: 'en',
    disabledAgents: [],
    refreshRoster: async () => { ctx.recorded.refreshes++ },
    isPtcEnabled: () => false,
    ...(agy === undefined ? {} : { agy: () => agy }),
    ...extra,
  }
}

const OFF = { enabled: false, resolved: true, reason: undefined }
const ON = { enabled: true, resolved: true, reason: undefined, definition: DEFINITION, definitionIgnoringToggle: DEFINITION }
const GOLDEN_Q2 = [
  { label: 'ptc-subagent', description: `${EN.ptcBlurb} [${EN.stateMissing} · ${EN.ptcOffNow}]` },
  { label: 'minimal-subagent', description: `${EN.minimalBlurb} [${EN.stateMissing}]` },
]

// --- Q2: byte-identical with / without agy wiring ---------------------------

{
  const dir = agentsDir()
  try {
    const built = buildOptInQuestion(EN, dir, false)
    assert.deepEqual(built.options, GOLDEN_Q2, 'direct builder has exactly two ptc/minimal rows')
    assert.equal(built.multiSelect, true)
    for (const [label, agy] of [['no wiring', undefined], ['off', OFF], ['on', ON], ['unresolved', { enabled: false, resolved: false, reason: 'ENOENT' }]]) {
      const ctx = fakeCtx([])
      await handleSubagentsCommand(deps(ctx, dir, agy), INVOCATION)
      const q2 = ctx.recorded.asks[0].questions.find((q) => q.id === OPT_IN_QUESTION_ID)
      assert.deepEqual(q2, built, `${label}: Q2 identical in full`)
      assert.deepEqual(q2.options, GOLDEN_Q2, `${label}: Q2 options identical`)
    }
    console.log('PASS Q2: two rows, byte-identical with and without agy wiring')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q3: only with wiring; single-select two locale-labeled options ----------

{
  const dir = agentsDir()
  try {
    const noCtx = fakeCtx([])
    await handleSubagentsCommand(deps(noCtx, dir), INVOCATION)
    assert.equal(noCtx.recorded.asks[0].questions.find((q) => q.id === AGY_QUESTION_ID), undefined, 'no agy question without wiring')

    for (const [state, marks, absent] of [
      [OFF, [EN.agyOffNow, EN.agyFound], [EN.agyOnNow]],
      [{ enabled: false, resolved: false, reason: 'ENOENT' }, [EN.agyOffNow, 'ENOENT'], [EN.agyFound]],
      [{ enabled: true, resolved: false, reason: 'ENOENT' }, [EN.agyOnNow, 'ENOENT'], [EN.agyFound]],
    ]) {
      const ctx = fakeCtx([])
      await handleSubagentsCommand(deps(ctx, dir, state), INVOCATION)
      const q3 = ctx.recorded.asks[0].questions.find((q) => q.id === AGY_QUESTION_ID)
      assert.ok(q3, 'Q3 present when wired')
      assert.equal(q3.multiSelect, false, 'Q3 is single-select')
      assert.deepEqual(q3.options.map((o) => o.label), [EN.qAgyEnableLabel, EN.qAgyDisableLabel], 'Q3 uses the two locale labels')
      assert.deepEqual(agyQuestionLabels(EN), AGY_LABELS, 'builder and handler share the same label source')
      assert.match(q3.options[0].description, /Gemini plan/i, 'enable description: plan billing')
      assert.match(q3.options[0].description, /foreground/i, 'enable description: foreground only')
      assert.match(q3.options[0].description, /agyMaxConcurrent/, 'enable description: concurrency key')
      assert.match(q3.options[1].description, /use_agent/, 'disable description: removed from the roster')
      for (const mark of marks) assert.ok(q3.detail.includes(mark), `detail has ${mark}`)
      for (const mark of absent) assert.ok(!q3.detail.includes(mark), `detail omits ${mark}`)
      assert.match(q3.detail, /foreground/i, 'detail: foreground one-shot')
      assert.match(q3.detail, /agyMaxConcurrent/, 'detail: concurrency key')
      assert.match(q3.detail, /Permission/i, 'detail: local agy settings decide permissions')
      assert.doesNotMatch(q3.question, /uncheck/i, 'question no longer suggests unchecking')
      assert.deepEqual(q3, buildAgyQuestion(EN, state), 'Q3 matches the builder')
    }

    const ZH = loadSubagentsStrings('zh')
    const zhQ3 = buildAgyQuestion(ZH, OFF)
    assert.deepEqual(zhQ3.options.map((o) => o.label), [ZH.qAgyEnableLabel, ZH.qAgyDisableLabel], 'zh labels come from the zh locale')
    assert.match(zhQ3.options[0].description, /Gemini 套餐额度/, 'zh enable description: plan billing')
    assert.match(zhQ3.options[1].description, /use_agent/, 'zh disable description: roster removal')
    assert.match(zhQ3.detail, /前台/, 'zh detail: foreground one-shot')
    console.log('PASS Q3: only with wiring, single-select two locale labels, state + resolution in detail')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q3 "enable" from off: write true, and the enabling summary warns ------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] }])
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF), INVOCATION)
    assert.equal(result.kind, 'success')
    const ops = ctx.recorded.mutations[0].ops
    assert.ok(ops.some((op) => op.path[0] === 'agyEnabled' && op.value === true), 'picking enable writes true')
    assert.match(result.text, /agyEnabled → true/)
    assert.match(result.text, /Experimental/, 'enabling run shows the status line')
    assert.match(result.text, /hooks/i)
    assert.match(result.text, /permission/i)
    assert.match(result.text, /~9s/)
    console.log('PASS Q3 enable: agyEnabled=true + warning on the enabling run')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q3 "disable" from on: write false even when agy is already on ---------

{
  const dir = agentsDir()
  try {
    const ctx = withConfigEditor(fakeCtx([{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.disable] }]))
    const result = await handleSubagentsCommand(deps(ctx, dir, ON), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(ctx.recorded.edits.length, 1, 'non-volatile write goes through the config editor')
    assert.equal(ctx.recorded.edits[0].agyEnabled, false, 'picking disable writes false while agy is on')
    assert.match(result.text, /agyEnabled → false/)
    assert.doesNotMatch(result.text, /ptcEnabled/)
    assert.equal('disabledAgents' in ctx.recorded.edits[0], false)
    console.log('PASS Q3 disable: agyEnabled=false from the on state, no cross-talk')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q3 blank / custom-only: no write (T20 "empty = not answered") ---------

{
  const dir = agentsDir()
  try {
    for (const [label, answer] of [
      ['empty selected', { id: AGY_QUESTION_ID, selected: [] }],
      ['custom text only', { id: AGY_QUESTION_ID, selected: [], custom: 'just a note' }],
    ]) {
      const ctx = fakeCtx([answer])
      const result = await handleSubagentsCommand(deps(ctx, dir, ON), INVOCATION)
      assert.equal(result.kind, 'success')
      assert.equal(result.text, EN.noChanges, `${label} is not an answer`)
      assert.equal(ctx.recorded.mutations.length, 0, `${label}: no agyEnabled write`)
      assert.equal(ctx.recorded.refreshes, 0, `${label}: no roster refresh`)
    }
    console.log('PASS Q3 blank/custom-only: empty selection never flips agy')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q3 skipped / unchanged: no write --------------------------------------

{
  const dir = agentsDir()
  try {
    for (const [label, answers, state] of [
      ['skipped while off', [{ id: DISABLE_QUESTION_ID, selected: ['beta'] }], OFF],
      ['skipped while on', [{ id: DISABLE_QUESTION_ID, selected: ['beta'] }], ON],
      ['enable while already on', [{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] }], ON],
      ['disable while already off', [{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.disable] }], OFF],
      ['blank while already off', [{ id: AGY_QUESTION_ID, selected: [] }], OFF],
    ]) {
      const ctx = fakeCtx(answers)
      await handleSubagentsCommand(deps(ctx, dir, state), INVOCATION)
      const ops = ctx.recorded.mutations[0]?.ops ?? []
      assert.equal(ops.find((op) => op.path[0] === 'agyEnabled'), undefined, `${label}: no agyEnabled write`)
    }
    console.log('PASS Q3 skip/no-change: no agyEnabled write in any state')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- both questions answered: independent writes, no cross-talk -------------

{
  const dir = agentsDir(true)
  try {
    const ctx = fakeCtx([
      { id: OPT_IN_QUESTION_ID, selected: ['ptc-subagent'] },
      { id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] },
    ])
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF, { isPtcEnabled: () => false }), INVOCATION)
    const ops = ctx.recorded.mutations[0].ops
    assert.ok(ops.some((op) => op.path[0] === 'ptcEnabled' && op.value === true), 'Q2 still writes ptcEnabled=true')
    assert.ok(ops.some((op) => op.path[0] === 'agyEnabled' && op.value === true), 'Q3 writes agyEnabled=true')
    assert.ok(!ops.some((op) => op.path[0] === 'disabledAgents' && op.value.includes('ptc-subagent')), 'ptc not parked')
    assert.match(result.text, /ptcEnabled → true/)
    assert.match(result.text, /agyEnabled → true/)
    console.log('PASS both answered: Q2 ptc and Q3 agy write independently')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- MF-A regression lock: Q2 unanswered, Q3 only agy ----------------------

{
  const dir = agentsDir(true) // ptc-subagent.md present — the original bug parked it
  try {
    const ctx = withConfigEditor(fakeCtx([{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] }]))
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF, { isPtcEnabled: () => true }), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(ctx.recorded.edits.length, 1, 'the write uses the non-volatile config editor')
    assert.equal(ctx.recorded.edits[0].agyEnabled, true)
    assert.equal(ctx.recorded.edits[0].ptcEnabled, true, 'MF-A: ptcEnabled value untouched (still true)')
    assert.equal('disabledAgents' in ctx.recorded.edits[0], false, 'MF-A: no disabledAgents write')
    assert.equal(ctx.recorded.mutations.length, 0, 'MF-A: no volatile ptc write either')
    assert.doesNotMatch(result.text, /ptcEnabled/)
    assert.doesNotMatch(result.text, /Disabled:/)
    console.log('PASS MF-A lock: Q2 skipped + Q3=enable never touches ptcEnabled / disabledAgents')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- declined envelope: blank + custom on every question changes nothing ----

{
  const dir = agentsDir()
  try {
    const declined = (id) => ({ id, selected: [], custom: 'User declined to answer questions.' })
    const ctx = withConfigEditor(fakeCtx([
      declined(DISABLE_QUESTION_ID),
      declined(OPT_IN_QUESTION_ID),
      declined(AGY_QUESTION_ID),
    ]))
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(result.text, EN.noChanges, 'the declined wizard is a no-op')
    assert.equal(ctx.recorded.mutations.length, 0, 'no volatile settings write')
    assert.equal(ctx.recorded.edits.length, 0, 'no config editor write')
    assert.equal(ctx.recorded.refreshes, 0, 'no roster refresh')
    assert.equal(existsSync(join(dir, 'ptc-subagent.md')), false, 'no template installed')
    console.log('PASS declined envelope: blank+custom on all questions changes nothing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- custom text only on Q1/Q2 + Q3 agy: only agyEnabled is written ---------

{
  const dir = agentsDir(true) // ptc-subagent.md present — must not be parked
  try {
    const note = (id) => ({ id, selected: [], custom: 'just a note' })
    const ctx = withConfigEditor(fakeCtx([
      note(DISABLE_QUESTION_ID),
      note(OPT_IN_QUESTION_ID),
      { id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] },
    ]), { ptcEnabled: true, agyEnabled: false, disabledAgents: ['beta'] })
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF, {
      isPtcEnabled: () => true,
      disabledAgents: ['beta'],
    }), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(ctx.recorded.edits.length, 1, 'one config editor write')
    assert.equal(ctx.recorded.edits[0].agyEnabled, true, 'only agyEnabled flips')
    assert.equal(ctx.recorded.edits[0].ptcEnabled, true, 'ptcEnabled untouched')
    assert.deepEqual(ctx.recorded.edits[0].disabledAgents, ['beta'], 'disabledAgents untouched')
    assert.equal(ctx.recorded.mutations.length, 0, 'no volatile write')
    assert.equal(existsSync(join(dir, 'ptc-subagent.md')), true, 'existing template kept')
    console.log('PASS custom-only Q1/Q2 + Q3 agy: agyEnabled alone changes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Q2 blank: no write; an answered Q2 without ptc still parks it ----------

{
  const dir = agentsDir(true)
  try {
    const ctx = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: [] }])
    const result = await handleSubagentsCommand(deps(ctx, dir, OFF, { isPtcEnabled: () => true }), INVOCATION)
    assert.equal(result.kind, 'success')
    assert.equal(result.text, EN.noChanges, 'a blank Q2 is not an answer')
    assert.equal(ctx.recorded.mutations.length, 0, 'no ptcEnabled=false write')
    assert.equal(ctx.recorded.refreshes, 0, 'no roster refresh')
    // An answered Q2 that checks only the other row still parks ptc-subagent.
    const answered = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: ['minimal-subagent'] }])
    await handleSubagentsCommand(deps(answered, dir, OFF, { isPtcEnabled: () => true }), INVOCATION)
    const ops = answered.recorded.mutations[0].ops
    assert.ok(ops.some((op) => op.path[0] === 'ptcEnabled' && op.value === false), 'answered Q2 without ptc writes false')
    const disabledOp = ops.find((op) => op.path[0] === 'disabledAgents')
    assert.ok(disabledOp && disabledOp.value.includes('ptc-subagent'), 'answered Q2 without ptc parks ptc-subagent')
    assert.equal(ops.find((op) => op.path[0] === 'agyEnabled'), undefined, 'Q2 never flips agy')
    console.log('PASS Q2 blank: no write; answered Q2 without ptc still parks it')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- MF3: stopped agy stays in the roster toggle and can be re-enabled ------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([
      { id: DISABLE_QUESTION_ID, selected: ['beta'] },
      { id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] },
    ])
    const state = { ...ON, definition: undefined }
    const result = await handleSubagentsCommand(deps(ctx, dir, state, { disabledAgents: ['agy'] }), INVOCATION)
    assert.equal(result.kind, 'success')
    const disable = ctx.recorded.asks[0].questions.find((q) => q.id === DISABLE_QUESTION_ID)
    assert.deepEqual(disable.options.map((o) => o.label), ['alpha', 'beta', 'gamma', 'agy'])
    assert.equal(disable.options.at(-1).description, EN.markDisabled, 'stopped agy is marked disabled')
    const disabledOp = ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'disabledAgents')
    assert.ok(disabledOp, 'roster toggle writes the new disabled list')
    assert.ok(!disabledOp.value.includes('agy'), 'unchecking agy in Q1 re-enables it')
    assert.equal(ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'agyEnabled'), undefined, 'Q3 already on: no switch write')
    console.log('PASS MF3: disabled agy stays in roster toggle and can be re-enabled')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- config editor: non-volatile write, nested paths rejected loudly --------

{
  const dir = agentsDir()
  try {
    const ctx = withConfigEditor(fakeCtx([{ id: AGY_QUESTION_ID, selected: [AGY_LABELS.enable] }]), { ptcEnabled: true, agyEnabled: false })
    await handleSubagentsCommand(deps(ctx, dir, OFF), INVOCATION)
    assert.equal(ctx.recorded.edits.length, 1, 'non-volatile write goes through the config editor')
    assert.equal(ctx.recorded.edits[0].agyEnabled, true)
    assert.equal(ctx.recorded.edits[0].ptcEnabled, true, 'unrelated keys are preserved')
    assert.equal(ctx.recorded.mutations.length, 0, 'settings.mutate is not used for non-volatile writes')

    const nestedCtx = fakeCtx([])
    const nested = withConfigEditor(nestedCtx)
    const message = await writeRegistryConfig(nestedCtx, [
      { op: 'set', path: ['ptcEnabled'], value: true },
      { op: 'set', path: ['config', 'nested'], value: 1 },
    ])
    assert.match(message, /Unsupported config path \(config\.nested\)/, 'nested path is reported, not skipped')
    assert.equal(nested.recorded.edits.length, 0, 'no partial edit is applied')
    console.log('PASS config editor: full-row write + nested path error')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll registry-command-agy assertions passed.')
