// /registry-config + agy: byte-identical option lists with the switch off,
// built-in member merged into the roster toggle when on, agyEnabled writes,
// and the experimental/hooks/permission status line.
// Run: node test/registry-command-agy.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildDisableQuestion,
  buildOptInQuestion,
  handleSubagentsCommand,
  loadSubagentsStrings,
  DISABLE_QUESTION_ID,
  OPT_IN_QUESTION_ID,
  SUBAGENTS_SETTINGS_NAMESPACE,
} from '../lib/subagents-command.js'

const EN = loadSubagentsStrings('en')
const INVOCATION = { agent: { id: 'root-1' }, rawInput: '', signal: new AbortController().signal }
const DEFINITION = { name: 'agy', displayName: 'Gemini plan · Experimental' }

function agentsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'registry-command-agy-'))
  for (const name of ['alpha', 'beta', 'gamma']) {
    writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\ndescription: "the ${name} agent"\n---\nBody.\n`)
  }
  return dir
}

function fakeCtx(answers) {
  const recorded = { asks: [], mutations: [], refreshes: 0 }
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

// --- no wiring: both option lists byte-identical to the pre-agy wizard ------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([])
    await handleSubagentsCommand(deps(ctx, dir), INVOCATION)
    const questions = ctx.recorded.asks[0].questions
    assert.deepEqual(
      questions.find((q) => q.id === DISABLE_QUESTION_ID).options,
      ['alpha', 'beta', 'gamma'].map((name) => ({ label: name, description: EN.markEnabled })),
    )
    assert.deepEqual(
      questions.find((q) => q.id === OPT_IN_QUESTION_ID).options.map((o) => o.label),
      ['ptc-subagent', 'minimal-subagent'],
    )
    console.log('PASS no wiring: two option lists byte-identical (no agy rows)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- wired + switch off: the agy row is visible, marked off / not found -----

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([])
    await handleSubagentsCommand(deps(ctx, dir, {
      enabled: false, resolved: false, reason: 'ENOENT',
    }), INVOCATION)
    const optIn = ctx.recorded.asks[0].questions.find((q) => q.id === OPT_IN_QUESTION_ID)
    assert.deepEqual(optIn.options.map((o) => o.label), ['ptc-subagent', 'minimal-subagent', 'agy'])
    assert.ok(optIn.options[2].description.includes(EN.agyOffNow), 'off switch is marked')
    assert.ok(optIn.options[2].description.includes('ENOENT'), 'unresolved command is marked')

    const foundCtx = fakeCtx([])
    await handleSubagentsCommand(deps(foundCtx, dir, {
      enabled: false, resolved: true, reason: undefined,
    }), INVOCATION)
    const found = foundCtx.recorded.asks[0].questions.find((q) => q.id === OPT_IN_QUESTION_ID).options[2].description
    assert.ok(found.includes(EN.agyOffNow) && found.includes(EN.agyFound) && !found.includes(EN.agyOnNow))
    console.log('PASS wired + switch off: agy row visible with off/not-found marks')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- switch on: agy in the roster toggle and in the opt-in row --------------

{
  const dir = agentsDir()
  try {
    const state = {
      enabled: true, resolved: true, reason: undefined,
      definition: DEFINITION, definitionIgnoringToggle: DEFINITION,
    }
    const disable = buildDisableQuestion(EN, [], [], DEFINITION)
    assert.deepEqual(disable.options.map((o) => o.label), ['agy'])
    assert.equal(disable.options[0].description, EN.markEnabled)
    const optIn = buildOptInQuestion(EN, dir, false, state)
    assert.deepEqual(optIn.options.map((o) => o.label), ['ptc-subagent', 'minimal-subagent', 'agy'])
    assert.match(optIn.options[2].description, /Experimental/)
    assert.ok(optIn.options[2].description.includes(EN.agyOnNow))
    assert.ok(optIn.options[2].description.includes(EN.agyFound))
    const unresolved = buildOptInQuestion(EN, dir, false, {
      ...state, resolved: false, reason: 'ENOENT',
    })
    assert.match(unresolved.options[2].description, /command not found: ENOENT/)
    console.log('PASS switch on: built-in in roster toggle + opt-in row with resolution state')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- unchecking agy writes agyEnabled=false and reports the status line ----

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: [] }])
    const result = await handleSubagentsCommand(deps(ctx, dir, {
      enabled: true, resolved: true, reason: undefined,
      definition: DEFINITION, definitionIgnoringToggle: DEFINITION,
    }), INVOCATION)
    assert.equal(result.kind, 'success')
    const ops = ctx.recorded.mutations[0].ops
    const agyOp = ops.find((op) => op.path[0] === 'agyEnabled')
    assert.ok(agyOp && agyOp.value === false, 'unchecking agy writes agyEnabled=false')
    assert.match(result.text, /Experimental/)
    assert.match(result.text, /hooks/i, 'status line warns about hooks')
    assert.match(result.text, /permission/i, 'status line explains permission handling')
    assert.match(result.text, /~9s/, 'status line states the teardown expectation')
    assert.match(result.text, /agyEnabled → false/)
    console.log('PASS opt-out: agyEnabled=false write + experimental/hooks/permission status')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- leaving agy checked keeps the switch on (no redundant write) ----------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: ['ptc-subagent', 'agy'] }])
    const result = await handleSubagentsCommand(deps(ctx, dir, {
      enabled: true, resolved: true, reason: undefined,
      definition: DEFINITION, definitionIgnoringToggle: DEFINITION,
    }), INVOCATION)
    assert.equal(result.kind, 'success')
    const ops = ctx.recorded.mutations[0].ops
    assert.equal(ops.find((op) => op.path[0] === 'agyEnabled'), undefined, 'no redundant write')
    assert.match(result.text, /Experimental/)
    assert.doesNotMatch(result.text, /agyEnabled → false/)
    console.log('PASS opt-in kept: no agyEnabled write when already on')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- declined question never flips the non-volatile switch ------------------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: DISABLE_QUESTION_ID, selected: ['beta'] }])
    await handleSubagentsCommand(deps(ctx, dir, {
      enabled: true, resolved: true, reason: undefined,
      definition: DEFINITION, definitionIgnoringToggle: DEFINITION,
    }), INVOCATION)
    assert.equal(ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'agyEnabled'), undefined)
    console.log('PASS declined opt-in question: agyEnabled untouched')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- checking agy from off writes true (documented enable path) --------------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: ['agy'] }])
    const result = await handleSubagentsCommand(deps(ctx, dir, {
      enabled: false, resolved: true, reason: undefined,
    }), INVOCATION)
    assert.equal(result.kind, 'success')
    const ops = ctx.recorded.mutations[0].ops
    assert.ok(ops.some((op) => op.path[0] === 'agyEnabled' && op.value === true), 'checking agy writes true')
    assert.match(result.text, /agyEnabled → true/)
    console.log('PASS opt-in: checking agy from off writes agyEnabled=true')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- declined Q2 while off never flips the switch on ------------------------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: DISABLE_QUESTION_ID, selected: ['beta'] }])
    await handleSubagentsCommand(deps(ctx, dir, {
      enabled: false, resolved: true, reason: undefined,
    }), INVOCATION)
    assert.equal(ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'agyEnabled'), undefined)
    console.log('PASS declined opt-in question while off: agyEnabled untouched')
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
      { id: OPT_IN_QUESTION_ID, selected: ['agy'] },
    ])
    const state = {
      enabled: true, resolved: true, reason: undefined,
      // The visible definition is gone (toggled off), but the toggle-agnostic
      // one is still supplied to the wizard.
      definition: undefined, definitionIgnoringToggle: DEFINITION,
    }
    const result = await handleSubagentsCommand(deps(ctx, dir, state, { disabledAgents: ['agy'] }), INVOCATION)
    assert.equal(result.kind, 'success')
    const disable = ctx.recorded.asks[0].questions.find((q) => q.id === DISABLE_QUESTION_ID)
    assert.deepEqual(disable.options.map((o) => o.label), ['alpha', 'beta', 'gamma', 'agy'])
    assert.equal(disable.options.at(-1).description, EN.markDisabled, 'stopped agy is marked disabled')
    const disabledOp = ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'disabledAgents')
    assert.ok(disabledOp, 'roster toggle writes the new disabled list')
    assert.ok(!disabledOp.value.includes('agy'), 'unchecking agy re-enables it')
    console.log('PASS MF3: disabled agy stays in roster toggle and can be re-enabled')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- non-volatile switch: config editor, not the volatile-only form ----------

{
  const dir = agentsDir()
  try {
    const ctx = fakeCtx([{ id: OPT_IN_QUESTION_ID, selected: ['agy'] }])
    ctx.recorded.edits = []
    const editor = {
      entries: () => [{ options: { id: SUBAGENTS_SETTINGS_NAMESPACE } }],
      async edit(_entry, change) {
        ctx.recorded.edits.push(change({ ptcEnabled: true, agyEnabled: false }, {}))
      },
    }
    const settingsGet = ctx.get.bind(ctx)
    ctx.get = (name) => name === 'configEditor' ? editor : settingsGet(name)
    await handleSubagentsCommand(deps(ctx, dir, {
      enabled: false, resolved: true, reason: undefined,
    }), INVOCATION)
    assert.equal(ctx.recorded.edits.length, 1, 'non-volatile write goes through the config editor')
    assert.equal(ctx.recorded.edits[0].agyEnabled, true)
    assert.equal(ctx.recorded.edits[0].ptcEnabled, true, 'unrelated keys are preserved')
    assert.equal(ctx.recorded.mutations.length, 0, 'settings.mutate is not used for non-volatile writes')
    console.log('PASS non-volatile write: config editor carries agyEnabled=true')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll registry-command-agy assertions passed.')
