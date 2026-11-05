// cordis.patch.yml guard: the top-level insert rows must stay unique (a
// duplicated id across patch layers crashes the loader) and must carry
// exactly the migrated set — the plugin's own row plus the four agent-preset
// rows taken over from @aiwayds/dsh-ptc-subagent. The retired standalone
// ids must NOT come back.
// Run: node test/patch-ids.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const patchPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml')
const patch = readFileSync(patchPath, 'utf8')

/**
 * Top-level insert ids: the loader's uniqueness domain is the insert row of
 * each patch layer. Rows are the 4-space-indented `- id:` entries directly
 * under `- insert:`; the preset rows' nested plugin entries are deeper
 * indented and scoped to their preset config, so they never collide across
 * layers.
 */
const topLevelIds = [...patch.matchAll(/^ {4}- id: (\S+)$/gm)].map((match) => match[1])

{
  assert.ok(topLevelIds.length > 0, 'the patch declares insert rows')
  const duplicates = topLevelIds.filter((id, index) => topLevelIds.indexOf(id) !== index)
  assert.deepEqual(duplicates, [], `no duplicated top-level insert ids (${topLevelIds.join(', ')})`)
  const expected = [
    'dsh-subagent-registry',
    'agent-preset-registry',
    'subagent-model-selection-settings',
    'preset-native',
    'preset-codemode',
  ].sort()
  assert.deepEqual([...topLevelIds].sort(), expected, 'the merged patch carries exactly the plugin row + the four preset guard rows')
  console.log(`PASS top-level ids unique and complete: ${topLevelIds.join(', ')}`)
}

{
  // The merged-away standalone packages must not reappear as mount rows:
  // their payloads live inside this plugin now (codemode behind ptcEnabled;
  // the agent definitions as opt-in templates).
  assert.ok(!topLevelIds.includes('dsh-ptc-subagent'), 'no dsh-ptc-subagent row (package merged away)')
  assert.ok(!topLevelIds.includes('dsh-mini-subagent'), 'no dsh-mini-subagent row (package merged away)')
  console.log('PASS retired standalone ids absent')
}

{
  // Issue #8 regression guard: the delegation group's list_agents row must
  // ride this package's per-host bridge subpath — never the upstream
  // `./list-agents` subpath, which the 0.2.2 control package dropped from its
  // exports map (importing it there fails the whole codemode preset with
  // ERR_PACKAGE_PATH_NOT_EXPORTED / never started).
  assert.ok(!patch.includes("'@deepseek-ai/dsh-tool-subagent-control/list-agents'"), 'no direct upstream ./list-agents mount row (issue #8)')
  assert.match(patch, /- id: tool-subagent-list-agents\n {16}name: '@aiwayds\/dsh-subagent-registry\/legacy-subagent-list-agents'/, 'the list_agents row mounts the per-host bridge subpath')
  console.log('PASS list_agents mount rides the per-host bridge (issue #8)')
}

{
  // Issue #8, second finding: the codemode persona must not reference the
  // {{cwd}} prompt variable — no host generation registers it and strict
  // prompt interpolation throws at assembly, killing the first turn of every
  // codemode session. The working directory reaches the model through the
  // working-directory:current runtime context instead. Comment lines are
  // stripped first: the guard checks configuration values, not prose.
  const patchValues = patch.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
  assert.ok(!patchValues.includes('{{cwd}}'), 'no {{cwd}} prompt-variable reference in patch values (issue #8)')
  console.log('PASS persona carries no {{cwd}} reference (issue #8)')
}

{
  // The four guard rows keep their migrated composition: the preset registry
  // defaults to native, the model-selection host service rides along, the
  // native preset shadows nothing, and the codemode preset keeps the PTC
  // presentation row (inert until upstream fixes preset-scoped presentAs).
  assert.match(patch, /- id: agent-preset-registry\n {6}name: '@deepseek-ai\/dsh-agent-preset-registry'\n {6}config:\n {8}default: native/, 'agent-preset-registry row keeps default: native')
  assert.match(patch, /- id: subagent-model-selection-settings\n {6}name: '@deepseek-ai\/dsh-tool-subagent\/model-selection-settings'/, 'model-selection-settings row keeps its host package')
  const presetRowCount = [...patch.matchAll(/- id: preset-(native|codemode)$/gm)].length
  assert.equal(presetRowCount, 2, 'both preset rows present')
  assert.match(patch, /mode: ptc/, 'the codemode preset keeps the inert mode: ptc presentation row')
  assert.match(patch, /ptcEnabled: false/, 'the plugin row documents the default-off codemode gate')
  console.log('PASS guard-row composition preserved')
}
