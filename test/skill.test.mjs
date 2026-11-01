// Anti-drift tests for the bundled usage/config skill: the packaged
// skills/dsh-subagent-registry-config/SKILL.md (plus its per-language
// SKILL.en.md / SKILL.ru.md bodies) must be served through
// ctx.skills.registerProvider with a routing description that matches the
// matching frontmatter byte for byte (the description is the model's routing
// surface — drift between it and the packaged body misroutes skill discovery),
// each within the 500-char budget, and each following the configured
// `language` entry-config key.
// Run: node test/skill.test.mjs  (after `pnpm build`)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { apply, inject, name, stripFrontmatter } from '../lib/index.js'

// Minimal cordis-like context: the bundled-skill registration path needs
// ctx.skills; the apply() body also touches the subagents/tools seams, so
// they stay no-op doubles with no provider present (apply() then takes the
// deferred path and merely arms a listener — no tool registration here).
function mockCtx() {
  const registered = []
  const ctx = {
    registered,
    effect() {},
    inject() {},
    get() {
      return undefined
    },
    on() {
      return () => {}
    },
    subagents: {
      getProvider() {
        return undefined
      },
    },
    tools: {
      register() {},
    },
    skills: {
      registerProvider(create) {
        const provider = create({
          signal: new AbortController().signal,
          invalidate() {},
        })
        registered.push(provider)
        return () => {}
      },
    },
  }
  return ctx
}

/** A throwaway agents dir: apply() runs the one-time seeding into it. */
const AGENTS_DIR = mkdtempSync(join(tmpdir(), 'registry-skill-'))

/** Extract one scalar value from the SKILL.md YAML frontmatter. */
function frontmatterValue(markdown, key) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  assert.ok(match, 'SKILL.md must open with a YAML frontmatter block')
  const line = match[1]
    .split('\n')
    .find((entry) => entry.startsWith(`${key}:`))
  assert.ok(line, `frontmatter must declare "${key}"`)
  return line.slice(key.length + 1).trim().replace(/^"(.*)"$/s, '$1')
}

/** Path of the packaged skill body for one language (zh keeps the plain name). */
function skillBodyUrl(language) {
  const file = language === 'zh' ? 'SKILL.md' : `SKILL.${language}.md`
  return new URL(`../skills/dsh-subagent-registry-config/${file}`, import.meta.url)
}

/** Marker heading served as SkillDefinition.content for one language. */
const BODY_MARKERS = {
  zh: '# dsh-subagent-registry 使用指南',
  en: '# dsh-subagent-registry guide',
  ru: '# Руководство по dsh-subagent-registry',
}

/** Register the provider for one language and return { provider, candidate }. */
async function providerFor(language) {
  const ctx = mockCtx()
  apply(ctx, {
    agentsDir: AGENTS_DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
    language,
  })
  assert.equal(ctx.registered.length, 1)
  const provider = ctx.registered[0]
  const [candidate] = await provider.list({})
  return { provider, candidate }
}

test('plugin metadata: name and inject expose the skills dependency', () => {
  assert.equal(name, 'dsh-subagent-registry')
  assert.ok(inject.includes('skills'), 'inject must declare the skills service')
})

test('apply registers the bundled skill provider on ctx.skills', async () => {
  // Default (no language key): zh.
  const ctx = mockCtx()
  apply(ctx, {
    agentsDir: AGENTS_DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
  })
  assert.equal(ctx.registered.length, 1)
  const provider = ctx.registered[0]
  assert.equal(provider.name, 'dsh-subagent-registry-config')

  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.equal(candidate.name, 'dsh-subagent-registry-config')
  assert.equal(candidate.provider, 'dsh-subagent-registry-config')
  assert.equal(candidate.source, 'bundled')
  assert.equal(typeof candidate.rank, 'number')
  assert.ok(Number.isFinite(candidate.rank))
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
  assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.ok(candidate.description.length > 0)
  assert.ok(candidate.description.length <= 500, 'description must stay within the 500-char routing budget')
  // The directory resource base must point at the packaged skills/ directory
  // (fileURLToPath keeps the trailing slash of the URL path).
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.ok(
    candidate.resourceBase.path.replaceAll('\\', '/').replace(/\/$/, '').endsWith('skills/dsh-subagent-registry-config'),
    `unexpected resourceBase path: ${candidate.resourceBase.path}`,
  )
})

