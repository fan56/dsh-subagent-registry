// Real published pre-0.2.2 closures: the list_agents mount bridge (issue #8)
// must import the legacy `./list-agents` sub-entry from the actual closure
// and land exactly one `list_agents` registration — the behavior the codemode
// preset's delegation group relied on before 0.2.2 moved discovery into the
// control package's main entry.
// Run through the matrix: npm run test:hosts -- host-legacy-list-agents
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as Bridge from '../lib/legacy-list-agents.js'

const closure = resolve(process.env.DSH_TEST_CLOSURE_DIR ?? '')
assert.ok(process.env.DSH_TEST_HOST_VERSION, 'host fixture: run through test/host-sdk-imports.mjs (npm run test:hosts)')

// The tower under test still exports the legacy subpath — the bridge must
// take the legacy mount branch against its real manifest.
const controlDir = join(closure, '@deepseek-ai', 'dsh-tool-subagent-control')
const manifest = JSON.parse(readFileSync(join(controlDir, 'package.json'), 'utf8'))
assert.equal(Bridge.controlPackageExportsListAgents(controlDir), true,
  `${manifest.version} exports ./list-agents (pre-0.2.2 tower)`)

// The registration itself, through the real sub-entry resolved from this
// closure (host-sdk-imports.mjs redirects @deepseek-ai/* here).
const registered = []
const ctx = { tools: { register: (tool) => registered.push(tool) } }
await Bridge.apply(ctx)
assert.equal(registered.length, 1, `exactly one list_agents registration on ${manifest.version}`)
assert.equal(registered[0]?.name, 'list_agents', 'the registered tool is list_agents')

console.log(`legacy-list-agents bridge: PASS on ${process.env.DSH_TEST_HOST_VERSION} (${manifest.version}) — list_agents registered once through the real sub-entry`)
