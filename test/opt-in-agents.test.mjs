// Opt-in agent templates: the templates/opt-in-agents/<language>/ tree (kept
// separate from templates/agents/, which only the first-install seeding
// scans), the install semantics (one-time copy, never overwrite, never
// delete), and the seeder's non-interaction with the opt-in directory.
// Run: node test/opt-in-agents.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentMarkdown } from '../lib/agents-dir.js'
import { bundledAgentsTemplatesDir, seedBundledAgents } from '../lib/seed-defaults.js'
import {
  installOptInAgent,
  optInTemplatesDir,
  optInTemplatePath,
  OPT_IN_AGENT_IDS,
} from '../lib/opt-in-agents.js'

const LANGUAGES = ['en', 'zh', 'ru']
const IDS = [...OPT_IN_AGENT_IDS]

// --- the template tree: every language × id exists, parses, name matches ---

{
  for (const language of LANGUAGES) {
    const dir = optInTemplatesDir(language)
    assert.ok(
      dir.replaceAll('\\', '/').endsWith(`templates/opt-in-agents/${language}`),
      `opt-in templates dir follows the language (${dir})`,
    )
    for (const id of IDS) {
      const path = join(dir, `${id}.md`)
      assert.ok(existsSync(path), `${language}/${id}.md shipped`)
      const parsed = parseAgentMarkdown(readFileSync(path, 'utf8'), path)
      assert.ok(parsed.ok, `${language}/${id}.md parses with the registry parser (${parsed.ok ? '' : parsed.error})`)
      assert.equal(parsed.agent.meta.name, id, `${language}/${id}.md frontmatter name matches the opt-in id`)
    }
  }
  // English minimal-subagent keeps the mini repo's exactly-4-frontmatter-keys shape.
  const minimal = readFileSync(optInTemplatePath('minimal-subagent', 'en'), 'utf8')
  const frontmatter = minimal.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  const keys = frontmatter.split('\n').map((line) => line.split(':')[0].trim()).filter(Boolean)
  assert.deepEqual(keys.sort(), ['deep', 'description', 'display_name', 'name'],
    'minimal-subagent frontmatter stays exactly the 4 keys (name/display_name/deep/description)')
  // The seeder's source dir is the seed tree, NOT the opt-in tree.
  assert.ok(
    !bundledAgentsTemplatesDir().replaceAll('\\', '/').includes('opt-in-agents'),
    'seed-defaults scans templates/agents, never the opt-in tree',
  )
  console.log('PASS template tree: 3 languages × 2 ids, all parse, names match')
}

// --- install: one-time copy under the frontmatter name ---

{
  const dir = mkdtempSync(join(tmpdir(), 'opt-in-install-'))
  try {
    const first = installOptInAgent(dir, 'minimal-subagent', 'en')
    assert.equal(first.kind, 'installed')
    assert.ok(existsSync(join(dir, 'minimal-subagent.md')), 'written under the frontmatter name')
    const source = readFileSync(optInTemplatePath('minimal-subagent', 'en'))
    assert.ok(source.equals(readFileSync(join(dir, 'minimal-subagent.md'))), 'template copied verbatim')

    // Idempotent: a rerun reports already-present and never overwrites.
    writeFileSync(join(dir, 'minimal-subagent.md'), '---\nname: minimal-subagent\n---\nEdited by me.')
    const second = installOptInAgent(dir, 'minimal-subagent', 'en')
    assert.equal(second.kind, 'already-present', 'rerun is a no-op')
    assert.ok(
      readFileSync(join(dir, 'minimal-subagent.md'), 'utf8').includes('Edited by me.'),
      'a user-edited installed file is never overwritten',
    )
    console.log('PASS install: verbatim copy, idempotent rerun, user edits kept')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- unchecking never deletes: the module has no delete path at all ---

{
  const dir = mkdtempSync(join(tmpdir(), 'opt-in-nodelete-'))
  try {
    installOptInAgent(dir, 'ptc-subagent', 'en')
    // The exported surface carries no removal: reinstall (the closest thing
    // to an "unselect" action) still keeps the file.
    installOptInAgent(dir, 'ptc-subagent', 'en')
    assert.ok(existsSync(join(dir, 'ptc-subagent.md')), 'no delete path: the file survives every action')
    console.log('PASS no delete path: installed files survive')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- the first-install seeding never touches the opt-in roster ---

{
  const dir = mkdtempSync(join(tmpdir(), 'opt-in-seed-'))
  try {
    const { seeded } = seedBundledAgents(dir)
    assert.equal(seeded, 3, 'seed roster stays the three defaults')
    for (const id of IDS) {
      assert.ok(!existsSync(join(dir, `${id}.md`)), `seeding does not install the opt-in ${id}`)
    }
    console.log('PASS seeding stays three defaults; opt-in agents never auto-seed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- broken target dir: install reports an error result, never throws ---

{
  const dir = mkdtempSync(join(tmpdir(), 'opt-in-bad-'))
  const blocked = join(dir, 'file.md')
  writeFileSync(blocked, 'not a dir')
  try {
    const result = installOptInAgent(blocked, 'minimal-subagent', 'en')
    assert.equal(result.kind, 'error', 'an unwritable target reports an error result')
    assert.ok(result.message.length > 0, 'the error carries a message')
    console.log('PASS unwritable target: structured error, no throw')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nAll opt-in-agents assertions passed.')
