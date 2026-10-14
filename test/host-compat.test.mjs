// Public lifecycle correlation, cancellation, parked descendants and exact cleanup.
import assert from 'node:assert/strict'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { createLegacyDescendantJoin, drainRunDescendants } from '../lib/host-compat.js'

const timeout = setTimeout(() => { throw new Error('host-compat check did not settle within 5 seconds') }, 5000)
const tick = () => new Promise(setImmediate)
const listeners = new Map()
const root = { id: 'root', status: 'idle', session: { seq: 1 }, whenIdle: async () => {} }
const agents = new Map([[root.id, root]])
const ctx = {
  agents: { get: id => agents.get(id) },
  subagents: {
    async listDescendants(id) { assert.equal(id, root.id); return [] },
    async drainContinuableDescendants(roots) { assert.equal(this, ctx.subagents); assert.deepEqual(roots, [root]) },
  },
  on(name, callback) {
    const set = listeners.get(name) ?? new Set()
    listeners.set(name, set); set.add(callback)
    return () => set.delete(callback)
  },
}
const emit = (name, info, parent) => {
  for (const callback of listeners.get(name) ?? []) callback.call(parent ? scopeTarget(ctx.subagents, parent) : {}, info)
}
const release = join => {
  join.dispose()
  assert.ok([...listeners.values()].every(set => set.size === 0), 'temporary listeners must be released')
}
const createJoin = signal => createLegacyDescendantJoin(ctx, signal ?? new AbortController().signal)
try {
  await drainRunDescendants(ctx, root)
  ctx.subagents.drainDescendants = async function (roots) { assert.equal(this, ctx.subagents); assert.deepEqual(roots, [root]) }
  await drainRunDescendants(ctx, root)
  delete ctx.subagents.drainDescendants

  let join = createJoin()
  emit('subagent/start', { id: 'unrelated', runId: 'global', local: false })
  await join.wait(root); release(join)

  join = createJoin()
  emit('subagent/start', { id: 'external', runId: 'epoch-new', local: false }, root)
  let done = false
  const waiting = join.wait(root).then(() => { done = true })
  await tick(); assert.equal(done, false)
  emit('subagent/end', { id: 'external', runId: 'epoch-old', local: false }, root)
  await tick(); assert.equal(done, false, 'a prior epoch cannot end a new activation')
  root.session.seq++
  emit('subagent/end', { id: 'external', runId: 'epoch-new', local: false }, root)
  await waiting; release(join)

  const parked = {
    id: 'parked', status: 'idle', session: { header: { parentSession: root.id } },
    inbox: { nextTurn: [{}], nextStep: [] }, whenIdle: async () => {},
  }
  agents.set(parked.id, parked)
  ctx.subagents.listDescendants = async () => [{ kind: 'child', id: parked.id, mode: 'continuable', parentId: root.id }]
  join = createJoin(); await join.wait(root); release(join)

  let idle
  const grand = {
    id: 'grand', status: 'running', session: { header: { parentSession: parked.id } },
    inbox: { nextTurn: [], nextStep: [] }, whenIdle: () => new Promise(resolve => { idle = resolve }),
  }
  agents.set(grand.id, grand)
  ctx.subagents.listDescendants = async () => [
    { kind: 'child', id: parked.id, mode: 'continuable', parentId: root.id },
    { kind: 'child', id: grand.id, mode: 'one-shot', parentId: parked.id },
  ]
  join = createJoin(); done = false
  const forest = join.wait(root).then(() => { done = true })
  await tick(); assert.equal(done, false)
  grand.status = 'idle'; grand.whenIdle = async () => {}; idle(); emit('agent/status', grand)
  await forest; release(join)

  const leaf = { ...parked, id: 'leaf', inbox: { nextTurn: [], nextStep: [] } }
  agents.set(leaf.id, leaf)
  ctx.subagents.listDescendants = async () => [{ kind: 'child', id: leaf.id, mode: 'continuable', parentId: root.id }]
  join = createJoin(); done = false
  emit('subagent/start', { id: leaf.id, runId: 'leaf-run', local: true }, root)
  const publication = join.wait(root).then(() => { done = true })
  await tick(); assert.equal(done, false, 'idle empty publication must await natural settlement')
  agents.delete(leaf.id)
  ctx.subagents.listDescendants = async () => []
  emit('subagent/end', { id: leaf.id, runId: 'leaf-run', local: true }, root)
  await publication; release(join)

  let scans = 0
  ctx.subagents.listDescendants = async () => {
    if (++scans === 1) emit('subagent/end', { id: 'already-settled', runId: 'scan-race' })
    return []
  }
  join = createJoin(); await join.wait(root); release(join)
  assert(scans >= 2, 'an end edge during an asynchronous scan must not be lost')

  ctx.subagents.listDescendants = async () => [{ kind: 'diagnostic', id: 'broken', parentId: root.id, reason: 'corrupt' }]
  join = createJoin()
  await assert.rejects(join.wait(root), /cannot join subagent broken: corrupt/); release(join)

  ctx.subagents.listDescendants = async () => []
  root.whenIdle = () => new Promise(() => {})
  const controller = new AbortController()
  join = createJoin(controller.signal)
  const canceled = join.wait(root)
  await tick(); controller.abort()
  await assert.rejects(canceled, error => error.name === 'AbortError'); release(join)
  console.log('host-compat: PASS — scoped epochs, parked descendants, diagnostics, abort wake, exact drain, listener release')
} finally {
  clearTimeout(timeout)
}
