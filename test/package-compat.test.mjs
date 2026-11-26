// Offline peer-contract check: read THIS repo's package.json directly, with no
// archive path and no hardcoded range strings. The assertions are semantic —
// node-semver decides which versions the published host closure admits.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
const peers = pkg.peerDependencies ?? {}
const peerMeta = pkg.peerDependenciesMeta ?? {}
const dependencies = pkg.dependencies ?? {}
const devDependencies = pkg.devDependencies ?? {}

const dshPeers = Object.keys(peers).filter(name => name.startsWith('@deepseek-ai/dsh-'))
assert.equal(dshPeers.length, 15, 'all 15 published DSH peers must be declared')

// Only the newest RC is supported. The range must admit rc.5 and reject the
// previous rc, the alpha line and the next minor — under BOTH default
// node-semver semantics and includePrerelease (no prerelease escape hatch
// may widen the declared support matrix).
const admitted = '0.2.2-rc.5'
const rejected = ['0.2.2-rc.4', '0.2.3-alpha.2', '0.3.0']
const semantics = [
  ['default', {}],
  ['includePrerelease', { includePrerelease: true }],
]
for (const name of dshPeers) {
  assert(semver.validRange(peers[name]), `${name} must declare a valid semver range`)
  for (const [label, options] of semantics) {
    assert(semver.satisfies(admitted, peers[name], options), `${name} must admit ${admitted} with ${label} semantics`)
    for (const version of rejected) {
      assert(!semver.satisfies(version, peers[name], options), `${name} must reject ${version} with ${label} semantics`)
    }
  }
}

// schemastery is pinned to the 3.19 line only; 3.18.5 is out of support.
const schemastery = '@deepseek-ai/schemastery'
for (const [label, options] of semantics) {
  assert(semver.satisfies('3.19.0', peers[schemastery], options), `schemastery peer must admit 3.19.0 with ${label} semantics`)
  assert(!semver.satisfies('3.18.5', peers[schemastery], options), `schemastery peer must reject 3.18.5 with ${label} semantics`)
}

// Every pinned devDependency that has a peer must agree with that peer, with
// default semantics (no includePrerelease escape hatch).
for (const [name, range] of Object.entries(peers)) {
  const pinned = devDependencies[name]
  if (pinned === undefined) continue
  assert(semver.satisfies(pinned, range), `devDependency ${name}@${pinned} must satisfy peer ${range}`)
  assert(semver.satisfies(pinned, range, { includePrerelease: true }), `devDependency ${name}@${pinned} must satisfy peer ${range} with includePrerelease`)
  if (name.startsWith('@deepseek-ai/dsh-')) {
    assert.equal(pinned, admitted, `${name} devDependency must be pinned to ${admitted}`)
  }
}
assert.equal(devDependencies[schemastery], '3.19.0', 'schemastery devDependency must stay on 3.19.0')

// Host-owned packages stay peer-only; the host closure supplies exactly one
// copy. All peers are optional so npm/pnpm never materialize a second one.
assert.equal(dependencies[schemastery], undefined, 'schemastery must not be a direct dependency')
for (const name of Object.keys(peers)) {
  assert.equal(peerMeta[name]?.optional, true, `${name} must be an optional peer`)
}

console.log(`package-compat: PASS — ${pkg.version}, 15 DSH peers admit only ${admitted} (reject rc.4 / 0.2.3-alpha.2 / 0.3.0), schemastery admits 3.19.0 only, devDeps agree, all peers optional`)
