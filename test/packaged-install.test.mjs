// Regression for #2: the published tarball must be npm-installable. The
// postinstall hook references scripts/link-dsh-closure.mjs, so scripts/ has
// to ship — and the linker's repo guard must stand down inside a consumer
// tree (the guard markers, tsconfig.json and .git, must therefore never
// ship). Runs the reporter's exact failing step: `npm install` of the packed
// tarball, lifecycle scripts included.
// Run: node test/packaged-install.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  // 1. Pack from the repo the way CI's release job does.
  const packed = JSON.parse(
    execFileSync(npm, [...npmArgs, 'pack', '--json', '--pack-destination', scratch], {
      cwd: repoRoot,
      encoding: 'utf8',
    }),
  )[0]
  const tarball = join(scratch, packed.filename)

  // 2. Tarball contents: the postinstall target ships; the guard markers do not.
  const contents = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split(/\r?\n/)
  assert.ok(
    contents.includes('package/scripts/link-dsh-closure.mjs'),
    'postinstall target scripts/link-dsh-closure.mjs is in the tarball (#2)',
  )
  assert.ok(!contents.some((f) => f.startsWith('package/tsconfig.json')), 'tsconfig.json never ships (linker guard marker)')
  assert.ok(!contents.some((f) => f.includes('/.git')), '.git never ships (linker guard marker)')

  // 3. The reporter's exact failing step: a plain npm install of the tarball,
  //    postinstall included. Must exit 0 — MODULE_NOT_FOUND here is #2 again.
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
