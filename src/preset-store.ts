import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { KEY_LINE, frontmatterBounds, parseAgentMarkdown, parseFrontmatterValues } from './agents-dir.ts'
import { PRESET_KEYS, type PresetEntry, type PresetFields, type PresetKey, type PresetList, type SavePreset } from './preset-contract.ts'

function fail(code: string, message: string, field?: string): never {
  throw Object.assign(new Error(message), { code, ...(field === undefined ? {} : { field }) })
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function object(value: unknown, keys: readonly string[], field?: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('invalid_input', 'Expected an object', field)
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) fail('invalid_input', `Unknown field: ${String(key)}`, String(key))
  }
  return value as Record<string, unknown>
}

function validateId(id: unknown, creating = false): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || /[/\\<>:"|?*\p{Cc}]/u.test(id) || id.includes('..')
    || /[ .]$/.test(id) || /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i.test(id.split('.')[0].trimEnd())) {
    fail('invalid_id', 'Expected a safe file basename without paths, controls, trailing dots/spaces or Windows reserved names', 'id')
  }
  if (creating && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    fail('invalid_id', 'New names use 1–64 ASCII letters, digits, underscores or hyphens', 'id')
  }
}

const MAX_INPUT_BYTES = 8 * 1024 * 1024
function validateTextSize(text: string, field: string): void {
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) {
    fail('input_too_large', 'Submitted text exceeds 8 MiB; existing files remain readable', field)
  }
}

function validateVersion(version: unknown, create: boolean): void {
  if (!(create && version === null) && (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version))) {
    fail('invalid_input', 'Expected a file hash version', 'version')
  }
}

function saveInput(input: unknown): SavePreset {
  const value = object(input, ['id', 'version', 'patch', 'body', 'source', 'confirmDisplayName'])
  validateId(value.id, value.version === null)
  validateVersion(value.version, true)
  for (const key of ['source', 'body'] as const) {
    if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== 'string') fail('invalid_input', 'Expected text', key)
      validateTextSize(value[key], key)
    }
  }
  if (Object.hasOwn(value, 'confirmDisplayName') && typeof value.confirmDisplayName !== 'boolean') {
    fail('invalid_input', 'Expected a boolean', 'confirmDisplayName')
  }
  if (Object.hasOwn(value, 'source') && (Object.hasOwn(value, 'patch') || Object.hasOwn(value, 'body'))) {
    fail('invalid_input', 'source cannot be combined with patch or body', 'source')
  }
  const result: SavePreset = { id: value.id, version: value.version as string | null }
  if (Object.hasOwn(value, 'patch')) {
    const patch = object(value.patch, PRESET_KEYS, 'patch')
    result.patch = {}
    for (const key of Object.keys(patch) as PresetKey[]) {
      const field = patch[key]
      if (field !== null && (typeof field !== 'string' || /[\r\n\0]/.test(field))) {
        fail('invalid_input', 'Expected single-line text or null', key)
      }
      if (typeof field === 'string') validateTextSize(field, key)
      result.patch[key] = typeof field === 'string' ? field.trim() : null
    }
  }
  if (typeof value.source === 'string') result.source = value.source
  if (typeof value.body === 'string') result.body = value.body
  if (typeof value.confirmDisplayName === 'boolean') result.confirmDisplayName = value.confirmDisplayName
  return result
}

function hash(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex')
}

