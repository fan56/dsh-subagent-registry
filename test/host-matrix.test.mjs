// Two isolated, published SDK closures; subprocesses never share host modules.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const fixtures = process.argv.slice(2).length ? process.argv.slice(2) : ['host-activation', 'host-lifecycle']
for (const [version, variable, directory] of [
  ['0.2.0-rc.2', 'DSH_TEST_RC2_CLOSURE_DIR', 'dsh-type-closure-rc2'],
  ['0.2.1-alpha.2', 'DSH_TEST_ALPHA2_CLOSURE_DIR', 'dsh-type-closure'],
]) {
  for (const fixture of fixtures) {
    const result = spawnSync(process.execPath, ['--import', './test/host-sdk-imports.mjs', `./test/${fixture}.test.mjs`], {
      cwd, stdio: 'inherit', timeout: 60_000,
      env: {
        ...process.env,
        DSH_TEST_HOST_VERSION: version,
        DSH_TEST_CLOSURE_DIR: process.env[variable] ?? resolve(cwd, '../../.tmp', directory, 'node_modules'),
      },
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, `real host ${version}: ${fixture} must pass`)
  }
}
console.log('host-matrix: PASS — the same compiled plugin on both supported hosts')
