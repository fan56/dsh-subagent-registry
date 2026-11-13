// Regression for #10: pnpm 11 (strictDepBuilds) refuses an install whose
// dependency carries an unapproved preinstall/install/postinstall script, so
// the dsh host plugin manager rolls the 0.20.0 update back with
// ERR_PNPM_IGNORED_BUILDS. The fix moves the repo's dev closure linking from
// `postinstall` to `prepare` — never executed for registry dependencies — so
// the published package carries no install hook. This test reproduces the
// upgrade path: install the published 0.20.0 baseline, then upgrade it to the
// locally packed tarball and assert the new package has no install hook, still
// ships its bundle patch and entry, and still leaves the consumer tree alone.
// Run: node test/packaged-upgrade.test.mjs  (after `npm run build`; needs
// network access to registry.npmjs.org for the 0.20.0 baseline)
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
// Windows needs cmd.exe to launch npm's .cmd shim; keep paths as separate arguments.
const npm = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd'] : []
const pkgName = '@aiwayds/dsh-subagent-registry'
const registry = 'https://registry.npmjs.org'
const installHooks = ['preinstall', 'install', 'postinstall']

if (!existsSync(join(repoRoot, 'lib', 'index.js'))) {
  throw new Error('lib/index.js missing — run `npm run build` before the test chain')
}

const scratch = mkdtempSync(join(tmpdir(), 'registry packaged upgrade-'))
try {
  const consumer = join(scratch, 'consumer')
  const installedDir = join(consumer, 'node_modules', '@aiwayds', 'dsh-subagent-registry')
  const installedManifest = () => JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8'))
  // Same reason as packaged-install: a failed guard must reach realpathSync
  // and fail, even on machines without dsh.
  const env = { ...process.env, DSH_CLOSURE_DIR: join(scratch, 'missing-closure') }

  // 1. Baseline: the published 0.20.0, the last release that still carried the
  //    postinstall hook. Pinned to the official registry so a dev mirror does
  //    not decide the fixture; 0.20.0 is immutable, so this cannot drift.
  const baseline = spawnSync(
    npm,
    [...npmArgs, 'install', `${pkgName}@0.20.0`, '--prefix', consumer, '--no-audit', '--no-fund', '--loglevel=error', `--registry=${registry}`],
    { cwd: scratch, encoding: 'utf8', env },
  )
  assert.equal(baseline.status, 0, `baseline 0.20.0 install failed:\n${baseline.stdout}\n${baseline.stderr}`)
  const base = installedManifest()
  assert.equal(base.version, '0.20.0', 'baseline fixture is 0.20.0')
  assert.equal(typeof base.scripts.postinstall, 'string', 'baseline 0.20.0 carries the postinstall hook (fixture)')

  // 2. Pack the repo the way CI's release job does. The tarball name comes
  //    from the filesystem, not stdout: npm 10 still runs the root `prepare`
  //    hook under `--ignore-scripts`, so its log line corrupts `--json`
  //    output. A dedicated empty directory keeps the result unambiguous.
  const packDir = join(scratch, 'pack')
  mkdirSync(packDir)
  execFileSync(npm, [...npmArgs, 'pack', '--pack-destination', packDir], { cwd: repoRoot, encoding: 'utf8' })
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))
  assert.equal(tarballs.length, 1, `pack emitted exactly one tarball, got ${tarballs.join(', ') || 'none'}`)
  const tarball = join(packDir, tarballs[0])

  // 3. Tarball manifest: the install-hook gate set is empty. `prepare` is
  //    carried in package.json but npm/pnpm never run it for registry
  //    dependencies — the published package has no lifecycle step to gate.
  const tarManifest = JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }))
  assert.equal(tarManifest.version, '0.20.1', 'packed version is 0.20.1')
  for (const key of installHooks) {
    assert.ok(!Object.hasOwn(tarManifest.scripts, key), `tarball manifest carries no ${key} script (#10)`)
  }
  assert.equal(tarManifest.scripts.prepare, 'node scripts/link-dsh-closure.mjs', 'dev closure linking rides the prepare hook')
  assert.equal(tarManifest.dsh.bundle.patch, './cordis.patch.yml', 'bundle patch still declared')

  // 4. Upgrade in place: the plugin manager's exact step. Must exit 0 and
  //    must not produce a pnpm-11 unapproved-build report (the regression
  //    class this test pins).
  const upgrade = spawnSync(
    npm,
    [...npmArgs, 'install', tarball, '--prefix', consumer, '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: scratch, encoding: 'utf8', env },
  )
  const output = `${upgrade.stdout ?? ''}\n${upgrade.stderr ?? ''}`
  assert.equal(upgrade.status, 0, `upgrade to the packed 0.20.1 failed:\n${output}`)
  assert.ok(
    !/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/i.test(output),
    `upgrade output carries a pnpm-11 unapproved-build report:\n${output}`,
  )

  const upgraded = installedManifest()
  assert.equal(upgraded.version, '0.20.1', 'upgrade landed 0.20.1')
  for (const key of installHooks) {
    assert.ok(!Object.hasOwn(upgraded.scripts, key), `installed manifest carries no ${key} script (#10)`)
  }
  assert.ok(existsSync(join(installedDir, 'cordis.patch.yml')), 'bundle patch ships')
  assert.ok(existsSync(join(installedDir, 'lib', 'index.js')), 'plugin entry ships')

  // 5. Consumer safety unchanged: the linker did not touch the consumer tree,
  //    and no optional host SDK peer materialized a second copy.
  assert.ok(
    !existsSync(join(installedDir, 'node_modules', '@deepseek-ai')),
    'linker did not touch the consumer tree (guard markers held)',
  )
  assert.ok(
    !existsSync(join(consumer, 'node_modules', '@deepseek-ai')),
    'optional host SDK peers did not install a consumer-side copy',
  )
  console.log('packaged-upgrade: 0.20.0 → packed 0.20.1 upgrades cleanly with no install hook')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
