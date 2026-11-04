// The disabledAgents roster toggle: disabled names vanish from the dispatch
// AND follow-up tool descriptions, an execute-time re-check refuses calls by
// name (even when the model hard-names a disabled agent), and a hot-swap of
// the volatile ref applies on the next read without rebuilding. No LLM, no
// cordis runtime — the agent files live in a temp dir and the ctx is a bare
// double (the guarded code paths run before any host service is touched).
// Run: node test/roster-toggle.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAgentTool, currentDisabledAgents, isAgentDisabled } from '../lib/tool-run-agent.js'
import { askAgentTool } from '../lib/interactive.js'

/** A throwaway agents dir with three agents (alpha, beta, gamma). */
const DIR = mkdtempSync(join(tmpdir(), 'roster-toggle-'))
for (const name of ['alpha', 'beta', 'gamma']) {
  writeFileSync(join(DIR, `${name}.md`), `---\nname: ${name}\ndescription: "the ${name} agent"\n---\nBody of ${name}.\n`)
}

/** Bare ctx double: the disabled re-check throws before any host seam. */
function fakeExec() {
  return {
    signal: new AbortController().signal,
    agent: { id: 'parent-1', options: {}, session: { header: {} } },
  }
}

// --- helpers: both shapes of the config value ---

{
  const ref = { get: () => ['beta'] }
  assert.deepEqual(currentDisabledAgents(ref), ['beta'], 'volatile-ref shape reads through get()')
  assert.deepEqual(currentDisabledAgents(['x']), ['x'], 'plain-array shape passes through')
  assert.deepEqual(currentDisabledAgents(undefined), [], 'absent = nothing disabled')
  assert.equal(isAgentDisabled('beta', ref), true)
  assert.equal(isAgentDisabled('alpha', ref), false)
  assert.equal(isAgentDisabled('beta', undefined), false)
  console.log('PASS currentDisabledAgents/isAgentDisabled over both shapes')
}

// --- roster description excludes disabled names (dispatch tool) ---

{
  const tool = runAgentTool({}, {
    agentsDir: DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
    disabledAgents: ['beta'],
  })
  assert.ok(tool.description.includes('alpha'), 'enabled agent listed')
  assert.ok(tool.description.includes('gamma'), 'enabled agent listed')
  assert.ok(!tool.description.includes('- beta'), 'disabled agent absent from the roster text')
  assert.ok(!tool.description.includes('the beta agent'), 'disabled agent description absent')
  assert.equal(tool.parameters.properties.agent.description, 'The name of the local agent to run. One of: alpha, gamma',
    'the parameter name list follows the toggle')
  // No toggle: everything listed.
  const full = runAgentTool({}, { agentsDir: DIR, provider: 'spawn', toolName: 'use_agent' })
  assert.ok(full.description.includes('beta'), 'no toggle keeps the full roster')
  console.log('PASS dispatch description excludes disabled agents')
}

// --- execute refuses a disabled name even though the file exists ---

{
  const cfg = {
    agentsDir: DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
    disabledAgents: ['beta'],
  }
  const tool = runAgentTool({}, cfg)
  await assert.rejects(
    () => tool.execute({ agent: 'beta', prompt: 'do things' }, fakeExec()),
    (error) => {
      assert.match(error.message, /disabled by the disabledAgents plugin config/)
      assert.match(error.message, /\/registry-config/, 'the error points at the management command')
      assert.match(error.message, /beta\.md file is untouched/, 'the error promises the file stays')
      return true
    },
  )
  console.log('PASS execute rejects a disabled agent name')
}

// --- hot swap: flipping the volatile ref applies on the next read ---

{
  const box = { list: ['beta'] }
  const cfg = {
    agentsDir: DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    disabledAgents: { get: () => box.list },
  }
  const tool = runAgentTool({}, cfg)
  await assert.rejects(() => tool.execute({ agent: 'beta', prompt: 'x' }, fakeExec()), /disabledAgents/)
  // Hot-swap: beta re-enabled, alpha disabled — same definition object, new reads.
  box.list = ['alpha']
  await assert.rejects(() => tool.execute({ agent: 'alpha', prompt: 'x' }, fakeExec()), /disabledAgents/)
  await tool.execute({ agent: 'beta', prompt: 'x' }, fakeExec()).then(
    () => assert.fail('beta should have proceeded past the toggle check'),
    (error) => {
      // beta is enabled now, so the failure must NOT be the toggle — the bare
      // ctx double stops later in the pipeline (unknown host tools etc.).
      assert.ok(!/disabledAgents/.test(error.message), `unexpected toggle rejection: ${error.message}`)
    },
  )
  // A rebuilt definition reflects the new roster snapshot.
  const refreshed = runAgentTool({}, cfg)
  assert.ok(!refreshed.description.includes('- alpha'), 'refreshed roster drops the newly disabled agent')
  assert.ok(refreshed.description.includes('- beta'), 'refreshed roster restores beta')
  console.log('PASS hot-swap of the volatile ref applies per read')
}

// --- ask_agent: same filter on the description + execute re-check ---

{
  const tool = askAgentTool({}, {
    agentsDir: DIR,
    toolName: 'ask_agent',
    dispatchToolName: 'use_agent',
    disabledAgents: ['beta'],
  })
  assert.ok(tool.description.includes('alpha, gamma'), 'follow-up name list follows the toggle')
  assert.ok(!tool.description.includes('beta,'), 'disabled name absent')
  await assert.rejects(
    () => tool.execute({ agent: 'beta', message: 'status?' }, fakeExec()),
    (error) => {
      assert.match(error.message, /ask_agent: agent "beta" is disabled/)
      return true
    },
  )
  // No toggle: beta addressable up to the (absent) subagent service.
  const open = askAgentTool({}, { agentsDir: DIR, toolName: 'ask_agent' })
  await open.execute({ agent: 'beta', message: 'status?' }, fakeExec()).then(
    () => assert.fail('expected the missing-subagents failure'),
    (error) => assert.ok(!/disabled/.test(error.message), `unexpected toggle rejection: ${error.message}`),
  )
  console.log('PASS ask_agent filters disabled agents (description + execute)')
}

after()

function after() {
  rmSync(DIR, { recursive: true, force: true })
}

console.log('\nAll roster-toggle assertions passed.')
