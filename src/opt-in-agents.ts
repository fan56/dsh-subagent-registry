/**
 * Opt-in agent templates: the two agent definitions shipped OUTSIDE the
 * seed roster (`templates/opt-in-agents/<language>/`, separate from
 * `templates/agents/` which only the first-install seeding scans).
 *
 * These are never seeded automatically — a fresh install still starts with
 * exactly workhorse / oldfox / rubber-duck. The `/subagents` command (or a
 * manual copy) installs one into the configured agents dir:
 *
 * - `ptc-subagent` — the batch decision-work specialist; selecting it in the
 *   wizard also flips `ptcEnabled: true` so the codemode tool registers.
 * - `minimal-subagent` — the terminal-only executor; no config linkage.
 *
 * Installation is a one-time copy per agent: an existing `<agentsDir>/<name>.md`
 * is NEVER overwritten, and uninstalling/downgrading never deletes one —
 * once copied, the file belongs to the user (the same ownership rule the
 * seed roster follows).
 *
 * @module opt-in-agents
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Language } from './preset-contract.ts'
import { parseAgentMarkdown } from './agents-dir.ts'

/** The opt-in agent ids shipped under templates/opt-in-agents/. */
export const OPT_IN_AGENT_IDS = ['ptc-subagent', 'minimal-subagent'] as const
export type OptInAgentId = (typeof OPT_IN_AGENT_IDS)[number]

/**
 * The package-shipped opt-in template dir for one language
 * (`<package root>/templates/opt-in-agents/<language>`), resolved relative to
 * the compiled file so it works from any cwd. The `templates` directory ships
 * in the npm `files` list, so the opt-in subdirectory rides every install.
 */
export function optInTemplatesDir(language: Language = 'zh'): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'opt-in-agents', language)
}

/**
 * Absolute template path for one opt-in agent, falling back to the English
 * edition when the configured language has no file for it (a translation may
 * lag a release; the agent itself is language-neutral).
 */
export function optInTemplatePath(id: OptInAgentId, language: Language = 'zh'): string {
  const localized = join(optInTemplatesDir(language), `${id}.md`)
  if (existsSync(localized)) return localized
  return join(optInTemplatesDir('en'), `${id}.md`)
}

/** Outcome of one install attempt. */
export type OptInInstallResult =
  | { kind: 'installed'; path: string }
  | { kind: 'already-present'; path: string }
  | { kind: 'error'; path: string; message: string }

/**
 * Install one opt-in agent into `targetDir` (under the template's frontmatter
 * `name`, keeping the bytes verbatim). Idempotent and user-owning: an
 * existing `<targetDir>/<name>.md` is never overwritten — the function
 * reports `already-present` and leaves the user's file alone. A broken or
 * missing template is an `error` result, never a thrown exception (the
 * command keeps installing the rest and reports the failures).
 */
export function installOptInAgent(
  targetDir: string,
  id: OptInAgentId,
  language: Language = 'zh',
): OptInInstallResult {
  const sourcePath = optInTemplatePath(id, language)
  let name: string
  try {
    const parsed = parseAgentMarkdown(readFileSync(sourcePath, 'utf8'), sourcePath)
    if (!parsed.ok) {
      return { kind: 'error', path: sourcePath, message: parsed.error }
    }
    name = parsed.agent.meta.name
  } catch (error) {
    return { kind: 'error', path: sourcePath, message: error instanceof Error ? error.message : String(error) }
  }
  const targetPath = join(targetDir, `${name}.md`)
  if (existsSync(targetPath)) {
    return { kind: 'already-present', path: targetPath }
  }
  try {
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(targetPath, readFileSync(sourcePath))
    return { kind: 'installed', path: targetPath }
  } catch (error) {
    return { kind: 'error', path: targetPath, message: error instanceof Error ? error.message : String(error) }
  }
}
