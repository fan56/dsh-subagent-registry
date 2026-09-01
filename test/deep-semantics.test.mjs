// Unit verification for the `deep` field semantics — no LLM, no cordis context.
// Run: node test/deep-semantics.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { buildStartRequest, SPAWN_TOOL_NAMES } from '../lib/tool-run-agent.js'

const MD = (extra) => `---
name: workhorse
description: "demo agent"
model: opencode-go/deepseek-v4-flash
${extra}---
You are the body of the agent.
Line two.`

const CASES = [
  { label: 'deep=0 (leaf)', md: MD('deep: 0\n'), expectedDeep: 0 },
  { label: 'deep=1 (explicit)', md: MD('deep: 1\n'), expectedDeep: 1 },
  { label: 'no deep key (default 1)', md: MD(''), expectedDeep: 1 },
]

/** A fake delegating parent whose session header carries the delegation depth. */
const parentAtDepth = (depth) => ({ options: {}, session: { header: { delegationDepth: depth }, requestHeader: () => undefined } })

for (const { label, md, expectedDeep } of CASES) {
  const parsed = parseAgentMarkdown(md, '/fake/workhorse.md')
  assert.equal(parsed.ok, true, `${label}: parse ok`)
  const { meta, body } = parsed.agent
  assert.equal(meta.deep, expectedDeep, `${label}: parsed deep`)
  assert.ok(body.startsWith('You are the body'), `${label}: body kept`)

  const parent = parentAtDepth(1) // child absolute depth = 1 + 1 = 2
  const childDepth = 2
  const request = buildStartRequest({
    agentName: 'workhorse',
    prompt: 'do the thing',
    parent,
    persona: body,
    deep: meta.deep,
    toolName: 'use_agent',
    model: meta.model,
  })

  if (meta.deep === 0) {
    // Leaf: toolFilter present and includes the three mandated spawn tools;
    // maxDepth is NOT passed (never 0), so the start can never be depth-blocked.
    assert.ok(request.toolFilter, `${label}: toolFilter present`)
    const deny = [...request.toolFilter.deny]
    for (const name of ['subagent', 'subagent_fork', 'use_agent']) {
      assert.ok(deny.includes(name), `${label}: deny includes ${name}`)
    }
    assert.equal(request.maxDepth, undefined, `${label}: maxDepth omitted`)
    console.log(`PASS ${label}: deny=${JSON.stringify(deny)} maxDepth=${request.maxDepth}`)
  } else {
    // deep >= 1: no toolFilter; maxDepth is a relative budget >= child depth,
    // so the child's own start can never be rejected by the depth check.
    assert.equal(request.toolFilter, undefined, `${label}: no toolFilter`)
    assert.ok(
      request.maxDepth >= childDepth,
      `${label}: maxDepth ${request.maxDepth} >= child depth ${childDepth}`,
    )
    console.log(`PASS ${label}: maxDepth=${request.maxDepth} (child depth ${childDepth}) toolFilter=${request.toolFilter}`)
  }

  // persona is always the md body verbatim, whatever the deep value.
  assert.equal(request.persona, body, `${label}: persona === body`)
}

// A customized plugin tool name must be denied on leaves (the restrict()
// validation in the in-process driver throws on unknown names, so the deny
// list must match the name actually registered).
{
  const md = MD('deep: 0\n')
  const req = buildStartRequest({
    agentName: 'leaf', prompt: 'p', parent: parentAtDepth(0),
    persona: 'b', deep: 0, toolName: 'my_agent',
  })
  assert.ok(req.toolFilter.deny.includes('my_agent'), 'custom toolName denied')
  assert.ok(!req.toolFilter.deny.includes('use_agent'), 'default name absent once customized')
  console.log('PASS custom toolName swapped into deny:', JSON.stringify(req.toolFilter.deny))
}

// deep=2 raises the relative budget by two generations.
{
  const md = MD('deep: 2\n')
  const req = buildStartRequest({
    agentName: 'x', prompt: 'p', parent: parentAtDepth(3), // child depth 4
    persona: 'b', deep: 2, toolName: 'use_agent',
  })
  assert.equal(req.maxDepth, 6, 'deep=2 at parent depth 3 -> maxDepth 4 + 2 = 6')
  console.log('PASS deep=2 budget: maxDepth=', req.maxDepth)
}

// An explicit leafDenyTools replaces the computed default entirely.
{
  const md = MD('deep: 0\n')
  const req = buildStartRequest({
    agentName: 'leaf', prompt: 'p', parent: parentAtDepth(0),
    persona: 'b', deep: 0, toolName: 'use_agent',
    leafDenyTools: ['subagent'],
  })
  assert.deepEqual([...req.toolFilter.deny], ['subagent'])
  console.log('PASS leafDenyTools override:', JSON.stringify(req.toolFilter.deny))
}

// The default list is exactly SPAWN_TOOL_NAMES + the tool name.
{
  const req = buildStartRequest({
    agentName: 'leaf', prompt: 'p', parent: parentAtDepth(0),
    persona: 'b', deep: 0, toolName: 'use_agent',
  })
  assert.deepEqual([...req.toolFilter.deny], [...SPAWN_TOOL_NAMES, 'use_agent'])
  console.log('PASS default deny === SPAWN_TOOL_NAMES + toolName')
}

console.log('\nAll assertions passed.')