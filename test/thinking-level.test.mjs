// Unit verification for the `thinking` frontmatter key whitelist — no LLM,
// no cordis context.
// Run: node test/thinking-level.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { THINKING_LEVELS, listAgentFiles, parseAgentMarkdown } from '../lib/agents-dir.js'

const MD = (extra, name = 'workhorse') => `---
name: ${name}
description: "demo agent"
model: opencode-go/deepseek-v4-flash
${extra}---
You are the body of the agent.`

// --- Every whitelisted level parses ok and lands in meta.thinking verbatim ---

for (const level of THINKING_LEVELS) {
  const parsed = parseAgentMarkdown(MD(`thinking: ${level}\n`), '/fake/workhorse.md')
  assert.equal(parsed.ok, true, `thinking=${level}: parse ok`)
  assert.equal(parsed.agent.meta.thinking, level, `thinking=${level}: stored verbatim`)
  console.log(`PASS thinking=${level} -> meta.thinking=${JSON.stringify(parsed.agent.meta.thinking)}`)
}

// --- An unknown non-empty value marks the whole file broken, loudly ---

{
  const parsed = parseAgentMarkdown(MD('thinking: typo\n'), '/fake/workhorse.md')
  assert.equal(parsed.ok, false, 'thinking=typo: parse rejected')
  assert.match(parsed.error, /thinking/, 'error names the offending field')
  assert.match(parsed.error, /typo/, 'error quotes the original value')
  console.log('PASS thinking=typo broken:', JSON.stringify(parsed.error))
}

// --- Absent or empty thinking keeps meta.thinking undefined (unchanged) ---

{
  const absent = parseAgentMarkdown(MD(''), '/fake/workhorse.md')
  assert.equal(absent.ok, true, 'no thinking key: parse ok')
  assert.equal(absent.agent.meta.thinking, undefined, 'absent -> meta.thinking undefined')

  const quotedEmpty = parseAgentMarkdown(MD('thinking: ""\n'), '/fake/workhorse.md')
  assert.equal(quotedEmpty.ok, true, 'empty quoted thinking: parse ok')
  assert.equal(quotedEmpty.agent.meta.thinking, undefined, 'empty string -> meta.thinking undefined')

  const bareKey = parseAgentMarkdown(MD('thinking:\n'), '/fake/workhorse.md')
  assert.equal(bareKey.ok, true, 'bare thinking key: parse ok')
  assert.equal(bareKey.agent.meta.thinking, undefined, 'bare key -> meta.thinking undefined')

  console.log(
    'PASS absent/empty thinking:',
    absent.agent.meta.thinking,
    quotedEmpty.agent.meta.thinking,
    bareKey.agent.meta.thinking,
  )
}

// --- listAgentFiles routes a bad-thinking file into the broken list ---

{
  const dir = mkdtempSync(join(tmpdir(), 'agents-thinking-'))
  try {
    writeFileSync(join(dir, 'good.md'), MD('thinking: max\n', 'good'))
    writeFileSync(join(dir, 'bad.md'), MD('thinking: typo\n', 'bad'))
    const { agents, broken } = listAgentFiles(dir)
    assert.deepEqual(agents.map((a) => a.meta.name), ['good'], 'only the valid file registers')
    assert.equal(agents[0].meta.thinking, 'max', 'valid file keeps its level')
    assert.equal(broken.length, 1, 'exactly one broken entry')
    assert.ok(broken[0].path.endsWith('bad.md'), 'broken entry points at the bad file')
    assert.match(broken[0].error, /thinking/, 'broken reason names the field')
    assert.match(broken[0].error, /typo/, 'broken reason quotes the value')
    console.log('PASS listAgentFiles broken:', JSON.stringify(broken[0]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll assertions passed.')