test('provider.get loads the packaged SKILL.md with matching metadata (zh default)', async () => {
  const ctx = mockCtx()
  apply(ctx, {
    agentsDir: AGENTS_DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
  })
  const provider = ctx.registered[0]
  const [candidate] = await provider.list({})

  const definition = await provider.get(candidate, {})
  assert.equal(definition.name, 'dsh-subagent-registry-config')
  assert.equal(definition.description, candidate.description)
  // SkillDefinition.content is the instruction body after metadata removal:
  // the bundled get() must strip the raw frontmatter the file keeps for the
  // GitHub/manual install paths (same shape the filesystem provider serves).
  assert.ok(!definition.content.startsWith('---'), 'get() must not serve the frontmatter block')
  assert.ok(
    definition.content.includes(BODY_MARKERS.zh),
    'body must be the packaged skill markdown',
  )

  // Anti-drift: the hardcoded routing description must equal the SKILL.md
  // frontmatter, and the frontmatter itself must satisfy the registry grammar.
  const markdown = await readFile(skillBodyUrl('zh'), 'utf8')
  assert.equal(frontmatterValue(markdown, 'name'), 'dsh-subagent-registry-config')
  assert.equal(frontmatterValue(markdown, 'description'), candidate.description)
})

// Per-language anti-drift: each language's routing description (as served by
// the provider built for that language) equals the frontmatter description of
// the matching SKILL.<lang>.md byte for byte, stays within the 500-char
// budget, and the served body is the matching file.
for (const language of ['zh', 'en', 'ru']) {
  test(`language "${language}": description matches frontmatter, within budget, body follows language`, async () => {
    const { provider, candidate } = await providerFor(language)

    const markdown = await readFile(skillBodyUrl(language), 'utf8')
    assert.equal(frontmatterValue(markdown, 'name'), 'dsh-subagent-registry-config')
    assert.equal(frontmatterValue(markdown, 'description'), candidate.description)
    assert.ok(candidate.description.length > 0)
    assert.ok(
      candidate.description.length <= 500,
      `"${language}" description must stay within the 500-char routing budget`,
    )

    const definition = await provider.get(candidate, {})
    assert.equal(definition.description, candidate.description)
    assert.ok(!definition.content.startsWith('---'), 'get() must not serve the frontmatter block')
    assert.ok(
      definition.content.includes(BODY_MARKERS[language]),
      `body must be the ${language} skill file`,
    )
    // The language-switching section ships in every language's body.
    assert.ok(definition.content.includes('language'), 'body must document the language key')
  })
}

// Distinct languages must serve distinct descriptions and bodies (guards
// against the map collapsing back to a single-language constant).
test('languages zh/en/ru serve distinct descriptions and bodies', async () => {
  const zh = await providerFor('zh')
  const en = await providerFor('en')
  const ru = await providerFor('ru')
  const descriptions = new Set([zh.candidate.description, en.candidate.description, ru.candidate.description])
  assert.equal(descriptions.size, 3, 'each language has its own routing description')
  const bodies = new Set([
    (await zh.provider.get(zh.candidate, {})).content,
    (await en.provider.get(en.candidate, {})).content,
    (await ru.provider.get(ru.candidate, {})).content,
  ])
  assert.equal(bodies.size, 3, 'each language serves its own body')
})

test('stripFrontmatter tolerates missing or unclosed frontmatter', () => {
  // No frontmatter: returned unchanged.
  assert.equal(stripFrontmatter('plain body\n'), 'plain body\n')
  assert.equal(stripFrontmatter(''), '')
  // A `---` fence that never closes is not frontmatter: returned unchanged.
  assert.equal(stripFrontmatter('---\nname: x'), '---\nname: x')
  assert.equal(stripFrontmatter('---'), '---')
  // A closed block is stripped down to the trimmed instruction body.
  assert.equal(stripFrontmatter('---\nname: x\n---\n\n# Body\n'), '# Body')
  // CRLF line endings are tolerated on both fence lines.
  assert.equal(stripFrontmatter('---\r\nname: x\r\n---\r\n\r\n# Body\r\n'), '# Body')
})

after(() => {
  rmSync(AGENTS_DIR, { recursive: true, force: true })
})
