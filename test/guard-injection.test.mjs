// Reverse-injection verification: the guard must be LOAD-BEARING. On a
// temporary copy, first prove the three rejection suites are green, then
// neuter `assertTopLevelCaller` and prove every one of them turns red.
// No LLM, no real host, no change to the working tree.
// Run: node test/guard-injection.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Three suites that assert nested / unverifiable callers are refused.
const REJECTION_SUITES = [
  'caller-guard.test.mjs',
  'resume.test.mjs',
  'host-activation.test.mjs',
]
const GUARD_HEADER = 'export function assertTopLevelCaller(exec) {'
const NEUTERED = `${GUARD_HEADER}\n    return; // INJECTED: guard disabled — rejection suites must turn red`

const scratch = mkdtempSync(join(tmpdir(), 'registry-guard-injection-'))
const run = (name) => {
  const file = join(scratch, 'test', name)
  try {
    return {
      ok: true,
      output: execFileSync(process.execPath, [file], {
        cwd: scratch, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
      }),
    }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}\n${error.stderr ?? ''}` }
  }
}

try {
  // Temporary copy: lib under test, its sources for the static guard test,
  // the three suites, and the host packages resolved through a symlink.
  cpSync(join(ROOT, 'lib'), join(scratch, 'lib'), { recursive: true })
  cpSync(join(ROOT, 'src'), join(scratch, 'src'), { recursive: true })
  copyFileSync(join(ROOT, 'package.json'), join(scratch, 'package.json'))
  mkdirSync(join(scratch, 'test'))
  for (const name of REJECTION_SUITES) copyFileSync(join(ROOT, 'test', name), join(scratch, 'test', name))
  symlinkSync(join(ROOT, 'node_modules'), join(scratch, 'node_modules'), 'dir')

  // Control: on the untouched copy all three suites must be green.
  for (const name of REJECTION_SUITES) {
    const result = run(name)
    assert.equal(result.ok, true, `${name}: green before injection\n${result.output}`)
  }
  console.log('PASS control: all three rejection suites are green on the unmodified copy')

  // Inject: neuter the guard so every caller is admitted. No other file changes.
  const guardFile = join(scratch, 'lib', 'caller-guard.js')
  const source = readFileSync(guardFile, 'utf8')
  assert.equal(source.includes(GUARD_HEADER), true, 'compiled guard header found for injection')
  writeFileSync(guardFile, source.replace(GUARD_HEADER, NEUTERED))

  for (const name of REJECTION_SUITES) {
    const result = run(name)
    assert.equal(result.ok, false, `${name}: MUST turn red once the guard is removed`)
    assert.match(result.output, /AssertionError|assert\.rejects|stable error code|refused|guard/i,
      `${name}: failure is a guard assertion, not an environment error\n${result.output}`)
    console.log(`PASS injected: ${name} turns red`)
  }
  console.log('\nReverse injection PASS: all three rejection suites are guard-dependent.')
} finally {
  // Unlink the node_modules symlink before recursive removal so the real
  // dependency tree is never traversed.
  try { rmSync(join(scratch, 'node_modules'), { force: true }) } catch {}
  rmSync(scratch, { recursive: true, force: true })
}
