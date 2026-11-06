// Runtime mount regression for the issue #9 agent-preset support rows:
// src/preset-mount.ts mounts `agent-preset-registry` and
// `subagent-model-selection-settings` on the include tree ONLY where no
// same-id entry exists, and tears down exactly the rows it still owns when
// the plugin fiber disposes. The tree is a structural double of the
// cordis-plugin-loader EntryTree surface the module touches
// (store / create / remove), so no host closure is loaded here.
// Run: node --experimental-strip-types test/preset-mount.test.mjs
import assert from 'node:assert/strict'
import {
  AGENT_PRESET_REGISTRY_ROW,
  SUBAGENT_MODEL_SELECTION_ROW,
  PRESET_SUPPORT_ROWS,
  mountPresetSupportRows,
} from '../src/preset-mount.ts'

const ROW_IDS = ['agent-preset-registry', 'subagent-model-selection-settings']

/** Structural include-tree double: records create/remove/commit/flush calls, stores options by id. */
function makeTree() {
  const store = Object.create(null)
  const calls = { create: [], remove: [], commit: [], flush: 0 }
  const root = { root: true }
  const tree = {
    store,
    root,
    async create(options) {
      calls.create.push(options)
      store[options.id] = { options }
      return options.id
    },
    remove(id) {
      calls.remove.push(id)
      delete store[id]
    },
    commit(change) {
      calls.commit.push(change)
    },
    async flush() {
      calls.flush += 1
    },
  }
  return { tree, calls }
}

