// Verify the delivered archive, including every compiled file and optional SDK peer.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const source = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
const archive = resolve(cwd, '../../.tmp', `aiwayds-dsh-subagent-registry-${source.version}.tgz`)
const directory = mkdtempSync(join(tmpdir(), 'registry-package-'))
try {
  const extraction = spawnSync('tar', ['-xf', archive, '-C', directory], { stdio: 'inherit' })
  assert.ifError(extraction.error)
  assert.equal(extraction.status, 0)
  const packedRoot = join(directory, 'package')
  assert.deepEqual(JSON.parse(readFileSync(join(packedRoot, 'package.json'), 'utf8')), source)
  for (const name of Object.keys(source.peerDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))) {
    assert.equal(source.peerDependencies[name], '>=0.2.0-rc.2 || >=0.2.1-alpha.2', `${name} must retain both prerelease lines`)
    assert.equal(source.peerDependenciesMeta[name]?.optional, true, `${name} must use the host SDK`)
    assert.equal(source.dependencies?.[name], undefined, `${name} must not install a consumer-side copy`)
  }
  for (const name of readdirSync(join(cwd, 'lib'))) {
    assert.deepEqual(readFileSync(join(packedRoot, 'lib', name)), readFileSync(join(cwd, 'lib', name)), `${name} archive differs from the checked build`)
  }
  console.log(`package-compat: PASS — ${source.version}, both optional peer lines, exact compiled archive contents`)
} finally {
  assert(directory.startsWith(join(tmpdir(), 'registry-package-')))
  rmSync(directory, { recursive: true, force: true })
}
