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
