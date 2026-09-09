// Unit verification for the `maxRounds` frontmatter key and the
// readAgentMaxRounds label→cap lookup — no LLM, no cordis context.
// Run: node test/agent-caps.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { readAgentMaxRounds } from '../lib/agent-caps.js'

const MD = (extra, name = 'workhorse') => `---
name: ${name}
description: "demo agent"
model: opencode-go/deepseek-v4-flash
${extra}---
You are the body of the agent.`

// --- Every valid positive integer parses into meta.maxRounds ---

for (const [raw, want] of [['20', 20], ['1', 1], ['999999', 999999]]) {
  const parsed = parseAgentMarkdown(MD(`maxRounds: ${raw}\n`), '/fake/workhorse.md')
  assert.equal(parsed.ok, true, `maxRounds=${raw}: parse ok`)
  assert.equal(parsed.agent.meta.maxRounds, want, `maxRounds=${raw}: stored as number`)
  console.log(`PASS maxRounds=${raw} -> meta.maxRounds=${parsed.agent.meta.maxRounds}`)
}

// --- Absent or empty key keeps meta.maxRounds undefined (global cap applies) ---

{
  const absent = parseAgentMarkdown(MD(''), '/fake/workhorse.md')
  assert.equal(absent.ok, true)
  assert.equal(absent.agent.meta.maxRounds, undefined, 'no key: undefined')
  const empty = parseAgentMarkdown(MD('maxRounds:\n'), '/fake/workhorse.md')
  assert.equal(empty.ok, true)
  assert.equal(empty.agent.meta.maxRounds, undefined, 'empty value: undefined')
  console.log('PASS absent/empty maxRounds -> undefined')
}

// --- Invalid values mark the file broken, loudly (fail-loud like thinking) ---

for (const bad of ['0', '-3', '6o', 'true', '2.5', 'abc']) {
  const parsed = parseAgentMarkdown(MD(`maxRounds: ${bad}\n`), '/fake/workhorse.md')
  assert.equal(parsed.ok, false, `maxRounds=${bad}: parse rejected`)
  assert.match(parsed.error, /maxRounds/, 'error names the offending field')
  assert.match(parsed.error, new RegExp(bad.replaceAll('.', '\\.')), 'error quotes the original value')
  console.log(`PASS maxRounds=${JSON.stringify(bad)} broken:`, JSON.stringify(parsed.error))
}

// --- Quoted values parse (loose frontmatter shape) ---

{
  const parsed = parseAgentMarkdown(MD('maxRounds: "45"\n'), '/fake/workhorse.md')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.agent.meta.maxRounds, 45)
  console.log('PASS quoted maxRounds -> 45')
}

// --- readAgentMaxRounds: label→cap lookup over a real temp dir ---

const dir = join(mkdtempSync(join(tmpdir(), 'agent-caps-')), 'agents')
mkdirSync(dir, { recursive: true })
const writeAgent = (name, extra) => writeFileSync(join(dir, `${name}.md`), MD(extra, name))
try {
  writeAgent('workhorse', 'maxRounds: 60\n')
  writeAgent('oldfox', 'display_name: 老法师\nmaxRounds: 15\n')
  writeAgent('rubber-duck', '') // no per-agent cap

  // Exact name hit returns the frontmatter cap.
  assert.equal(readAgentMaxRounds('workhorse', dir), 60)
  console.log('PASS exact name hit -> 60')

  // Unique display-name hit resolves to the same file's cap.
  assert.equal(readAgentMaxRounds('老法师', dir), 15)
  console.log('PASS unique display_name hit -> 15')

  // Agent without the key resolves to undefined (global cap), not an error.
  assert.equal(readAgentMaxRounds('rubber-duck', dir), undefined)
  console.log('PASS agent without maxRounds -> undefined (global applies)')

  // Unknown label -> undefined.
  assert.equal(readAgentMaxRounds('nobody', dir), undefined)
  console.log('PASS unknown label -> undefined')

  // Whitespace-tolerant on the label.
  assert.equal(readAgentMaxRounds('  workhorse  ', dir), 60)
  console.log('PASS whitespace-padded label -> 60')

  // Ambiguous display name -> undefined (a wrong-agent cap is worse than global).
  writeAgent('oldfox2', 'display_name: 老法师\nmaxRounds: 3\n')
  assert.equal(readAgentMaxRounds('老法师', dir), undefined)
  console.log('PASS ambiguous display_name -> undefined')

  // Name beats display name: a file whose NAME collides with another's DISPLAY
  // name resolves by exact name first.
  writeAgent('ghost', 'display_name: workhorse\nmaxRounds: 9\n')
  assert.equal(readAgentMaxRounds('workhorse', dir), 60, 'exact name wins over display name')
  console.log('PASS exact name precedence -> 60')

  // Missing dir -> undefined (never throws).
  assert.equal(readAgentMaxRounds('workhorse', join(dir, 'missing')), undefined)
  console.log('PASS missing dir -> undefined')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('agent-caps.test.mjs: all green')
