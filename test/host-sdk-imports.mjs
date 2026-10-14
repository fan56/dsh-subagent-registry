// Load the plugin and every SDK service from one real published host closure.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const closure = resolve(process.env.DSH_TEST_CLOSURE_DIR ?? '')
assert(process.env.DSH_TEST_CLOSURE_DIR, 'Set DSH_TEST_CLOSURE_DIR to a host node_modules directory')
const expected = process.env.DSH_TEST_HOST_VERSION
assert(expected, 'Set DSH_TEST_HOST_VERSION to the exact SDK version being tested')
for (const name of ['dsh', 'dsh-agent', 'dsh-agent-loop', 'dsh-subagent', 'dsh-tools', 'dsh-system-prompt', 'dsh-scope', 'dsh-session-query']) {
  const metadata = JSON.parse(readFileSync(join(closure, '@deepseek-ai', name, 'package.json'), 'utf8'))
  assert.equal(metadata.version, expected, `${name} must come from the requested host version`)
}
const parentURL = pathToFileURL(join(dirname(closure), 'package.json')).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier, specifier.startsWith('@deepseek-ai/') ? { ...context, parentURL } : context)
  },
})
console.log(`Host SDK: ${expected} — verified published service versions from ${closure}`)
