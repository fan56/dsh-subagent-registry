// Regression for #2: the published tarball must be npm-installable. The dev
// install hook (now `prepare`) references scripts/link-dsh-closure.mjs, so
// scripts/ has to ship — and the linker's repo guard must stand down inside a
// consumer tree (the guard markers, tsconfig.json and .git, must therefore
// never ship). Runs the reporter's exact failing step: `npm install` of the
// packed tarball, lifecycle scripts included. Since #10 the tarball carries no
// install hook at all (pnpm 11 gates those), which is asserted below.
// Run: node test/packaged-install.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
// Windows needs cmd.exe to launch npm's .cmd shim; keep paths as separate arguments.
const npm = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd'] : []

if (!existsSync(join(repoRoot, 'lib', 'index.js'))) {
  throw new Error('lib/index.js missing — run `npm run build` before the test chain')
}

const scratch = mkdtempSync(join(tmpdir(), 'registry packaged install-'))
try {
  // 1. Pack from the repo the way CI's release job does. Read the tarball
  //    name off the filesystem instead of parsing stdout: npm 10 still runs
  //    the root `prepare` hook under `--ignore-scripts`, so its log line
  //    ("[link-dsh-closure] linked …") lands in `--json` output and breaks
  //    JSON.parse. A dedicated empty directory makes the pack output
  //    unambiguous on every npm version.
  const packDir = join(scratch, 'pack')
  mkdirSync(packDir)
  execFileSync(npm, [...npmArgs, 'pack', '--pack-destination', packDir], { cwd: repoRoot, encoding: 'utf8' })
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))
  assert.equal(tarballs.length, 1, `pack emitted exactly one tarball, got ${tarballs.join(', ') || 'none'}`)
  const tarball = join(packDir, tarballs[0])

  // 2. Tarball contents: the install-hook target ships; the guard markers do
  //    not; and the manifest carries no install hook at all (#10).
  const contents = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split(/\r?\n/)
  assert.ok(
    contents.includes('package/scripts/link-dsh-closure.mjs'),
    'install-hook target scripts/link-dsh-closure.mjs is in the tarball (#2)',
  )
  assert.ok(!contents.some((f) => f.startsWith('package/tsconfig.json')), 'tsconfig.json never ships (linker guard marker)')
  assert.ok(!contents.some((f) => f.includes('/.git')), '.git never ships (linker guard marker)')
  const manifest = JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }))
  for (const key of ['preinstall', 'install', 'postinstall']) {
    assert.ok(!Object.hasOwn(manifest.scripts, key), `tarball manifest carries no ${key} script (#10)`)
  }

  // 3. The reporter's exact failing step: a plain npm install of the tarball,
  //    lifecycle hooks enabled. Must exit 0 — MODULE_NOT_FOUND here is #2 again.
  const consumer = join(scratch, 'consumer')
  execFileSync(npm, [...npmArgs, 'install', tarball, '--prefix', consumer, '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: scratch,
    encoding: 'utf8',
    // A failed guard must reach realpathSync and fail, even on machines without dsh.
    env: { ...process.env, DSH_CLOSURE_DIR: join(scratch, 'missing-closure') },
  })
  const installed = join(consumer, 'node_modules', '@aiwayds', 'dsh-subagent-registry')
  assert.ok(existsSync(join(installed, 'scripts', 'link-dsh-closure.mjs')), 'installed package carries the hook target')

  // 4. Consumer safety: the linker must have stood down — no @deepseek-ai
  //    scope dir materialized inside the consumer's package tree.
  assert.ok(
    !existsSync(join(installed, 'node_modules', '@deepseek-ai')),
    'linker did not touch the consumer tree (guard markers held)',
  )
  assert.ok(
    !existsSync(join(consumer, 'node_modules', '@deepseek-ai')),
    'optional host SDK peers did not install a consumer-side copy',
  )
  console.log('packaged-install: tarball installs cleanly, linker stands down, no consumer SDK copy')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
