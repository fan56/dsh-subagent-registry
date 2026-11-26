// One isolated, published SDK closure; subprocesses never share host modules.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const fixtures = process.argv.slice(2).length ? process.argv.slice(2) : ['host-activation', 'host-lifecycle']
// The closure is a real npm install of `@deepseek-ai/dsh@<version>` with its
// @deepseek-ai deps pinned to that version (see the hosts CI job). Never
// synthesize a closure by hand: host-sdk-imports.mjs verifies the published
// service versions before any fixture is allowed to run.
// Only the latest RC is supported; the older host matrix is retired from CI
// (the runtime compatibility branches in src/ remain intact).
for (const [version, variable, directory] of [
  ['0.2.2-rc.5', 'DSH_TEST_022RC5_CLOSURE_DIR', 'dsh-type-closure-022rc5'],
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
console.log('host-matrix: PASS — the compiled plugin on the one supported host (0.2.2-rc.5)')
