// Migrated verbatim from @aiwayds/dsh-ptc-subagent (merged into this registry in 0.18.0); import paths re-pointed at lib/ptc/.
// store binding tests — a fake session stands in for the host's Session: it
// records append()ed events and replays snapshotEvents() as the full log
// (inherited prefix included), which is exactly the branch contract the real
// type exposes (verified against @deepseek-ai/dsh-session 0.2.0-rc.2: a
// branch's log IS its path — a fork child opens with its parent's prefix).
// Covers fork isolation, resume replay, last-write-wins, both quotas, and
// the structured no-throw error surface. Fully offline.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  createStoreBinding,
  replayStore,
  valueBytes,
  stateBytes,
  branchEvents,
  STORE_EVENT_TYPE,
  STORE_VALUE_LIMIT_BYTES,
  STORE_TOTAL_LIMIT_BYTES,
  STORE_KEY_LIMIT_CHARS,
} = await import('../lib/ptc/bindings/store.js')

/** A fake live session: the subset the binding touches. */
function fakeSession({ inherited = 0, seed = [] } = {}) {
  const log = [...seed]
  return {
    inheritedEventCount: inherited,
    appended: [],
    append(type, data) {
      const event = { type, data, seq: log.length }
      log.push(event)
      this.appended.push(event)
      return event
    },
    snapshotEvents() {
      return [...log]
    },
    ownEvents() {
      return log.slice(this.inheritedEventCount)
    },
    /** Test helper: how many store events this branch's replay sees. */
    storeEvents() {
      return this.snapshotEvents().filter((e) => e.type === STORE_EVENT_TYPE)
    },
  }
}

function makeStore(session) {
  const collector = { storeWrites: 0 }
  const binding = createStoreBinding(session, collector)
  return {
    collector,
    store: (args) => binding.functions.store(args),
    load: (args) => binding.functions.load(args),
  }
}

test('store writes a plugin-owned session event and load replays it', async () => {
  const session = fakeSession()
  const s = makeStore(session)
  const out = await s.store({ key: 'verdicts', value: { done: 3, total: 10 } })
  assert.deepEqual(out, { ok: true, bytes: out.bytes })
  // The write is a durable session event of the plugin's own type.
  assert.equal(session.appended.length, 1)
  assert.equal(session.appended[0].type, 'ptc-subagent/store-write')
  assert.deepEqual(session.appended[0].data, { key: 'verdicts', value: { done: 3, total: 10 } })
  const loaded = await s.load({ key: 'verdicts' })
  assert.deepEqual(loaded, { found: true, value: { done: 3, total: 10 } })
  assert.equal(s.collector.storeWrites, 1)
})

test('absent keys load as {found: false}, never a rejection', async () => {
  const s = makeStore(fakeSession())
  assert.deepEqual(await s.load({ key: 'nothing' }), { found: false })
})

test('fork branches see their path history, never sibling writes', async () => {
  const parent = fakeSession()
  const parentStore = makeStore(parent)
  await parentStore.store({ key: 'phase', value: 'parent-1' })
  await parentStore.store({ key: 'shared', value: 'from-parent' })

  // Fork at the current end: the child inherits the parent's log prefix —
  // pre-fork parent writes are ON the child's path.
  const forkPoint = parent.snapshotEvents().length
  const child = fakeSession({ seed: parent.snapshotEvents(), inherited: forkPoint })
  const childStore = makeStore(child)
  await childStore.store({ key: 'phase', value: 'child-2' })

  // The child sees its own overwrite plus the inherited pre-fork values.
  assert.deepEqual(await childStore.load({ key: 'phase' }), { found: true, value: 'child-2' })
  assert.deepEqual(await childStore.load({ key: 'shared' }), { found: true, value: 'from-parent' })

  // A write on the child does NOT appear on the parent's branch...
  assert.deepEqual(await parentStore.load({ key: 'phase' }), { found: true, value: 'parent-1' })

  // ...and a parent write after the fork point never leaks into the child.
  await parentStore.store({ key: 'late', value: 'parent-only' })
  assert.deepEqual(await childStore.load({ key: 'late' }), { found: false })
  assert.deepEqual(await parentStore.load({ key: 'late' }), { found: true, value: 'parent-only' })

  // The child's replay covers its full path: inherited prefix + own writes.
  assert.equal(child.storeEvents().length, 3, 'inherited prefix + own writes')
  assert.equal(parent.storeEvents().length, 3)
})

