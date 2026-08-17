// Unit verification for the `display_name` frontmatter key and the roster/child
// label semantics it feeds — no LLM, no cordis context.
// Run: node test/display-name.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { buildStartRequest } from '../lib/tool-run-agent.js'

// --- parseAgentMarkdown: display_name is parsed loosely and never clobbers `name` ---

{
  const md = `---
name: duck
description: "demo agent"
display_name: 鸭鸭
---
You are the body.`
  const parsed = parseAgentMarkdown(md, '/fake/duck.md')
  assert.equal(parsed.ok, true, 'parse ok with unquoted Chinese display_name')
  const { meta, body } = parsed.agent
  assert.equal(meta.name, 'duck', 'name preserved (display_name does not overwrite name)')
  assert.equal(meta.displayName, '鸭鸭', 'unquoted Chinese display_name parsed')
  assert.ok(body.startsWith('You are the body'), 'body kept')
  console.log(`PASS parse: name=${meta.name} displayName=${JSON.stringify(meta.displayName)}`)
}

{
  // No display_name at all: key stays absent (undefined), name only.
  const md = `---
name: duck
---
Body.`
  const parsed = parseAgentMarkdown(md, '/fake/duck.md')
  assert.equal(parsed.ok, true, 'parse ok without display_name')
  assert.equal(parsed.agent.meta.displayName, undefined, 'displayName undefined when absent')
  assert.equal(parsed.agent.meta.name, 'duck', 'name still parsed')
  console.log('PASS parse no display_name: displayName=', parsed.agent.meta.displayName)
}

// --- buildStartRequest: the running child's label uses displayName, else agentName ---

/** A fake delegating parent whose session header carries the delegation depth. */
const parentAtDepth = (depth) => ({ options: {}, session: { header: { delegationDepth: depth } } })
const base = { prompt: 'do the thing', parent: parentAtDepth(1), persona: 'body', deep: 1, toolName: 'use_agent' }

{
  const request = buildStartRequest({ ...base, agentName: 'duck', displayName: '鸭鸭' })
  assert.equal(request.label, '鸭鸭', 'label = displayName when displayName present')
  console.log('PASS buildStartRequest label=displayName:', JSON.stringify(request.label))
}

{
  const request = buildStartRequest({ ...base, agentName: 'duck' })
  assert.equal(request.label, 'duck', 'label = agentName when no displayName')
  console.log('PASS buildStartRequest label=agentName:', JSON.stringify(request.label))
}

console.log('\nAll assertions passed.')
