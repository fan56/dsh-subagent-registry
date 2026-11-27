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

function deps(ctx, dir, agy) {
  return {
    ctx,
    agentsDir: dir,
    language: 'en',
    disabledAgents: [],
    refreshRoster: async () => { ctx.recorded.refreshes++ },
    isPtcEnabled: () => false,
    ...(agy === undefined ? {} : { agy: () => agy }),
  }
}

// --- switch off (and no wiring): both option lists byte-identical -----------

{
  const dir = agentsDir()
  try {
    const plain = fakeCtx([])
    await handleSubagentsCommand(deps(plain, dir), INVOCATION)
    const off = fakeCtx([])
    await handleSubagentsCommand(deps(off, dir, {
      enabled: false, resolved: true, reason: undefined, definition: DEFINITION,
    }), INVOCATION)
    assert.deepEqual(off.recorded.asks[0].questions, plain.recorded.asks[0].questions,
      'switch off → both questions identical, including descriptions')
    assert.deepEqual(
      off.recorded.asks[0].questions.find((q) => q.id === DISABLE_QUESTION_ID).options.map((o) => o.label),
      ['alpha', 'beta', 'gamma'],
    )
    assert.deepEqual(
      off.recorded.asks[0].questions.find((q) => q.id === OPT_IN_QUESTION_ID).options.map((o) => o.label),
      ['ptc-subagent', 'minimal-subagent'],
    )
    console.log('PASS switch off: two option lists byte-identical (no wiring and no agy rows)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- switch on: agy in the roster toggle and in the opt-in row --------------

{
  const dir = agentsDir()
  try {
    const state = { enabled: true, resolved: true, reason: undefined, definition: DEFINITION }
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
      enabled: true, resolved: true, reason: undefined, definition: DEFINITION,
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
      enabled: true, resolved: true, reason: undefined, definition: DEFINITION,
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
      enabled: true, resolved: true, reason: undefined, definition: DEFINITION,
    }), INVOCATION)
    assert.equal(ctx.recorded.mutations[0].ops.find((op) => op.path[0] === 'agyEnabled'), undefined)
    console.log('PASS declined opt-in question: agyEnabled untouched')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll registry-command-agy assertions passed.')
