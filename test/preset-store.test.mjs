// Run from the package: node --experimental-strip-types test/preset-store.test.mjs
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, open, unlink } from 'node:fs/promises'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPresetStore } from '../src/preset-store.ts'

const root = await mkdtemp(join(tmpdir(), 'dsh-preset-store-'))
const dir = join(root, 'agents')
const store = createPresetStore(dir)
const code = expected => error => error instanceof Error && error.code === expected
const file = id => join(dir, `${id}.md`)
const find = async id => (await store.list()).entries.find(entry => entry.id === id)
const unchanged = async (id, source, operation, expected) => {
  await assert.rejects(operation, code(expected))
  assert.equal(await readFile(file(id), 'utf8'), source)
}

try {
  assert.deepEqual((await store.list()).entries, [])
  await assert.rejects(readdir(dir), code('ENOENT')) // listing neither creates nor seeds
  const first = await store.save({ id: 'alpha', version: null, patch: { description: 'First', model: 'custom/model' }, body: '# Alpha\n\nPrompt\n' })
  assert.equal(first.fields.name, 'alpha')
  assert.equal(first.fields.model, 'custom/model')
  assert.equal(first.body, '# Alpha\n\nPrompt\n')
  assert.equal(first.fields.deep, undefined)
  assert.equal(first.fields.background, undefined)
  assert.equal(first.fields.maxRounds, undefined)
  assert.equal(first.structured, true)
  assert.match(first.version, /^[a-f0-9]{64}$/)
  const copied = await store.save({ id: 'copy', version: null, patch: { ...first.fields, name: 'copy' }, body: first.body })
  assert.equal(copied.body, first.body)
  assert.equal(await readFile(file('alpha'), 'utf8'), first.source)
  await assert.rejects(store.save({ id: 'alpha', version: null }), code('already_exists'))
  await assert.rejects(store.save({ id: 'ALPHA', version: null }), code('already_exists'))
  await store.remove({ id: 'copy', version: copied.version })
  assert.equal(await find('copy'), undefined)

  const original = '---\r\nname: fidelity\r\n# keep this comment\r\ndescription: \'Original\'   \r\nunknown_key: "untouched"\r\nmodel: vendor/custom\r\n---\r\n\r\n# Keep body\r\n\r\nTrailing spaces  \r\n'
  await writeFile(file('fidelity'), original)
  const fidelity = await find('fidelity')
  const edited = await store.save({ id: 'fidelity', version: fidelity.version, patch: { description: 'Changed' }, body: fidelity.body })
  assert.equal(edited.source, original.replace("'Original'", "'Changed'"))
  assert.equal(edited.fields.deep, undefined)
  const noChange = await store.save({ id: 'fidelity', version: edited.version, patch: { description: 'Changed' }, body: edited.body })
  assert.equal(noChange.source, edited.source)
  const removedModel = await store.save({ id: 'fidelity', version: edited.version, patch: { model: null, thinking: 'high', deep: '0', background: 'true', maxRounds: '60' } })
  assert.equal(removedModel.source, edited.source.replace('model: vendor/custom\r\n', '').replace('---\r\n\r\n# Keep', 'thinking: high\r\ndeep: 0\r\nbackground: true\r\nmaxRounds: 60\r\n---\r\n\r\n# Keep'))
  const changedBody = await store.save({ id: 'fidelity', version: removedModel.version, body: 'New body\r\n' })
  assert.equal(changedBody.source, removedModel.source.slice(0, removedModel.source.lastIndexOf('---\r\n') + 5) + 'New body\r\n')

  await writeFile(file('empty-values'), '---\r\nname: empty-values\r\ndescription: \r\n---')
  const empty = await find('empty-values')
  const filled = await store.save({ id: empty.id, version: empty.version, patch: { description: 'Filled' }, body: 'Body' })
  assert.equal(filled.source, '---\r\nname: empty-values\r\ndescription: Filled\r\n---\r\nBody')

  for (const id of ['../outside', '/absolute', 'C:\\outside', '..', 'CON', 'aux', 'COM1', 'LPT9', 'a.md', 'a/b', 'a\\b', 'name.', '-leading', '中文', 'a'.repeat(65)]) {
    await assert.rejects(store.save({ id, version: null }), code('invalid_id'))
  }
  for (const id of ['../outside', '/absolute', 'C:\\outside', '..', 'a..b', 'CON', 'con.txt', 'COM¹', 'NUL.old', 'aux', 'COM1', 'LPT9', 'a/b', 'a\\b', 'name.', 'tail ', 'control\u0001']) {
    await assert.rejects(store.remove({ id, version: first.version }), code('invalid_id'))
  }
  for (const id of ['中文 角色', 'older.agent', 'with spaces']) {
    await writeFile(file(id), `---\nname: ${id}\ndescription: Original\n---\n\r\nRaw body  \r\n`)
    const legacy = await find(id)
    assert.equal(legacy.error, undefined)
    assert.equal(legacy.body, '\r\nRaw body  \r\n')
    const editedLegacy = await store.save({ id, version: legacy.version, patch: { description: 'Edited' } })
    assert.equal(editedLegacy.fields.name, id)
    assert.equal(editedLegacy.body, legacy.body)
    await store.remove({ id, version: editedLegacy.version })
    await writeFile(file(id), '---\nname: wrong\n---\nraw')
    const badLegacy = await find(id)
    const fixedLegacy = await store.save({ id, version: badLegacy.version, source: badLegacy.source.replace('name: wrong', `name: ${id}`) })
    assert.equal(fixedLegacy.error, undefined)
    await store.remove({ id, version: fixedLegacy.version })
  }
  const oversized = 'x'.repeat(8 * 1024 * 1024 + 1)
  await assert.rejects(store.save({ id: 'too-large', version: null, body: oversized }), code('input_too_large'))
  await assert.rejects(store.save({ id: 'too-large', version: null, source: oversized }), code('input_too_large'))
  await writeFile(file('large-existing'), `---\nname: large-existing\n---\n${oversized}`)
  const large = await find('large-existing')
  assert.equal(large.error, undefined)
  await store.remove({ id: large.id, version: large.version })
  const invalidBytes = Buffer.concat([Buffer.from('---\nname: bad-encoding\n---\n'), Buffer.from([255])])
  await writeFile(file('bad-encoding'), invalidBytes)
  const badEncoding = await find('bad-encoding')
  assert.match(badEncoding.error, /UTF-8/)
  assert.equal(badEncoding.version, createHash('sha256').update(invalidBytes).digest('hex'))
  const repairedEncoding = await store.save({ id: badEncoding.id, version: badEncoding.version, source: '---\nname: bad-encoding\n---\nFixed' })
  await store.remove({ id: repairedEncoding.id, version: repairedEncoding.version })
  for (const input of [null, [], { id: 'alpha', version: first.version, directory: root }, { id: 'alpha' },
    { id: 'alpha', version: 123 }, { id: 'alpha', version: first.version, body: false },
    { id: 'alpha', version: first.version, source: null }, { id: 'alpha', version: first.version, confirmDisplayName: 'yes' },
    { id: 'alpha', version: first.version, source: first.source, patch: {} }, { id: 'alpha', version: first.version, source: first.source, body: '' },
    { id: 'alpha', version: first.version, patch: { unknown: 'x' } }, { id: 'alpha', version: first.version, patch: { deep: 0 } },
    { id: 'alpha', version: first.version, patch: { description: 'two\nlines' } }, { id: 'alpha', version: first.version, patch: [] }]) {
    await assert.rejects(store.save(input), code('invalid_input'))
  }
  await assert.rejects(store.remove({ id: 'alpha', version: first.version, extra: true }), code('invalid_input'))
  for (const patch of [{ name: 'another' }, { name: null }, { deep: '-1' }, { thinking: 'HIGH' }, { background: 'True' }, { maxRounds: '0' }]) {
    await unchanged('alpha', first.source, () => store.save({ id: 'alpha', version: first.version, patch }), 'invalid_preset')
  }
  await assert.rejects(store.save({ id: 'wrong', version: null, source: '---\nname: alpha\n---\n' }), error => code('invalid_preset')(error) && error.field === 'name')

  await unchanged('alpha', first.source, () => store.save({ id: 'alpha', version: first.version, patch: { display_name: 'Shown' } }), 'confirmation_required')
  const shown = await store.save({ id: 'alpha', version: first.version, patch: { display_name: 'Shown' }, confirmDisplayName: true })
  const sameShown = await store.save({ id: 'alpha', version: shown.version, patch: { display_name: 'Shown' } })
  assert.equal(sameShown.source, shown.source)
  await unchanged('alpha', shown.source, () => store.save({ id: 'alpha', version: shown.version, patch: { display_name: null } }), 'confirmation_required')
  const cleared = await store.save({ id: 'alpha', version: shown.version, patch: { display_name: null }, confirmDisplayName: true })
  assert.equal(cleared.fields.display_name, undefined)

  await writeFile(file('broken'), '---\nname: another\ndisplay_name: Old label\ndeep: nope\n---\nRaw prompt\n')
  const broken = await find('broken')
  assert.match(broken.error, /deep/)
  assert.equal(broken.structured, false)
  await unchanged('broken', broken.source, () => store.save({ id: 'broken', version: broken.version, patch: { deep: '1' } }), 'source_required')
  const fixedSource = '---\nname: broken\ndisplay_name: New label\n---\nRaw prompt\n'
  await unchanged('broken', broken.source, () => store.save({ id: 'broken', version: broken.version, source: fixedSource }), 'confirmation_required')
  await unchanged('broken', broken.source, () => store.save({ id: 'broken', version: broken.version, source: '---\nname: other\n---', confirmDisplayName: true }), 'invalid_preset')
  const fixed = await store.save({ id: 'broken', version: broken.version, source: fixedSource, confirmDisplayName: true })
  assert.equal(fixed.error, undefined)
  assert.equal(fixed.source, fixedSource)
  await writeFile(file('missing-name'), '---\nunknown: keep\n---\ntext')
  const missingName = await find('missing-name')
  assert.match(missingName.error, /name/)
  const repaired = await store.save({ id: 'missing-name', version: missingName.version, source: missingName.source.replace('unknown:', 'name: missing-name\nunknown:') })
  assert.equal(repaired.fields.name, 'missing-name')
  await writeFile(file('mismatch'), '---\nname: different\n---\n')
  assert.match((await find('mismatch')).error, /must equal file id/)
  await writeFile(file('no-fence'), 'broken document')
  assert.match((await find('no-fence')).error, /frontmatter/)

  for (const [id, header] of [['duplicate', 'description: one\ndescription: two'], ['complex', 'unknown: |\n  nested text'], ['nested', 'unknown: { nested: value }']]) {
    const source = `---\nname: ${id}\n${header}\n---\nPrompt\n`
    await writeFile(file(id), source)
    const current = await find(id)
    assert.equal(current.error, undefined)
    assert.equal(current.structured, false)
    await unchanged(id, source, () => store.save({ id, version: current.version, patch: { description: 'Edited' } }), 'source_required')
    assert.equal((await store.save({ id, version: current.version, source })).source, source)
  }
  // '#' is part of the loose runtime value, not a YAML inline comment.
  await writeFile(file('loose'), '---\nname: loose\ndescription: words # literal\n---\n')
  assert.equal((await find('loose')).fields.description, 'words # literal')

  const external = cleared.source + '\nExternal edit'
  await writeFile(file('alpha'), external)
  await unchanged('alpha', external, () => store.save({ id: 'alpha', version: cleared.version, patch: { description: 'Overwrite' } }), 'conflict')
  await unchanged('alpha', external, () => store.remove({ id: 'alpha', version: cleared.version }), 'conflict')
  const deleted = await find('alpha')
  await unlink(file('alpha'))
  await assert.rejects(store.save({ id: 'alpha', version: deleted.version, body: 'Overwrite' }), code('conflict'))
  await assert.rejects(store.remove({ id: 'alpha', version: deleted.version }), code('conflict'))

  const concurrent = await store.save({ id: 'concurrent', version: null })
  const races = await Promise.allSettled([
    store.save({ id: 'concurrent', version: concurrent.version, body: 'First' }),
    store.save({ id: 'concurrent', version: concurrent.version, body: 'Second' }),
  ])
  assert.equal(races[0].status, 'fulfilled')
  assert.equal(races[1].status, 'rejected')
  assert.equal(races[1].reason.code, 'conflict')
  const creates = await Promise.allSettled([store.save({ id: 'new-race', version: null }), store.save({ id: 'new-race', version: null })])
  assert.equal(creates.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(creates.find(result => result.status === 'rejected').reason.code, 'already_exists')

  await mkdir(file('folder'))
  await assert.rejects(store.save({ id: 'folder', version: '0'.repeat(64), body: 'No' }), code('unsafe_target'))
  await assert.rejects(store.remove({ id: 'folder', version: '0'.repeat(64) }), code('unsafe_target'))
  const outside = join(root, 'outside.md')
  await writeFile(outside, 'DO NOT TOUCH')
  let linkTested = false
  try {
    await symlink(outside, file('link'), 'file')
    linkTested = true
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error
    console.log('File symlink unavailable on this Windows token; testing a junction instead')
    await symlink(root, file('link'), 'junction')
  }
  assert.equal(await find('link'), undefined)
  await assert.rejects(store.save({ id: 'link', version: '0'.repeat(64), source: '---\nname: link\n---' }), code('unsafe_target'))
  await assert.rejects(store.remove({ id: 'link', version: '0'.repeat(64) }), code('unsafe_target'))
  await assert.rejects(store.save({ id: 'link', version: null }), code('already_exists'))
  assert.equal(await readFile(outside, 'utf8'), 'DO NOT TOUCH')
  if (linkTested && process.platform === 'win32') {
    await symlink(root, file('junction'), 'junction')
    await assert.rejects(store.remove({ id: 'junction', version: '0'.repeat(64) }), code('unsafe_target'))
  }

  // Inject a real FileHandle write failure, without adding production dependency seams.
  const probePath = join(root, 'probe')
  const handle = await open(probePath, 'wx')
  const prototype = Object.getPrototypeOf(handle)
  const originalWrite = prototype.writeFile
  await handle.close()
  await unlink(probePath)
  const beforeRace = await find('fidelity')
  const changedDuringWrite = beforeRace.source + '\nExternal during temp write'
  prototype.writeFile = async function (...args) {
    await originalWrite.apply(this, args)
    await writeFile(file('fidelity'), changedDuringWrite)
  }
  try {
    await unchanged('fidelity', changedDuringWrite, () => store.save({ id: 'fidelity', version: beforeRace.version, body: 'Overwrite external' }), 'conflict')
  } finally { prototype.writeFile = originalWrite }
  prototype.writeFile = async function (...args) {
    await originalWrite.apply(this, args)
    await writeFile(file('outside-creator'), 'CONCURRENT CREATOR', { flag: 'wx' })
  }
  try {
    await assert.rejects(store.save({ id: 'outside-creator', version: null }), code('already_exists'))
    assert.equal(await readFile(file('outside-creator'), 'utf8'), 'CONCURRENT CREATOR')
  } finally { prototype.writeFile = originalWrite }
  await unlink(file('outside-creator'))
  const beforeFailure = await find('fidelity')
  const originalRename = fs.promises.rename
  fs.promises.rename = async () => { throw Object.assign(new Error('Injected rename failure'), { code: 'EACCES' }) }
  syncBuiltinESMExports()
  try {
    await unchanged('fidelity', beforeFailure.source, () => store.save({ id: 'fidelity', version: beforeFailure.version, body: 'Rename failure' }), 'EACCES')
  } finally {
    fs.promises.rename = originalRename
    syncBuiltinESMExports()
  }
  prototype.writeFile = async () => { throw Object.assign(new Error('Injected disk failure'), { code: 'EIO' }) }
  try {
    await unchanged('fidelity', beforeFailure.source, () => store.save({ id: 'fidelity', version: beforeFailure.version, body: 'Lost data' }), 'EIO')
    await assert.rejects(store.save({ id: 'failed-new', version: null }), code('EIO'))
  } finally { prototype.writeFile = originalWrite }
  assert.equal(await find('failed-new'), undefined)
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')), false)
  const originalUnlink = fs.promises.unlink
  prototype.writeFile = async () => { throw Object.assign(new Error('Primary write failure'), { code: 'EIO' }) }
  fs.promises.unlink = async () => { throw Object.assign(new Error('Cleanup failure'), { code: 'EACCES' }) }
  syncBuiltinESMExports()
  try {
    await assert.rejects(store.save({ id: 'cleanup-failure', version: null }), error =>
      error instanceof AggregateError && error.code === 'EIO' && error.errors[1].code === 'EACCES')
  } finally {
    prototype.writeFile = originalWrite
    fs.promises.unlink = originalUnlink
    syncBuiltinESMExports()
  }
  for (const name of await readdir(dir)) if (name.startsWith('.cleanup-failure.') && name.endsWith('.tmp')) await originalUnlink(join(dir, name))
  const originalRead = prototype.readFile
  prototype.readFile = async () => { throw Object.assign(new Error('Read failure'), { code: 'EIO' }) }
  try { await assert.rejects(store.list(), code('EIO')) } finally { prototype.readFile = originalRead }
  // The queue remains usable after rejected writes.
  await store.save({ id: 'fidelity', version: beforeFailure.version, body: 'Recovered' })
  const nonDirectory = createPresetStore(outside)
  await assert.rejects(nonDirectory.list(), code('ENOTDIR'))
  await assert.rejects(nonDirectory.save({ id: 'valid', version: null }), error => error instanceof Error && ['EEXIST', 'ENOTDIR'].includes(error.code))
  const listed = (await store.list()).entries
  const names = listed.filter(item => !item.error).map(item => item.fields.name)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  console.log('preset-store: CRUD, copy, preservation, input/identity, conflicts, links, write failures, confirmation and repair passed')
} finally {
  // Only this mkdtemp-owned isolated tree is removed.
  assert.ok(root.startsWith(join(tmpdir(), 'dsh-preset-store-')))
  await rm(root, { recursive: true, force: true })
}
