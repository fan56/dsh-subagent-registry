// Built-in agy routing: the minimal external activation spec, the pre-loadAgent
// branch, ACP_FOREGROUND_ONLY for unsupported modes, shadowing and the S7 note.
// Run: node test/acp-routing.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activateExternal, runAgentTool, visibleBuiltinAgy } from '../lib/tool-run-agent.js'
import { builtinAgyEdition } from '../lib/builtin-agy.js'
import { ACP_CODES } from '../lib/acp/errors.js'
import { Config } from '../lib/index.js'

const DIR = mkdtempSync(join(tmpdir(), 'acp-routing-'))

const parent = () => ({ id: 'root-1', options: {}, session: { header: {} }, ctx: {} })
const exec = () => ({ signal: new AbortController().signal, agent: parent() })

function config(overrides = {}) {
  return {
    agentsDir: DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
    language: 'en',
    agy: { enabled: true, resolveExecutable: (name) => (name === 'agy' ? '/usr/local/bin/agy' : undefined) },
    ...overrides,
  }
}

function fakeActivation({ result, onDispose } = {}) {
  let disposed = 0
  return {
    activation: {
      childId: 'child-1',
      name: 'agent-1',
      result: Promise.resolve(result ?? { output: [{ type: 'text', text: 'done' }], stopReason: 'completed' }),
      dispose: async () => { disposed++ },
    },
    count: () => disposed,
  }
}

// --- resolveBuiltinAgy visibility gates ------------------------------------

{
  assert.equal(visibleBuiltinAgy(DIR, { enabled: false, resolveExecutable: () => '/usr/bin/agy' }), undefined,
    'switch off hides the built-in')
  assert.equal(visibleBuiltinAgy(DIR, { enabled: true, resolveExecutable: () => undefined }), undefined,
    'unresolvable command hides the built-in')
  assert.equal(visibleBuiltinAgy(DIR, {
    enabled: true, resolveExecutable: () => '/usr/bin/agy', disabledAgents: ['agy'],
  }), undefined, 'roster toggle hides the built-in')
  const visible = visibleBuiltinAgy(DIR, { ...config().agy, language: 'en' })
  assert.equal(visible.name, 'agy')
  assert.equal(visible.displayName, builtinAgyEdition('en').displayName)
  console.log('PASS visibility gates: enabled + resolvable + not disabled')
}

// --- activateExternal: minimal spec, no reserved identity/composition ------

{
  const specs = []
  const ctx = {
    subagents: {
      startActivation: async (spec) => {
        specs.push(spec)
        return fakeActivation().activation
      },
    },
  }
  const signal = new AbortController().signal
  const prompt = [{ type: 'text', text: 'brief' }]
  await activateExternal(ctx, 'registry-acp', 'agy', prompt, signal, 'parent', parent())
  assert.equal(specs.length, 1)
  const spec = specs[0]
  assert.equal(spec.provider, 'registry-acp')
  assert.equal(spec.label, 'agy')
  assert.equal(spec.delivery, 'parent')
  assert.equal(spec.signal, signal)
  assert.equal(spec.prompt, prompt)
  for (const forbidden of ['childId', 'name', 'persona', 'toolFilter', 'agentOptions']) {
    assert.equal(Object.hasOwn(spec, forbidden), false, `spec must not carry ${forbidden}`)
  }
  console.log('PASS activateExternal: minimal spec, no childId/name/composition')
}

// --- nested caller refused before any host call -----------------------------

{
  const nested = { id: 'child-1', options: {}, session: { header: { parentSession: 'root-1' } }, ctx: {} }
  const ctx = { subagents: { startActivation: async () => { throw new Error('should not reach the host') } } }
  await assert.rejects(
    () => activateExternal(ctx, 'registry-acp', 'agy', [], new AbortController().signal, 'caller', nested),
    (error) => {
      assert.equal(error.code, 'DSH_REGISTRY_NESTED_DELEGATION_UNSUPPORTED')
      return true
    },
  )
  console.log('PASS activateExternal: nested caller rejected before host call')
}

// --- use_agent routes agy before loadAgent and reuses the foreground settle -

