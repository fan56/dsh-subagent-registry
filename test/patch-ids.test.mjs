// cordis.patch.yml guard (issue #9): the top-level insert rows must stay
// unique — a same-id insert from a later patch layer does NOT crash the
// loader; it silently REPLACES the earlier row wholesale (last writer wins,
// verified against the 0.2.2-rc.1 loader's EntryGroup id map), which is what
// wedged web/desktop profiles into a bundle-in-use deadlock — and must carry
// exactly the migrated set: the plugin's own row plus the two guarded
// preset rows. The two retired SERVICE rows (agent-preset-registry /
// subagent-model-selection-settings) must NOT come back as static rows:
// since 0.19.1 the plugin mounts them at runtime instead (src/preset-mount.ts),
// only where no same-id entry exists.
// Run: node --experimental-strip-types test/patch-ids.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_PRESET_REGISTRY_ROW,
  SUBAGENT_MODEL_SELECTION_ROW,
  PRESET_SUPPORT_ROWS,
} from '../src/preset-mount.ts'

const patchPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml')
const patch = readFileSync(patchPath, 'utf8')

/** Patch text with comment lines removed — assertions run on configuration values, not prose. */
const patchValues = patch.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')

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
    'preset-native',
    'preset-codemode',
  ].sort()
  assert.deepEqual([...topLevelIds].sort(), expected, 'the patch carries exactly the plugin row + the two guarded preset rows')
  console.log(`PASS top-level ids unique and complete: ${topLevelIds.join(', ')}`)
}

{
  // Issue #9: the two retired SERVICE rows must not reappear as static
  // insert rows. Their live counterparts mount at runtime through
  // src/preset-mount.ts, only where no same-id entry exists — a static
  // declaration is exactly what flipped the web default preset and wedged
  // removeBundle into bundle-in-use.
  for (const retired of ['agent-preset-registry', 'subagent-model-selection-settings']) {
    assert.ok(!topLevelIds.includes(retired), `no static top-level row for the retired service id ${retired}`)
    assert.ok(
      !new RegExp(`^ {4}- id: ${retired}$`, 'm').test(patchValues),
      `no insert row anywhere declares ${retired} (issue #9)`,
    )
  }
  console.log('PASS retired service rows absent from the static patch (issue #9)')
}

{
  // Runtime-mount predicate: the rows the plugin mounts at runtime must carry
  // exactly the shape the retired static rows had — same ids, same module
  // names, same `default: native` config — so tui/headless profiles compose
  // exactly the layer they always had.
  assert.deepEqual(
    PRESET_SUPPORT_ROWS.map((row) => row.id),
    ['agent-preset-registry', 'subagent-model-selection-settings'],
    'the runtime mount covers both retired service rows',
  )
  assert.equal(AGENT_PRESET_REGISTRY_ROW.name, '@deepseek-ai/dsh-agent-preset-registry', 'registry row keeps its module name')
  assert.deepEqual({ ...AGENT_PRESET_REGISTRY_ROW.config }, { default: 'native' }, 'registry row keeps default: native')
  assert.equal(SUBAGENT_MODEL_SELECTION_ROW.name, '@deepseek-ai/dsh-tool-subagent/model-selection-settings', 'model-selection row keeps its host package')
  assert.ok(!('config' in SUBAGENT_MODEL_SELECTION_ROW), 'model-selection row carries no config (as the retired static row)')
  console.log('PASS runtime-mounted rows match the retired static rows verbatim')
}

{
  // Guard two-state (issue #9): both preset rows carry a `disabled: !!js`
  // guard keyed on profileContext.startedBundles containing
  // @deepseek-ai/dsh-web-app. Evaluate the exact expression from the patch
  // against a stubbed loader context in both worlds: web profile (bundle
  // present → disabled, the web-app's own preset roster stays untouched) and
  // tui/headless (absent → enabled, rows mount as before the guard).
  const guardMatches = [...patchValues.matchAll(/^ {6}disabled: !!js "([^"]*startedBundles[^"]*)"$/gm)]
  assert.equal(guardMatches.length, 2, 'both preset rows carry the startedBundles guard')
  for (const [, expr] of guardMatches) {
    const evaluate = new Function('ctx', `"use strict"; return (${expr})`)
    const web = evaluate({ get: (key) => (key === 'profileContext' ? { startedBundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } : undefined) })
    assert.equal(web, true, `web profile (web-app started) disables the row: ${expr}`)
    const tui = evaluate({ get: (key) => (key === 'profileContext' ? { startedBundles: ['@deepseek-ai/dsh-base'] } : undefined) })
    assert.equal(tui, false, `tui/headless profile (no web-app) leaves the row enabled: ${expr}`)
    const bare = evaluate({ get: () => undefined })
    assert.equal(bare, false, `no profileContext (embedded host) leaves the row enabled: ${expr}`)
  }
  console.log('PASS preset-row guard evaluates true on web, false on tui/headless')
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
  // working-directory:current runtime context instead.
  assert.ok(!patchValues.includes('{{cwd}}'), 'no {{cwd}} prompt-variable reference in patch values (issue #8)')
  console.log('PASS persona carries no {{cwd}} reference (issue #8)')
}

{
  // The two guarded preset rows keep their migrated composition: the native
  // preset shadows nothing, the codemode preset keeps the PTC presentation
  // row (inert until upstream fixes preset-scoped presentAs), and the
  // tool-subagent row uses the schema's real key.
  const presetRowCount = [...patchValues.matchAll(/- id: preset-(native|codemode)$/gm)].length
  assert.equal(presetRowCount, 2, 'both preset rows present')
  assert.match(patch, /mode: ptc/, 'the codemode preset keeps the inert mode: ptc presentation row')
  assert.match(patch, /ptcEnabled: false/, 'the plugin row documents the default-off codemode gate')
  console.log('PASS guarded preset-row composition preserved')
}

{
  // Issue #9, third finding: `modelSelectionSettings` is not a key of the
  // tool-subagent config schema (the official preset's rows carry
  // `modelSelection`); the stray key sat inert in the delegation group row.
  assert.ok(!patchValues.includes('modelSelectionSettings'), 'no invalid modelSelectionSettings key in patch values')
  assert.match(patchValues, /modelSelection: true/, 'the tool-subagent row carries modelSelection: true')
  console.log('PASS tool-subagent uses the schema-valid modelSelection key')
}
