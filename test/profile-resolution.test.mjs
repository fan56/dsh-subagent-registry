// Unit verification for profile-aware runtime synthesis — no LLM, no cordis
// context. Covers: workspaceProfileName pin walking (nearest wins, blank
// pins skipped, whitespace/comments trimmed), composeAgentRuntime (pin +
// override wins, any read failure degrades to the baseline, per-field
// fallback, invalid thinking dropped), readModelProfilesDoc defensive read,
// and the `$DSH_HOME` root alignment of agentsDir / profile store.
// Run: node test/profile-resolution.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentsDir, dshHome } from '../lib/agents-dir.js'
import { composeAgentRuntime, modelProfilesPath, readModelProfilesDoc, workspaceProfileName } from '../lib/profile-resolution.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PREV_DSH_HOME = process.env.DSH_HOME
const scratchDirs = []

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  scratchDirs.push(dir)
  return dir
}

function withHome(callback) {
  const home = scratch('registry-profile-home-')
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return callback(home)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
}

function writeStore(home, doc) {
  writeFileSync(modelProfilesPath(home), typeof doc === 'string' ? doc : JSON.stringify(doc))
}

const STORE = {
  version: 1,
  current: 'other',
  profiles: [
    { name: 'work', agents: { workhorse: { model: 'digitalvolvo/glm-5.3', thinking: 'max' } } },
    { name: 'other', agents: { workhorse: { model: 'opencode-go/hy3', thinking: 'high' } } },
  ],
}

function pinnedWorkspace(profileName) {
  const ws = scratch('registry-profile-ws-')
  writeFileSync(join(ws, '.dsh-profile'), profileName.endsWith('\n') ? profileName : `${profileName}\n`)
  return ws
}

// ---------------------------------------------------------------------------
// workspaceProfileName: pin discovery and pin-text parsing
// ---------------------------------------------------------------------------

{
  const ws = pinnedWorkspace('  other  \n# a comment\n\n')
  assert.equal(workspaceProfileName(ws), 'other', 'whitespace/newline/comments trimmed to the profile name')
  console.log('PASS pin text: whitespace, blank lines and # comments are skipped, then trimmed')
}

{
  const root = pinnedWorkspace('work')
  const sub = join(root, 'sub')
  mkdirSync(sub)
  writeFileSync(join(sub, '.dsh-profile'), 'personal\n')
  assert.equal(workspaceProfileName(sub), 'personal', 'nearest pin wins from a subdirectory')
  assert.equal(workspaceProfileName(root), 'work', 'the parent keeps its own pin')
  console.log('PASS nearest pin: subdirectory pin shadows the parent pin')
}

{
  const parent = pinnedWorkspace('work')
  const sub = join(parent, 'empty-pin')
  mkdirSync(sub)
  writeFileSync(join(sub, '.dsh-profile'), '\n# nothing here\n')
  assert.equal(workspaceProfileName(sub), 'work', 'a blank/comment-only pin is skipped and the walk continues up')
  console.log('PASS blank pin: skipped, resolution continues to the parent pin')
}

{
  const bare = scratch('registry-profile-bare-')
  assert.equal(workspaceProfileName(bare), null, 'no pin in the tree resolves null')
  console.log('PASS no pin: workspaceProfileName resolves null')
}

{
  const parent = pinnedWorkspace('work')
  const sub = join(parent, 'unreadable-pin')
  mkdirSync(sub)
  const pinPath = join(sub, '.dsh-profile')
  writeFileSync(pinPath, 'work\n')
  try {
    chmodSync(pinPath, 0o000)
    assert.equal(workspaceProfileName(sub), 'work',
      'an unreadable pin is treated as absent (falls back to the parent pin)')
  } finally {
    chmodSync(pinPath, 0o600)
  }
  console.log('PASS unreadable pin: treated as absent, never throws')
}

// ---------------------------------------------------------------------------
// composeAgentRuntime: override ⊕ baseline semantics
// ---------------------------------------------------------------------------

{
  const bare = scratch('registry-profile-bare-')
  const composed = composeAgentRuntime('workhorse', { model: '', thinking: null }, { startDir: bare })
  assert.deepEqual(composed, {}, 'no pin + empty base values → empty result (inherit)')
  const baseOnly = composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'high' }, { startDir: bare })
  assert.deepEqual(baseOnly, { model: 'a/b', thinking: 'high' }, 'no pin → the baseline verbatim')
  console.log('PASS no pin: compose resolves the baseline')
}

{
  withHome((home) => {
    writeStore(home, STORE)
    const ws = pinnedWorkspace('other')
    const composed = composeAgentRuntime('workhorse', { model: 'zai-coding-cn/x', thinking: 'low' }, { startDir: ws })
    assert.deepEqual(composed, { model: 'opencode-go/hy3', thinking: 'high' },
      'pin + recorded override replaces each field')
  })
  console.log('PASS override: profile override wins over the baseline')
}

