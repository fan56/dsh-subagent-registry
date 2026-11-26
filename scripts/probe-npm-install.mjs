#!/usr/bin/env node
// Real npm consumer probe: npm pack this repo into a scratch directory OUTSIDE
// the repo tree, then install that tarball together with the real host in a
// fresh consumer using npm's DEFAULT peer resolution — no --legacy-peer-deps,
// no --force, no overrides, no .npmrc. This proves the optional-peer contract
// for actual npm users: no ERESOLVE / unmet / invalid peer warning, one host
// closure at the requested version, and no consumer-side @deepseek-ai copy.
//
// Exit codes: 0 = pass, 1 = compatibility failure, 2 = network/registry failure.
// The two classes print distinct banners so a registry outage is never
// mistaken for a peer-range regression. Scratch is kept on failure.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const ownName = pkg.name
const dshPeers = Object.keys(pkg.peerDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/dsh-'))
const hostVersion = '0.2.2-rc.5'
const schemastery = '@deepseek-ai/schemastery'
const registry = 'https://registry.npmjs.org'
// Windows needs cmd.exe to launch npm's .cmd shim; keep paths as separate arguments.
const npm = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd'] : []

const work = mkdtempSync(path.join(tmpdir(), 'dsh-subagent-registry-npm-probe-'))
const packDir = path.join(work, 'pack')
const consumer = path.join(work, 'consumer')
mkdirSync(packDir, { recursive: true })
mkdirSync(consumer, { recursive: true })

function fail(message, output = '', network = false) {
  const label = network ? 'NETWORK FAILURE' : 'COMPAT FAILURE'
  console.error(`probe-npm-install: ${label} — ${message}`)
  if (output) console.error(output.split('\n').slice(0, 40).join('\n'))
  console.error(`probe-npm-install: scratch kept at ${work}`)
  process.exit(network ? 2 : 1)
}

// Network preflight — an unreachable or wrong registry must never be reported
// as a peer incompatibility by the install step below.
const preflight = spawnSync(npm, [...npmArgs, 'view', `@deepseek-ai/dsh@${hostVersion}`, 'version', '--registry', registry], { cwd: work, encoding: 'utf8' })
if (preflight.error || preflight.status !== 0) {
  fail(`cannot reach ${registry} for @deepseek-ai/dsh@${hostVersion}`, `${preflight.stdout}\n${preflight.stderr}`, true)
}
if (preflight.stdout.trim() !== hostVersion) {
  fail(`registry returned ${preflight.stdout.trim()} instead of ${hostVersion}`, preflight.stdout, true)
}

// Run npm pack from the scratch cwd so no tarball or npm state lands in the
// repo, and no repo-local .npmrc can decide what the probe resolves.
const pack = spawnSync(npm, [...npmArgs, 'pack', repoRoot, '--pack-destination', packDir, '--registry', registry], { cwd: work, encoding: 'utf8' })
if (pack.error || pack.status !== 0) fail('npm pack failed', `${pack.stdout}\n${pack.stderr}`)
const tarballs = readdirSync(packDir).filter(name => name.endsWith('.tgz'))
if (tarballs.length !== 1) fail(`expected exactly one tarball, found ${tarballs.length}: ${tarballs.join(', ')}`)
const tarball = path.join(packDir, tarballs[0])

// Minimal consumer: the host, the tarball, and the one host package that
// dsh@0.2.2-rc.5's published closure omits (verified against the real registry
// install — dsh-client-ui-primitives is published but is not a dependency of
// any shipped bundle). The plugin declares it as an OPTIONAL peer, so npm
// skips it; declaring it at the exact host version here is the smallest
// host-side layout that lets the 15-peer assertion be meaningful. It does not
// mask a peer conflict: npm still resolves every other peer under DEFAULT
// mode, and the added package comes from the same published wave.
const hostClosureGap = '@deepseek-ai/dsh-client-ui-primitives'
const consumerDependencies = {
  '@deepseek-ai/dsh': hostVersion,
  [hostClosureGap]: hostVersion,
  [ownName]: `file:${tarball}`,
}
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
  name: 'dsh-subagent-registry-npm-probe',
  private: true,
  dependencies: consumerDependencies,
}, null, 2) + '\n')

const install = spawnSync(npm, [...npmArgs, 'install', '--registry', registry, '--no-audit', '--no-fund'], { cwd: consumer, encoding: 'utf8' })
const installOutput = `${install.stdout ?? ''}\n${install.stderr ?? ''}`
if (install.error) fail('npm install could not start', String(install.error))
if (install.status !== 0) {
  const networkMarker = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_SOCKET_TIMEOUT|ECONNABORTED/i.test(installOutput)
  fail(`npm install exited ${install.status}`, installOutput, networkMarker)
}
const peerWarning = /(?:ERESOLVE|unmet peer|invalid peer|peer dep missing|incorrect peer dependency)/i.exec(installOutput)
if (peerWarning) fail(`npm install reported a peer problem: ${peerWarning[0]}`, installOutput)

const nodeModules = path.join(consumer, 'node_modules')
function installedVersion(name) {
  const file = path.join(nodeModules, name, 'package.json')
  if (!existsSync(file)) fail(`installed package missing: ${name}`)
  return JSON.parse(readFileSync(file, 'utf8')).version
}
if (installedVersion(ownName) !== pkg.version) fail(`installed ${ownName} is not ${pkg.version}`)
for (const name of dshPeers) {
  const version = installedVersion(name)
  if (version !== hostVersion) fail(`${name} resolved to ${version}, expected ${hostVersion} from the host closure`)
}
if (installedVersion(schemastery) !== '3.19.0') fail(`${schemastery} must resolve to the host's 3.19.0`)

// Walk the whole consumer tree: the only @deepseek-ai scope dir allowed is the
// top-level one. Any nested scope dir is a consumer-side copy shadowing the
// host, and a second schemastery is the exact duplicate-cordis failure mode.
const nestedScopeDirs = []
const schemasteryCopies = []
function walk(currentNodeModules, depth) {
  if (!existsSync(currentNodeModules)) return
  const scope = path.join(currentNodeModules, '@deepseek-ai')
  if (depth > 0 && existsSync(scope)) nestedScopeDirs.push(scope)
  const schemaFile = path.join(scope, 'schemastery', 'package.json')
  if (existsSync(schemaFile)) schemasteryCopies.push(schemaFile)
  for (const entry of readdirSync(currentNodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name === '@deepseek-ai') continue
    const location = path.join(currentNodeModules, entry.name)
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(location, { withFileTypes: true })) {
        if (scoped.isDirectory()) walk(path.join(location, scoped.name, 'node_modules'), depth + 1)
      }
    } else {
      walk(path.join(location, 'node_modules'), depth + 1)
    }
  }
}
walk(nodeModules, 0)
if (existsSync(path.join(nodeModules, ownName, 'node_modules', '@deepseek-ai'))) {
  fail('the closure linker materialized a @deepseek-ai copy inside the installed plugin')
}
if (nestedScopeDirs.length > 0) fail(`nested @deepseek-ai copies under the consumer: ${nestedScopeDirs.join(', ')}`)
if (schemasteryCopies.length !== 1) fail(`expected exactly one schemastery copy, found ${schemasteryCopies.length}: ${schemasteryCopies.join(', ')}`)

console.log(`probe-npm-install: PASS — ${ownName}@${pkg.version} + @deepseek-ai/dsh@${hostVersion} installed by default npm; ${dshPeers.length} DSH peers at ${hostVersion}, one schemastery@3.19.0, no nested @deepseek-ai copies`)
rmSync(work, { recursive: true, force: true })
