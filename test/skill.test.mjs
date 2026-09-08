// Anti-drift tests for the bundled usage/config skill: the packaged
// skills/dsh-subagent-registry/SKILL.md must be served through
// ctx.skills.registerProvider with a routing description that matches the
// frontmatter byte for byte (the description is the model's routing surface —
// drift between it and the packaged body misroutes skill discovery).
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
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(match, 'SKILL.md must open with a YAML frontmatter block')
  const line = match[1]
    .split('\n')
    .find((entry) => entry.startsWith(`${key}:`))
  assert.ok(line, `frontmatter must declare "${key}"`)
  return line.slice(key.length + 1).trim().replace(/^"(.*)"$/s, '$1')
}

test('plugin metadata: name and inject expose the skills dependency', () => {
  assert.equal(name, 'dsh-subagent-registry')
  assert.ok(inject.includes('skills'), 'inject must declare the skills service')
})

test('apply registers the bundled skill provider on ctx.skills', async () => {
  const ctx = mockCtx()
  apply(ctx, {
    agentsDir: AGENTS_DIR,
    provider: 'spawn',
    toolName: 'use_agent',
    askToolName: 'ask_agent',
  })
  assert.equal(ctx.registered.length, 1)
  const provider = ctx.registered[0]
  assert.equal(provider.name, 'dsh-subagent-registry')

  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.equal(candidate.name, 'dsh-subagent-registry')
  assert.equal(candidate.provider, 'dsh-subagent-registry')
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
    candidate.resourceBase.path.replace(/\/$/, '').endsWith('skills/dsh-subagent-registry'),
    `unexpected resourceBase path: ${candidate.resourceBase.path}`,
  )
})

test('provider.get loads the packaged SKILL.md with matching metadata', async () => {
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
  assert.equal(definition.name, 'dsh-subagent-registry')
  assert.equal(definition.description, candidate.description)
  // SkillDefinition.content is the instruction body after metadata removal:
  // the bundled get() must strip the raw frontmatter the file keeps for the
  // GitHub/manual install paths (same shape the filesystem provider serves).
  assert.ok(!definition.content.startsWith('---'), 'get() must not serve the frontmatter block')
  assert.ok(
    definition.content.includes('# dsh-subagent-registry 使用指南'),
    'body must be the packaged skill markdown',
  )

  // Anti-drift: the hardcoded routing description must equal the SKILL.md
  // frontmatter, and the frontmatter itself must satisfy the registry grammar.
  const markdown = await readFile(
    new URL('../skills/dsh-subagent-registry/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.equal(frontmatterValue(markdown, 'name'), 'dsh-subagent-registry')
  assert.equal(frontmatterValue(markdown, 'description'), candidate.description)
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