{
  const specs = []
  const { activation, count } = fakeActivation()
  const ctx = {
    subagents: { startActivation: async (spec) => { specs.push(spec); return activation } },
  }
  const tool = runAgentTool(ctx, config())
  assert.match(tool.description, /ONE AT A TIME/, 'S7: dispatch serially')
  assert.match(tool.description, /ACP_BUSY/, 'S7: name the immediate over-cap failure')
  assert.match(tool.description, /- agy \(Gemini plan · Experimental\)/, 'built-in roster line present')
  // T34: a stop is a user decision, not a transient failure. The description
  // must suppress the model's tendency to re-dispatch after a cancellation.
  assert.match(tool.description, /NOT a transient error/, 'cancellation is not a transient error')
  assert.match(tool.description, /ACP_ABORTED/, 'name the cancellation code')
  assert.match(tool.description, /subagent run was cancelled/, 'name the settlement text')
  assert.match(tool.description, /do NOT retry the same task on your own/, 'never auto-retry on stop')
  assert.match(tool.description, /wait for the user's instruction/, 'report and wait instead')
  assert.match(tool.description, /re-dispatch only if the user explicitly asks/, 'user may still re-dispatch')
  const output = await tool.execute({ agent: 'agy', prompt: 'do the task' }, exec())
  assert.deepEqual(output.output, [{ type: 'text', text: 'done' }], 'child output returned verbatim')
  assert.equal(specs.length, 1)
  const spec = specs[0]
  assert.equal(spec.provider, 'registry-acp')
  assert.equal(spec.delivery, 'parent', 'parent delivery puts agy in the host catalog')
  assert.equal(Object.hasOwn(spec, 'childId'), false)
  assert.equal(Object.hasOwn(spec, 'name'), false, 'no fixed name — host assigns agent-N')
  assert.equal(Object.hasOwn(spec, 'persona'), false)
  const text = spec.prompt[0].text
  assert.ok(text.includes(builtinAgyEdition('en').body), 'persona is inlined into the prompt')
  assert.ok(text.includes('\n\n---\n\ndo the task'), 'task brief follows the persona')
  assert.equal(count(), 1, 'settleForegroundRun disposed the run before returning')
  console.log('PASS execute: built-in agy dispatched through the minimal spec, settled and disposed')
}

// --- unsupported modes and disabled toggle are pre-release rejections -------

{
  const calls = []
  const ctx = { subagents: { startActivation: async (spec) => { calls.push(spec); return fakeActivation().activation } } }
  const tool = runAgentTool(ctx, config())
  for (const args of [
    { agent: 'agy', prompt: 'x', background: true },
    { agent: 'agy', prompt: 'x', resume: true },
    { agent: 'agy', prompt: 'x', fresh: true },
  ]) {
    await assert.rejects(() => tool.execute(args, exec()), (error) => {
      assert.match(error.message, new RegExp(`\\[${ACP_CODES.FOREGROUND_ONLY}\\]`))
      assert.match(error.message, /one-shot foreground/)
      return true
    }, `${Object.keys(args)[2]} rejected with ACP_FOREGROUND_ONLY`)
  }
  const disabled = runAgentTool(ctx, config({ disabledAgents: ['agy'] }))
  await assert.rejects(
    () => disabled.execute({ agent: 'agy', prompt: 'x' }, exec()),
    /disabled by the disabledAgents plugin config/,
  )
  assert.equal(calls.length, 0, 'no activation for any refused call')
  console.log('PASS pre-release errors: background/resume/fresh → ACP_FOREGROUND_ONLY; toggle refuses')
}

// --- user-owned agy.md shadows the built-in ---------------------------------

{
  writeFileSync(join(DIR, 'agy.md'), '---\nname: agy\ndescription: "user agy"\n---\nBody.\n')
  try {
    const specs = []
    const ctx = {
      subagents: {
        startActivation: async (spec) => { specs.push(spec); return fakeActivation().activation },
        start: async () => { throw new Error('LEGACY_PATH') },
      },
    }
    const tool = runAgentTool(ctx, config({ resume: 'off' }))
    assert.doesNotMatch(tool.description, /- agy \(Gemini plan/, 'built-in line shadowed by the user file')
    const result = await tool.execute({ agent: 'agy', prompt: 'x' }, exec())
    assert.equal(result.kind, 'agent-result')
    assert.equal(specs.length, 1)
    assert.equal(specs[0].provider, 'spawn', 'user file goes through the configured in-process provider')
    assert.equal(Object.hasOwn(specs[0], 'childId'), true, 'ordinary path still reserves a childId')
    console.log('PASS shadowing: user agy.md keeps the ordinary in-process path')
  } finally {
    rmSync(join(DIR, 'agy.md'), { force: true })
  }
}

// --- switch off: description byte-identical to a plain roster --------------

{
  const plain = runAgentTool({}, { agentsDir: DIR, provider: 'spawn', toolName: 'use_agent' })
  const off = runAgentTool({}, config({ agy: { enabled: false, resolveExecutable: () => '/usr/bin/agy' } }))
  assert.equal(off.description, plain.description, 'no agy note or roster line when the switch is off')
  console.log('PASS switch off: tool description unchanged')
}

// --- T38: agyModel config key (volatile) + per-call override + fail-loud ----

{
  const defaults = Config({})
  assert.equal(defaults.agyModel.get(), '', 'agyModel default is the empty string')
  assert.equal(typeof defaults.agyModel.get, 'function', 'agyModel is volatile')
  console.log('PASS Config: agyModel defaults to "" and is volatile')
}

{
  const specs = []
  const ctx = { subagents: { startActivation: async (spec) => { specs.push(spec); return fakeActivation().activation } } }
  const tool = runAgentTool(ctx, config({ agyModel: 'gemini-4-carbon' }))
  assert.ok(tool.parameters.properties.agyModel, 'use_agent declares the optional agyModel parameter')
  assert.equal(tool.parameters.required.includes('agyModel'), false, 'agyModel is not required')
  assert.match(tool.description, /Pass agyModel/, 'description teaches the per-call override')

  await tool.execute({ agent: 'agy', prompt: 'x' }, exec())
  assert.equal(specs.at(-1).model, 'gemini-4-carbon', 'config value is the default for agy')
  await tool.execute({ agent: 'agy', prompt: 'x', agyModel: 'claude-sonnet-5-5' }, exec())
  assert.equal(specs.at(-1).model, 'claude-sonnet-5-5', 'per-call value overrides the config key')
  assert.equal(Object.hasOwn(specs.at(-1), 'agentOptions'), false, 'model does not ride as agentOptions')

  await assert.rejects(
    () => tool.execute({ agent: 'workhorse', prompt: 'x', agyModel: 'claude-sonnet-5-5' }, exec()),
    (error) => {
      assert.match(error.message, /agyModel only applies to the built-in agy member/)
      return true
    },
  )
  assert.equal(specs.length, 2, 'no activation for a non-agy agyModel call')
  console.log('PASS agyModel: config default, per-call override, fail-loud on non-agy')
}

rmSync(DIR, { recursive: true, force: true })
console.log('\nAll acp-routing assertions passed.')