/** Plugin-context double: fiber.entry.parent.tree is the walk the module uses. */
function makeCtx(tree) {
  const effects = []
  const warns = []
  const ctx = {
    fiber: tree === undefined ? undefined : { entry: { parent: { tree } } },
    effect(fn, name) {
      effects.push({ fn, name })
    },
    logger: {
      warn(message) {
        warns.push(String(message))
      },
    },
  }
  return { ctx, effects, warns }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

{
  // Mount: an empty tree gains both rows with the retired static rows'
  // verbatim config, and one named teardown effect is registered.
  const { tree, calls } = makeTree()
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  assert.deepEqual(calls.create.map((options) => options.id), ROW_IDS, 'both support rows created')
  assert.deepEqual(effects.map((effect) => effect.name), ['dsh-subagent-registry:preset-support'], 'one teardown effect registered')
  assert.deepEqual({ ...tree.store['agent-preset-registry'].options.config }, { default: 'native' }, 'registry row config migrated verbatim')
  assert.equal(tree.store['agent-preset-registry'].options.name, '@deepseek-ai/dsh-agent-preset-registry', 'registry row module name migrated')
  assert.equal(tree.store['subagent-model-selection-settings'].options.name, '@deepseek-ai/dsh-tool-subagent/model-selection-settings', 'model-selection row module name migrated')
  for (const row of PRESET_SUPPORT_ROWS) {
    assert.notEqual(tree.store[row.id].options, row, 'the created options are a clone, not the shared frozen constant')
  }
  console.log('PASS mount creates both support rows with verbatim config')
}

{
  // Dispose: the teardown removes exactly the rows this mount created.
  const { tree, calls } = makeTree()
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  await effects[0].fn()()
  assert.deepEqual(calls.remove.sort(), [...ROW_IDS].sort(), 'both support rows removed on dispose')
  assert.deepEqual(Object.keys(tree.store), [], 'the tree carries no support rows after dispose')
  assert.equal(calls.flush, 1, 'teardown awaits the journal flush so the removals persist')
  console.log('PASS dispose tears down the mounted rows')
}

{
  // Idempotence: a second mount sees the rows and registers no second
  // teardown — one create per row across both calls.
  const { tree, calls } = makeTree()
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  mountPresetSupportRows(ctx)
  await flush()
  assert.equal(calls.create.length, 2, 'each row created exactly once')
  assert.equal(effects.length, 1, 'the second mount is a no-op (no second teardown)')
  console.log('PASS repeated mount is idempotent')
}

{
  // Web coexistence: when the web-app's own rows already occupy both ids,
  // the mount creates nothing, registers no teardown, and the existing
  // entries (the web-app's options objects) stay untouched.
  const { tree, calls } = makeTree()
  const webOptions = ROW_IDS.map((id) => ({ id, name: `web-app:${id}` }))
  for (const options of webOptions) tree.store[options.id] = { options }
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  assert.equal(calls.create.length, 0, 'no row created where the ids already exist')
  assert.equal(effects.length, 0, 'no teardown registered — the foreign rows are not ours to remove')
  for (const options of webOptions) {
    assert.equal(tree.store[options.id].options, options, `the pre-existing ${options.id} entry keeps its identity`)
  }
  console.log('PASS mount skips when the web-app rows already own the ids')
}

{
  // Partial state: only the missing row is mounted.
  const { tree, calls } = makeTree()
  const foreign = { id: 'agent-preset-registry', name: 'web-app:registry' }
  tree.store[foreign.id] = { options: foreign }
  const { ctx } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  assert.deepEqual(calls.create.map((options) => options.id), ['subagent-model-selection-settings'], 'only the missing row is created')
  assert.equal(tree.store['agent-preset-registry'].options, foreign, 'the existing row keeps its identity')
  console.log('PASS mount fills only the missing row')
}

{
  // Claimed row: if a later patch layer replaces one of our rows between
  // mount and dispose (new options object under the same id), the teardown
  // leaves it alone — identity, not id, marks ownership.
  const { tree, calls } = makeTree()
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  const claimed = { id: 'agent-preset-registry', name: 'later-layer:registry' }
  tree.store['agent-preset-registry'].options = claimed
  await effects[0].fn()()
  assert.deepEqual(calls.remove, ['subagent-model-selection-settings'], 'only the still-owned row is removed')
  assert.equal(tree.store['agent-preset-registry'].options, claimed, 'the claimed row survives the teardown')
  console.log('PASS dispose skips rows claimed by another layer')
}

{
  // Host race: the include's stop() unlinks every entry (store cleared) before
  // this teardown lands — the row is gone from the tree but its persisted
  // create record must still be cancelled through the journal (a remove
  // record: commit with legacy only), and the teardown must await the flush
  // so the removal survives the process-shutdown force exit.
  const { tree, calls } = makeTree()
  const { ctx, effects } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  delete tree.store['agent-preset-registry']
  delete tree.store['subagent-model-selection-settings']
  await effects[0].fn()()
  assert.deepEqual(calls.remove, [], 'nothing to remove — the host already unlinked the rows')
  assert.equal(calls.commit.length, 2, 'both rows journaled as removals')
  for (const change of calls.commit) {
    assert.equal(change.group, tree.root, 'the journal change targets the root group')
    assert.ok(!('options' in change), 'the journal change carries legacy only (a remove record)')
    assert.ok(ROW_IDS.includes(change.id), `journal change names the row ${change.id}`)
  }
  assert.equal(calls.flush, 1, 'teardown awaits the journal flush')
  console.log('PASS dispose cancels journaled creates when the host already unlinked the rows')
}

{
  // Bare context (unit tests, embedded hosts): no include tree reachable —
  // a silent no-op, no effect, no throw.
  const { ctx, effects } = makeCtx(undefined)
  ctx.fiber = undefined
  mountPresetSupportRows(ctx)
  await flush()
  assert.equal(effects.length, 0, 'no teardown registered without a tree')
  console.log('PASS bare ctx (no include tree) is a silent no-op')
}

{
  // Create failure: a rejected create is logged and swallowed — the support
  // gap must not take the plugin down — and the failed row is not removed.
  const store = Object.create(null)
  const removeCalls = []
  const tree = {
    store,
    async create(options) {
      if (options.id === 'subagent-model-selection-settings') throw new Error('module missing')
      store[options.id] = { options }
      return options.id
    },
    remove(id) {
      removeCalls.push(id)
      delete store[id]
    },
  }
  const { ctx, effects, warns } = makeCtx(tree)
  mountPresetSupportRows(ctx)
  await flush()
  assert.equal(warns.length, 1, 'the failed create is logged')
  assert.match(warns[0], /subagent-model-selection-settings/, 'the log names the failed row')
  await effects[0].fn()()
  assert.deepEqual(removeCalls, ['agent-preset-registry'], 'the mounted row is removed, the failed one skipped')
  console.log('PASS create failures are logged, swallowed and skip the teardown')
}
