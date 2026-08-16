/**
 * Agent definitions as markdown files — one file per agent, mirroring the
 * dsh "one file per agent" convention.
 *
 * An agent is `<agents-dir>/<name>.md` with a `---` frontmatter block and a
 * markdown body that doubles as the agent's system prompt:
 *
 *   ---
 *   name: workhorse
 *   display_name: 牛马狗
 *   description: "牛马狗：干活的主力……"
 *   model: opencode-go/deepseek-v4-flash
 *   thinking: high
 *   deep: 1
 *   ---
 *   You are 牛马狗 …
 *
 * Frontmatter keys are parsed loosely (`key: value`, optional surrounding
 * quotes); `name` is required, `description` feeds the tool roster, `model`
 * is a dsh `provider/model` route, `deep` is the spawn-depth budget (the
 * dsh-ui /agent manager uses it: default 1 = may start subagents, 0 = leaf
 * that runs but cannot spawn), and `thinking` holds a reasoning effort id.
 * The body is kept verbatim and doubles as the child's persona.
 *
 * This module is a self-contained copy of the parsing helpers from the dsh
 * terminal UI's agent manager (dsh-tui-pi/src/agent-manager.ts) with no
 * dependency on that package.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** One agent's frontmatter-derived metadata (the editable surface). */
export interface AgentMeta {
  /** File basename without `.md` — required, the stable agent id. */
  name: string
  /** Optional display name, shown before `name` in a picker. */
  displayName?: string
  /** Optional one-line summary used as the tool-roster subtitle. */
  description?: string
  /** Optional 8-color label (red/blue/green/yellow/purple/orange/pink/cyan). */
  color?: string
  /** dsh model route (`provider/model`); absent = inherit the default. */
  model?: string
  /** Reasoning effort id (off/low/medium/high/max); absent = inherit. */
  thinking?: string
  /** Spawn-depth budget: default 1 (may start subagents), 0 = leaf (runs, no spawn). */
  deep: number
}

/** A parsed agent file: metadata + the raw system-prompt body. */
export interface AgentFile {
  path: string
  meta: AgentMeta
  body: string
}

/** One parse outcome: a usable agent, or a broken file with a reason. */
export type AgentParseResult =
  | { ok: true; agent: AgentFile }
  | { ok: false; error: string }

/** Expand a leading `~` to the user's home directory. */
export function expandHome(dir: string): string {
  if (dir === '~') return homedir()
  if (dir.startsWith('~/') || dir.startsWith('~\\')) return join(homedir(), dir.slice(2))
  return dir
}

/** The dsh agents directory default (`~/.dsh/agents`, under the dsh home). */
export function agentsDir(): string {
  return join(homedir(), '.dsh', 'agents')
}

const FRONTMATTER_FENCE = '---'
/** Frontmatter key pattern (same loose shape dsh-tui-pi / fun-agent accept). */
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/

/** Strip one pair of matching surrounding quotes, if present. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  }
  return value
}

/** Find the closing fence line index of a frontmatter starting at line 0. */
function frontmatterBounds(lines: string[]): { close: number } | undefined {
  if (lines[0]?.trim() !== FRONTMATTER_FENCE) return undefined
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_FENCE) return { close: i }
  }
  return undefined
}

/** Parse a loose `key: value` frontmatter block (lines 1..close-1). */
function parseFrontmatterValues(lines: string[], close: number): Record<string, string> {
  const values: Record<string, string> = {}
  for (let i = 1; i < close; i++) {
    const match = KEY_LINE.exec(lines[i])
    if (match === null) continue
    values[match[1]] = stripQuotes(match[2].trim())
  }
  return values
}

/**
 * Parse one agent markdown file. Tolerates CRLF, quotes, and non-key lines
 * inside the frontmatter; `name` is required, `deep` must be a non-negative
 * integer when present (absent defaults to 1). The body is kept verbatim.
 */
export function parseAgentMarkdown(text: string, path: string): AgentParseResult {
  const lines = text.split(/\r?\n/)
  const bounds = frontmatterBounds(lines)
  if (bounds === undefined) {
    return { ok: false, error: 'missing frontmatter (file must start with `---`)' }
  }
  const values = parseFrontmatterValues(lines, bounds.close)
  const name = values['name']?.trim()
  if (name === undefined || name === '') return { ok: false, error: 'missing required frontmatter key `name`' }
  let deep = 1
  if (values['deep'] !== undefined) {
    const raw = values['deep'].trim()
    if (!/^\d+$/.test(raw)) {
      return { ok: false, error: `invalid \`deep\`: expected a non-negative integer, got "${raw}"` }
    }
    deep = Number(raw)
  }
  const body = lines.slice(bounds.close + 1).join('\n').replace(/^\n+/, '').trimEnd()
  const meta: AgentMeta = { name, deep }
  const displayName = values['display_name']?.trim()
  if (displayName !== undefined && displayName !== '') meta.displayName = displayName
  const description = values['description']?.trim()
  if (description !== undefined && description !== '') meta.description = description
  const color = values['color']?.trim()
  if (color !== undefined && color !== '') meta.color = color
  const model = values['model']?.trim()
  if (model !== undefined && model !== '') meta.model = model
  const thinking = values['thinking']?.trim()
  if (thinking !== undefined && thinking !== '') meta.thinking = thinking
  return { ok: true, agent: { path, meta, body } }
}

/** List agents under `dir` (top level only), broken files reported aside. */
export function listAgentFiles(dir: string): { agents: AgentFile[]; broken: Array<{ path: string; error: string }> } {
  const agents: AgentFile[] = []
  const broken: Array<{ path: string; error: string }> = []
  if (!existsSync(dir)) return { agents, broken }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const path = join(dir, entry.name)
    const result = parseAgentMarkdown(readFileSync(path, 'utf8'), path)
    if (result.ok) agents.push(result.agent)
    else broken.push({ path, error: result.error })
  }
  agents.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
  return { agents, broken }
}