/** Locate original lines; interpretation stays with the runtime's loose parser. */
function document(source: string) {
  const lines = source.split(/\r?\n/)
  const bounds = frontmatterBounds(lines)
  const raw = source.split(/(?<=\n)/)
  const fields: PresetFields = {}
  let structured = bounds !== undefined
  if (bounds !== undefined) {
    const values = parseFrontmatterValues(lines, bounds.close)
    for (const key of PRESET_KEYS) if (Object.hasOwn(values, key)) fields[key] = values[key].trim()
    const seen = new Set<string>()
    for (const line of lines.slice(1, bounds.close)) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue
      const match = KEY_LINE.exec(line)
      if (match === null || seen.has(match[1])) { structured = false; continue }
      seen.add(match[1])
      const value = match[2].trim()
      // Complex YAML-looking syntax is opaque to this loose parser; use source editing.
      if (/^[|>\[\{&*!]/.test(value)
        || ((value.startsWith('"') || value.startsWith("'")) && value.at(-1) !== value[0])) structured = false
    }
  }
  return { raw, bounds, fields, structured }
}

function entry(id: string, source: string, path: string): PresetEntry {
  const doc = document(source)
  const parsed = parseAgentMarkdown(source, path)
  let error = parsed.ok ? undefined : parsed.error
  if (parsed.ok && parsed.agent.meta.name !== id) error = `frontmatter name must equal file id "${id}"`
  try { validateId(id) } catch (invalid) { error = (invalid as Error).message }
  const body = doc.bounds === undefined ? source : doc.raw.slice(doc.bounds.close + 1).join('')
  return { id, version: hash(source), fields: doc.fields, source, body, ...(error === undefined ? {} : { error }), structured: doc.structured && error === undefined }
}

function quote(value: string, previous = ''): string {
  const first = previous.trim()[0]
  const outer = (first === '"' || first === "'") && previous.trim().at(-1) === first ? first
    : /^(".*"|'.*')$/.test(value) ? '"' : ''
  return `${outer}${value}${outer}`
}

function patchSource(current: PresetEntry, input: SavePreset): string {
  if (!current.structured) fail('source_required', 'This document requires full source editing', 'source')
  const doc = document(current.source)
  const close = doc.bounds!.close
  const newline = current.source.includes('\r\n') ? '\r\n' : '\n'
  const additions: string[] = []
  for (const key of Object.keys(input.patch ?? {}) as PresetKey[]) {
    const value = input.patch![key]
    if (value === current.fields[key] || (value === null && current.fields[key] === undefined)) continue
    const index = doc.raw.findIndex((line, i) => i > 0 && i < close && KEY_LINE.exec(line.replace(/\r?\n$/, ''))?.[1] === key)
    if (index < 0) {
      if (value !== null && value !== undefined) additions.push(`${key}: ${quote(value)}${newline}`)
    } else if (value === null) doc.raw[index] = ''
    else if (value !== undefined) {
      const line = doc.raw[index]
      const match = /^([^:]+:[ \t]*)(.*?)([ \t]*)(\r?\n)?$/.exec(line)!
      doc.raw[index] = `${match[1]}${quote(value, match[2])}${match[3]}${match[4] ?? ''}`
    }
  }
  doc.raw.splice(close, 0, ...additions)
  if (input.body !== undefined && input.body !== current.body) {
    const bodyStart = close + additions.length + 1
    if (!doc.raw[bodyStart - 1].endsWith('\n')) doc.raw[bodyStart - 1] += newline
    doc.raw.splice(bodyStart, doc.raw.length - bodyStart, input.body)
  }
  return doc.raw.join('')
}

/** The directory is trusted host configuration, never a remote request parameter. */
export function createPresetStore(directory: string) {
  const root = resolve(directory)
  // ponytail: serialize only this instance; cross-process writers need an OS lock/CAS facility.
  let pending = Promise.resolve()
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.then(() => undefined, () => undefined)
    return result
  }

  async function readTarget(id: string) {
    const target = join(root, `${id}.md`)
    const stat = await lstat(target)
    if (!stat.isFile() || stat.isSymbolicLink()) fail('unsafe_target', 'Target must be a regular file, not a link or directory', 'id')
    const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const opened = await file.stat()
      const latest = await lstat(target)
      if (!latest.isFile() || latest.isSymbolicLink() || opened.dev !== latest.dev || opened.ino !== latest.ino
        || stat.dev !== latest.dev || stat.ino !== latest.ino) {
        fail('unsafe_target', 'Target changed while opening', 'id')
      }
      const bytes = await file.readFile()
      const source = bytes.toString('utf8')
      const result = entry(id, source, target)
      result.version = hash(bytes)
      if (!Buffer.from(source, 'utf8').equals(bytes)) {
        result.error = 'Invalid UTF-8; use full source repair'
        result.structured = false
      }
      return { entry: result, stat: opened }
    } finally { await file.close() }
  }

  async function existing(id: string, version: string) {
    let current
    try { current = await readTarget(id) } catch (error) {
      if (isMissing(error)) fail('conflict', 'The file was removed; reload before saving or deleting', 'version')
      throw error
    }
    if (current.entry.version !== version) fail('conflict', 'The file changed; reload before saving or deleting', 'version')
    return current
  }

  return {
    list(): Promise<PresetList> {
      return serial(async () => {
        let files
        try { files = await readdir(root, { withFileTypes: true }) } catch (error) {
          if (isMissing(error)) return { directory: root, entries: [] }
          throw error
        }
        const entries: PresetEntry[] = []
        for (const file of files) {
          if (file.isFile() && file.name.endsWith('.md')) entries.push((await readTarget(file.name.slice(0, -3))).entry)
        }
        entries.sort((a, b) => (a.fields.name ?? a.id).localeCompare(b.fields.name ?? b.id))
        return { directory: root, entries }
      })
    },
    async save(raw: unknown): Promise<PresetEntry> {
      const input = saveInput(raw)
      return serial(async () => {
        const creating = input.version === null
        const current = creating ? undefined : await existing(input.id, input.version!)
        const base = current?.entry ?? entry(input.id, `---\nname: ${input.id}\n---\n`, join(root, `${input.id}.md`))
        const source = input.source ?? patchSource(base, input)
        const next = entry(input.id, source, join(root, `${input.id}.md`))
        if (next.error !== undefined) {
          const field = next.error.match(/`(name|deep|thinking|background|maxRounds)`/)?.[1]
            ?? (next.fields.name !== input.id ? 'name' : 'source')
          fail('invalid_preset', next.error, field)
        }
        // Invalid old presets still have a runtime-parsed display_name value.
        const beforeDisplay = current?.entry.fields.display_name || undefined
        const afterDisplay = next.fields.display_name || undefined
        if (current !== undefined && beforeDisplay !== afterDisplay && input.confirmDisplayName !== true) {
          fail('confirmation_required', 'Confirm display-name changes: older runs may no longer be found by name', 'display_name')
        }
        if (creating) {
          await mkdir(root, { recursive: true })
          const files = await readdir(root)
          if (files.some(name => name.toLowerCase() === `${input.id}.md`.toLowerCase())) {
            fail('already_exists', 'A preset with this name already exists', 'id')
          }
        } else if (source === current!.entry.source) return current!.entry
        const target = join(root, `${input.id}.md`)
        const temporary = join(root, `.${input.id}.${randomUUID()}.tmp`)
        const file = await open(temporary, 'wx', current === undefined ? 0o600 : current.stat.mode & 0o777)
        let failure: unknown
        try {
          try { await file.writeFile(source, 'utf8'); await file.sync() } finally { await file.close() }
          if (creating) {
            // link is an atomic exclusive publish; rename would overwrite a concurrent creator.
            try { await link(temporary, target) } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('already_exists', 'A preset with this name already exists', 'id')
              throw error
            }
          } else {
            // Check again after the temp write. An external writer can still race this check and rename.
            await existing(input.id, input.version!)
            await rename(temporary, target)
          }
          return next
        } catch (error) { failure = error; throw error } finally {
          try { await unlink(temporary) } catch (error) {
            if (!isMissing(error)) {
              if (failure !== undefined) {
                throw Object.assign(new AggregateError([failure, error], 'Preset write and temporary cleanup failed'), {
                  code: (failure as NodeJS.ErrnoException).code ?? 'io_error',
                })
              }
              throw error
            }
          }
        }
      })
    },
    async remove(raw: unknown): Promise<void> {
      const input = object(raw, ['id', 'version'])
      validateId(input.id)
      validateVersion(input.version, false)
      const id = input.id
      const version = input.version as string
      // Like rename, unlink has no portable conditional-version API for external writers.
      return serial(async () => { await existing(id, version); await unlink(join(root, `${id}.md`)) })
    },
  }
}