test('resume replays the full stored branch log (a restored session keeps its fork cut)', async () => {
  const live = fakeSession()
  const s1 = makeStore(live)
  await s1.store({ key: 'k', value: 'v1' })
  await s1.store({ key: 'k2', value: { deep: [1, 2] } })
  await s1.store({ key: 'k', value: 'v2' })

  // "Resume": the same log comes back as the seed of a fresh object; the
  // inherited count keeps the fork cut, so the replay still sees everything.
  const resumed = fakeSession({ seed: live.snapshotEvents(), inherited: 0 })
  const s2 = makeStore(resumed)
  assert.deepEqual(await s2.load({ key: 'k' }), { found: true, value: 'v2' }, 'last write per key wins')
  assert.deepEqual(await s2.load({ key: 'k2' }), { found: true, value: { deep: [1, 2] } })
})

test('per-value quota rejects oversized payloads with a structured explanation', async () => {
  const s = makeStore(fakeSession())
  const oversized = 'x'.repeat(STORE_VALUE_LIMIT_BYTES + 1)
  const out = await s.store({ key: 'big', value: oversized })
  assert.equal(out.ok, false)
  assert.equal(out.error, 'quota-exceeded')
  assert.match(out.message, /per-value quota/)
  assert.match(out.message, /session log/, 'the message explains WHY the quota exists')
  assert.equal(s.collector.storeWrites, 0)
  // Exactly at the cap is fine.
  const atCap = await s.store({ key: 'cap', value: 'y'.repeat(STORE_VALUE_LIMIT_BYTES - JSON.stringify('cap').length - 12) })
  assert.equal(atCap.ok, true)
})

test('the total quota rejects when the branch state is full, replaced values free room', async () => {
  const session = fakeSession()
  const s = makeStore(session)
  // Fill the state with ten ~100KB values (each well under the per-value
  // cap) to land just under the 1MB total.
  const block = 100 * 1024 - 64
  for (let i = 0; i < 10; i += 1) {
    const out = await s.store({ key: `slot-${i}`, value: 'x'.repeat(block) })
    assert.equal(out.ok, true, `slot-${i} should fit`)
  }
  // Ten ~100KB blocks leave ~25KB free — a 30KB write is over the total.
  const refused = await s.store({ key: 'overflow', value: 'c'.repeat(30 * 1024) })
  assert.equal(refused.ok, false)
  assert.equal(refused.error, 'quota-exceeded')
  assert.match(refused.message, /total quota/)
  assert.equal(s.collector.storeWrites, 10)

  // Replacing a full slot (a new event, same key) frees its previous bytes.
  const replaced = await s.store({ key: 'slot-3', value: 'small' })
  assert.equal(replaced.ok, true)
  assert.equal(s.collector.storeWrites, 11)
  assert.deepEqual(await s.load({ key: 'slot-3' }), { found: true, value: 'small' })
  // The freed room is real: a medium value now fits again.
  assert.equal((await s.store({ key: 'medium', value: 'm'.repeat(50 * 1024) })).ok, true)
})

test('agent-less executions get structured no-session results, never throws', async () => {
  const s = makeStore(undefined)
  const written = await s.store({ key: 'k', value: 1 })
  assert.equal(written.ok, false)
  assert.equal(written.error, 'no-session')
  const loaded = await s.load({ key: 'k' })
  assert.equal(loaded.error, 'no-session')
})

test('malformed calls resolve structured errors without touching the session', async () => {
  const session = fakeSession()
  const s = makeStore(session)
  const badKey = await s.store({ key: '', value: 1 })
  assert.equal(badKey.error, 'invalid-key')
  const longKey = await s.store({ key: 'k'.repeat(STORE_KEY_LIMIT_CHARS + 1), value: 1 })
  assert.equal(longKey.error, 'invalid-key')
  const badArgs = await s.store('not-an-object')
  assert.equal(badArgs.error, 'invalid-value')
  const badLoad = await s.load({})
  assert.equal(badLoad.error, 'invalid-key')
  assert.equal(session.appended.length, 0, 'nothing was written')
})

test('pure helpers: replay, sizing, branch accessor', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: STORE_EVENT_TYPE, data: { key: 'a', value: 1 } },
    { type: STORE_EVENT_TYPE, data: { key: 'a', value: 2 } },
    { type: STORE_EVENT_TYPE, data: { key: 'b', value: null } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
  ]
  const state = replayStore(events)
  assert.equal(state.get('a'), 2, 'last write wins')
  assert.equal(state.get('b'), null)
  assert.equal(state.size, 2)
  assert.equal(valueBytes(null), 4)
  assert.equal(stateBytes(state), JSON.stringify(2).length + JSON.stringify(null).length)
  // branchEvents is the full-log accessor on a session-like object.
  const sessionLike = { snapshotEvents: () => events }
  assert.deepEqual(branchEvents(sessionLike), events)
})