{
  withHome((home) => {
    writeStore(home, STORE)
    const ws = pinnedWorkspace('ghost')
    const composed = composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws })
    assert.deepEqual(composed, { model: 'a/b', thinking: 'low' },
      'pin names an unknown profile → baseline')
  })
  console.log('PASS unknown profile: pin → nonexistent profile resolves the baseline')
}

{
  withHome((home) => {
    writeStore(home, '{not valid json')
    const ws = pinnedWorkspace('other')
    const composed = composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws })
    assert.deepEqual(composed, { model: 'a/b', thinking: 'low' }, 'corrupt store → baseline, no throw')
  })
  console.log('PASS corrupt store: invalid JSON resolves the baseline without throwing')
}

{
  withHome((home) => {
    const ws = pinnedWorkspace('other')
    // Invalid doc shapes (non-object, object without profiles array).
    writeStore(home, '[]')
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws }),
      { model: 'a/b', thinking: 'low' },
      'a non-object document degrades to the baseline',
    )
    writeStore(home, { version: 1 })
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws }),
      { model: 'a/b', thinking: 'low' },
      'a document without a profiles array degrades to the baseline',
    )
    writeStore(home, { version: 1, profiles: [{ name: 'other' }] })
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws }),
      { model: 'a/b', thinking: 'low' },
      'a profile without an agents map degrades to the baseline',
    )
  })
  console.log('PASS malformed doc shapes: every read failure resolves the baseline')
}

{
  withHome((home) => {
    writeStore(home, {
      version: 1,
      profiles: [{ name: 'work', agents: { workhorse: { model: 'only-model' } } }],
    })
    const ws = pinnedWorkspace('work')
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'high' }, { startDir: ws }),
      { model: 'only-model', thinking: 'high' },
      'an override on one field leaves the other field at the baseline',
    )
    writeStore(home, { version: 1, profiles: [{ name: 'work', agents: { workhorse: {} } }] })
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'high' }, { startDir: ws }),
      { model: 'a/b', thinking: 'high' },
      'an empty recorded entry means explicit inherit → baseline',
    )
    writeStore(home, { version: 1, profiles: [{ name: 'work', agents: { workhorse: { thinking: 'typo' } } }] })
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'high' }, { startDir: ws }),
      { model: 'a/b', thinking: 'high' },
      'an unlisted thinking value is dropped → baseline effort',
    )
  })
  console.log('PASS per-field fallback: partial/empty/invalid overrides degrade per field')
}

{
  withHome((home) => {
    writeStore(home, STORE)
    const ws = pinnedWorkspace('other')
    // Profile names match case-insensitively (tui-pi findProfile semantics).
    writeFileSync(join(ws, '.dsh-profile'), 'OTHER\n')
    assert.deepEqual(
      composeAgentRuntime('workhorse', { model: 'a/b', thinking: 'low' }, { startDir: ws }),
      { model: 'opencode-go/hy3', thinking: 'high' },
      'profile name lookup is case-insensitive',
    )
    // Unknown agent name → baseline.
    writeFileSync(join(ws, '.dsh-profile'), 'other\n')
    assert.deepEqual(
      composeAgentRuntime('unlisted-agent', { model: 'a/b', thinking: 'low' }, { startDir: ws }),
      { model: 'a/b', thinking: 'low' },
      'an agent absent from the pinned profile keeps the baseline',
    )
  })
  console.log('PASS name matching: case-insensitive profile lookup, exact agent-name lookup')
}

// ---------------------------------------------------------------------------
// readModelProfilesDoc: defensive read (raw document or null)
// ---------------------------------------------------------------------------

{
  withHome((home) => {
    assert.equal(readModelProfilesDoc(), null, 'missing store → null')
    writeStore(home, '{oops')
    assert.equal(readModelProfilesDoc(), null, 'corrupt store → null')
    writeStore(home, STORE)
    assert.deepEqual(readModelProfilesDoc(), STORE, 'valid store → the raw parsed document')
  })
  console.log('PASS readModelProfilesDoc: missing/corrupt → null, valid → raw document')
}

// ---------------------------------------------------------------------------
// $DSH_HOME alignment: agentsDir() and the profile store follow the root
// ---------------------------------------------------------------------------

{
  withHome((home) => {
    assert.equal(dshHome(), home, 'dshHome follows $DSH_HOME')
    assert.equal(agentsDir(), join(home, 'agents'), 'agentsDir follows $DSH_HOME')
  })
  const prev = process.env.DSH_HOME
  delete process.env.DSH_HOME
  try {
    assert.equal(dshHome(), join(homedir(), '.dsh'), 'dshHome falls back to ~/.dsh')
    assert.equal(agentsDir(), join(homedir(), '.dsh', 'agents'), 'agentsDir falls back to ~/.dsh/agents')
  } finally {
    if (prev !== undefined) process.env.DSH_HOME = prev
  }
  console.log('PASS $DSH_HOME: agentsDir and the profile store both resolve against the env root')
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

if (PREV_DSH_HOME === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = PREV_DSH_HOME
for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true })

console.log('\nAll profile-resolution assertions passed.')
