// Unit verification for the bundled default-roster seeding (one-time copy
// of templates/agents into the agents dir) — no LLM, no cordis context.
// Run: node test/seed-defaults.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { bundledAgentsTemplatesDir, seedBundledAgents } from '../lib/seed-defaults.js'

/** A fresh empty agents dir per test, cleaned up by the caller. */
const makeTempDir = (label) => mkdtempSync(join(tmpdir(), `seed-defaults-${label}-`))

// --- fresh install: an empty agents dir receives the full default roster ---

{
  const dir = makeTempDir('fresh')
  try {
    const { seeded, errors } = seedBundledAgents(dir)
    assert.equal(errors.length, 0, 'no broken bundled templates')
    assert.equal(seeded, 3, 'all three defaults seeded')
    for (const name of ['workhorse', 'oldfox', 'rubber-duck']) {
      const path = join(dir, `${name}.md`)
      assert.ok(existsSync(path), `${name}.md written (frontmatter name, not source basename guessing)`)
      const parsed = parseAgentMarkdown(readFileSync(path, 'utf8'), path)
      assert.ok(parsed.ok, `${name}.md parses`)
      assert.equal(parsed.agent.meta.name, name, `${name}.md frontmatter name matches file name`)
    }
    // Byte-for-byte copy of the shipped template.
    const source = readFileSync(join(bundledAgentsTemplatesDir(), 'workhorse.md'))
    assert.ok(source.equals(readFileSync(join(dir, 'workhorse.md'))), 'template copied verbatim')
    console.log('PASS fresh install: 3 defaults seeded verbatim')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- one-time: rerun is a no-op, and deletions stay deleted ---

{
  const dir = makeTempDir('rerun')
  try {
    seedBundledAgents(dir)
    rmSync(join(dir, 'oldfox.md'))
    const second = seedBundledAgents(dir)
    assert.equal(second.seeded, 0, 'rerun after seeding seeds nothing')
    assert.ok(!existsSync(join(dir, 'oldfox.md')), 'deleted default stays deleted')
    const third = seedBundledAgents(dir)
    assert.equal(third.seeded, 0, 'still nothing after a deleted file')
    console.log('PASS one-time: reruns no-op, deletions permanent')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- user-owned dir: existing agents block seeding entirely ---

{
  const dir = makeTempDir('owned')
  try {
    const userFile = join(dir, 'mine.md')
    writeFileSync(userFile, '---\nname: mine\n---\nMy own agent.')
    const { seeded } = seedBundledAgents(dir)
    assert.equal(seeded, 0, 'no defaults seeded into a dir that already has agents')
    assert.ok(!existsSync(join(dir, 'workhorse.md')), 'defaults not mixed in')
    // Edits to a seeded file survive a rerun (the dir is non-empty by then).
    seedBundledAgents(dir)
    writeFileSync(userFile, '---\nname: mine\n---\nEdited by me.')
    const second = seedBundledAgents(dir)
    assert.equal(second.seeded, 0, 'rerun still a no-op')
    assert.ok(readFileSync(userFile, 'utf8').includes('Edited by me.'), 'user edit never overwritten')
    console.log('PASS user-owned: existing agents and edits untouched')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- custom source dir: broken templates skipped + reported, name rewrite applies ---

{
  const dir = makeTempDir('broken')
  const source = makeTempDir('src')
  try {
    writeFileSync(join(source, 'good.md'), '---\nname: renamed\n---\nBody.')
    writeFileSync(join(source, 'bad.md'), 'no frontmatter here')
    const { seeded, errors } = seedBundledAgents(dir, source)
    assert.equal(seeded, 1, 'only the parseable template seeded')
    assert.equal(errors.length, 1, 'broken template reported')
    assert.equal(errors[0].file, 'bad.md', 'error names the broken file')
    assert.ok(existsSync(join(dir, 'renamed.md')), 'written under frontmatter name')
    assert.ok(!existsSync(join(dir, 'good.md')), 'source basename not used')
    assert.ok(!existsSync(join(dir, 'bad.md')), 'broken template not seeded')
    console.log('PASS broken source: skipped + reported, name rewrite applied')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(source, { recursive: true, force: true })
  }
}

// --- missing source dir: clean no-op, never throws ---

{
  const dir = makeTempDir('nosrc')
  try {
    const { seeded, errors } = seedBundledAgents(dir, join(dir, 'does-not-exist'))
    assert.equal(seeded, 0, 'nothing seeded from a missing source')
    assert.equal(errors.length, 0, 'missing source is not an error')
    console.log('PASS missing source: clean no-op')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll assertions passed.')
