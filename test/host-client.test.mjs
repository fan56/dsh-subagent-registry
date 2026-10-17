// Actual published ModuleLoader materializes the exact delivered factory; no browser/renderer claim.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration) } }
const globals = { window: { __ModuleLoader__: target } }
const modulesUrl = import.meta.resolve('@deepseek-ai/dsh-client-modules/client')
const modulesMetadata = JSON.parse(readFileSync(new URL('./package.json', new URL('../', modulesUrl)), 'utf8'))
assert.equal(modulesMetadata.version, process.env.DSH_TEST_HOST_VERSION)
runInNewContext(readFileSync(new URL(modulesUrl), 'utf8'), globals)
const bootstrap = target.pendingQueue.shift()
const exports = bootstrap.factory(() => { throw new Error('unexpected modules bootstrap dependency') })
runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), globals)
assert.equal(target.pendingQueue.length, 1)
assert.equal(target.pendingQueue[0].id, metadata.name)
const system = exports.createClientModuleSystem(target, { id: bootstrap.id, exports }, {
  boot: { rev: 'fixture', entries: [{ id: metadata.name, url: '/client.js', rev: 'fixture', ...metadata.dsh.client }], batches: [{ phase: 'application', url: '/client.js', rev: 'fixture', entries: [metadata.name] }] },
  staticModules: { react: React, 'react/jsx-runtime': jsx, '@deepseek-ai/dsh-client-ui-primitives': { Button: 'FixtureButton', Input: 'FixtureInput', Modal: 'FixtureModal' } },
  loadBundle() { throw new Error('preloaded factory must not require another transport') },
})
const plugin = await system.import(metadata.name)
assert.equal(typeof plugin.apply, 'function')
assert.deepEqual(Array.from(plugin.inject), ['slots', 'layout', 'connection', 'remote', 'remote.session'])
assert.equal(await system.import(metadata.name), plugin, 'materialization is memoized')
const edges = system.loadCache.get(metadata.name).edges
assert(edges.has('react') && edges.has('react/jsx-runtime') && edges.has('@deepseek-ai/dsh-client-ui-primitives'))
assert.equal(system.importError(metadata.name), undefined)
console.log(`host-client: PASS — exact compiled factory via real ModuleLoader ${modulesMetadata.version}; host singleton edges; no GUI renderer`)
