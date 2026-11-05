// The per-host list_agents mount bridge (issue #8): the codemode preset's
// delegation group must never import the upstream `./list-agents` subpath on
// a host whose control package no longer exports it (0.2.2+ — the removal
// killed the whole preset with ERR_PACKAGE_PATH_NOT_EXPORTED / never started),
// and must keep mounting the legacy sub-entry where it still exists
// (0.2.0-rc.2 … 0.2.1-rc.x, whose main entry registers no discovery).
// This file exercises the dev-closure side: the loader contract, the manifest
// probe outcomes (including the 0.2.2+ no-op path against the real pinned
// control package), and the probe's edge shapes. The old-tower dynamic import
// runs in test/host-legacy-list-agents.test.mjs through the published-closure
// matrix (npm run test:hosts -- host-legacy-list-agents).
// Run: node test/legacy-list-agents.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Bridge from '../lib/legacy-list-agents.js'

// The loader entry contract: same module name and service seam the legacy
// sub-entry declared, plus an apply the loader can start.
{
  assert.equal(Bridge.name, 'tool-subagent-list-agents', 'module name matches the legacy sub-entry')
  assert.deepEqual(Bridge.inject, ['tools', 'subagents', 'agents'], 'inject matches the legacy sub-entry seam')
  assert.equal(typeof Bridge.apply, 'function', 'apply is the loader entry point')
  assert.equal(typeof Bridge.controlPackageExportsListAgents, 'function', 'the manifest probe is exported for tests')
  console.log('PASS loader entry contract: name/inject/apply present')
}

// Manifest probe outcomes against real published manifests.
{
  const devControlDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@deepseek-ai', 'dsh-tool-subagent-control')
  assert.ok(existsSync(join(devControlDir, 'package.json')), 'the pinned dev closure carries the control package')
  const devManifest = JSON.parse(readFileSync(join(devControlDir, 'package.json'), 'utf8'))
  assert.match(String(devManifest.version), /^0\.2\.2/, 'the dev closure pins a 0.2.2-generation control package')
  assert.equal(devManifest.exports?.['./list-agents'], undefined, 'the 0.2.2+ exports map drops ./list-agents (the issue #8 condition)')
  assert.equal(Bridge.controlPackageExportsListAgents(devControlDir), false, 'probe says no legacy mount on the 0.2.2+ dev closure')
  console.log(`PASS probe on the pinned dev closure (${devManifest.version}): ./list-agents absent → no legacy mount`)

  // The floor tower, when its published closure is present locally: the map
  // still defines ./list-agents there, and the probe must say so.
  const rc2ControlDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.tmp/dsh-type-closure-rc2/node_modules/@deepseek-ai/dsh-tool-subagent-control')
  if (existsSync(join(rc2ControlDir, 'package.json'))) {
    const rc2Manifest = JSON.parse(readFileSync(join(rc2ControlDir, 'package.json'), 'utf8'))
    assert.match(String(rc2Manifest.version), /^0\.2\.0/, 'the rc2 closure carries the floor-generation control package')
    assert.notEqual(rc2Manifest.exports?.['./list-agents'], undefined, 'the floor exports map still defines ./list-agents')
    assert.equal(Bridge.controlPackageExportsListAgents(rc2ControlDir), true, 'probe says mount the legacy sub-entry on the floor tower')
    console.log(`PASS probe on the rc2 closure (${rc2Manifest.version}): ./list-agents present → legacy mount`)
  } else {
    console.log('SKIP probe on the rc2 closure (not installed locally; the host-matrix fixture covers the old-tower probe)')
  }
}

// Probe edge shapes: a manifest without an exports map at all, and one whose
// map lacks the subpath, both read as "no legacy mount"; a map with the key
// (any value shape) reads as "mount".
{
  const work = mkdtempSync(join(tmpdir(), 'dsh-legacy-list-agents-probe-'))
  try {
    const noMap = join(work, 'no-map')
    const withoutKey = join(work, 'without-key')
    const withKey = join(work, 'with-key')
    for (const dir of [noMap, withoutKey, withKey]) mkdirSync(dir)
    writeFileSync(join(noMap, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }))
    writeFileSync(join(withoutKey, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', exports: { '.': './index.js' } }))
    writeFileSync(join(withKey, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', exports: { './list-agents': './list-agents.js' } }))
    assert.equal(Bridge.controlPackageExportsListAgents(noMap), false, 'no exports map → no legacy mount')
    assert.equal(Bridge.controlPackageExportsListAgents(withoutKey), false, 'exports map without the subpath → no legacy mount')
    assert.equal(Bridge.controlPackageExportsListAgents(withKey), true, 'exports map with the subpath → legacy mount')
    console.log('PASS probe edge shapes: mapless, keyless, and keyed manifests')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// The 0.2.2+ apply path against the real pinned closure: the bridge completes
// as a deliberate no-op — no import of the removed subpath (the dev closure
// would throw ERR_PACKAGE_PATH_NOT_EXPORTED if the probe misfired), nothing
// registered.
{
  const registered = []
  const ctx = { tools: { register: (tool) => registered.push(tool) } }
  await Bridge.apply(ctx)
  assert.equal(registered.length, 0, 'on a 0.2.2+ host the main control entry registers list_agents itself; the bridge mounts nothing')
  console.log('PASS apply on the 0.2.2+ dev closure: no-op, no removed-subpath import, no registration')
}
