/**
 * One-time seeding of the bundled default agent roster into the agents
 * directory. A fresh install starts with a usable roster (workhorse /
 * oldfox / rubber-duck) instead of an empty `use_agent` tool.
 *
 * Semantics (mirrors the legacy-layout migration in ./agents-dir.ts): the
 * seed runs only while the target directory holds NO agents — the first
 * non-empty state, however it came about (user files, restored backups),
 * marks the directory as user-owned. Consequences: an existing file is
 * never overwritten, and a deleted default stays deleted. Reruns are
 * no-ops.
 *
 * @module seed-defaults
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listAgentFiles, parseAgentMarkdown } from './agents-dir.ts'

/**
 * The package-shipped default roster (`<package root>/templates/agents`),
 * resolved relative to the compiled file so it works from any cwd. The
 * `templates` directory ships in the npm `files` list.
 */
export function bundledAgentsTemplatesDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'agents')
}

/**
 * Copy every parseable bundled template into `targetDir` (under the
 * template's frontmatter `name`, keeping the file byte-for-byte). One-time:
 * when `targetDir` already holds agents nothing is written. Broken
 * templates are reported and skipped rather than seeded. Synchronous and
 * cheap (a handful of small files) so `apply` can run it before the
 * `use_agent` tool builds its roster.
 */
export function seedBundledAgents(
  targetDir: string,
  sourceDir: string = bundledAgentsTemplatesDir(),
): { seeded: number; errors: Array<{ file: string; error: string }> } {
  mkdirSync(targetDir, { recursive: true })
  const { agents } = listAgentFiles(targetDir)
  if (agents.length > 0) return { seeded: 0, errors: [] }
  if (!existsSync(sourceDir)) return { seeded: 0, errors: [] }
  let seeded = 0
  const errors: Array<{ file: string; error: string }> = []
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const sourcePath = join(sourceDir, entry.name)
    const parsed = parseAgentMarkdown(readFileSync(sourcePath, 'utf8'), sourcePath)
    if (!parsed.ok) {
      errors.push({ file: entry.name, error: parsed.error })
      continue
    }
    writeFileSync(join(targetDir, `${parsed.agent.meta.name}.md`), readFileSync(sourcePath))
    seeded++
  }
  return { seeded, errors }
}
