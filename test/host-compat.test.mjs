// Host seams that survive the removal of nested subagents: the structural
// child-surface probe, the direct-child catalog read, and child composition.
import assert from 'node:assert/strict'
import { listDirectChildren, rc2ChildSurface, reserveChildComposition, installChildCompositionListener } from '../lib/host-compat.js'

const timeout = setTimeout(() => { throw new Error('host-compat check did not settle within 5 seconds') }, 5000)
const probeCtx = (subagents) => ({ subagents })

try {
  // rc2ChildSurface is a structural probe only: it selects the flattened spec
  // and the listDescendants read — never a descendant join.
  assert.equal(rc2ChildSurface(probeCtx({ waitForChildren: async () => false })), false, 'pre-rc.2 runtime does not speak the rc.2 surface')
  assert.equal(rc2ChildSurface(probeCtx({ waitForTreeWork: async () => false })), true, 'waitForTreeWork presence marks the rc.2 surface')
  console.log('PASS rc2ChildSurface structural probe')

  // listDirectChildren — pre-rc.2: passthrough of SubagentRuntime.listChildren.
  {
    const rows = [{ id: 'a', createdAt: 1, mode: 'one-shot', label: 'x' }, { id: 'b', createdAt: 2, mode: 'continuable', label: 'y' }]
    let calledWith
    const ctx = probeCtx({
      listChildren: async (parentId, signal) => { calledWith = { parentId, signal }; return rows },
    })
    const signal = new AbortController().signal
    const out = await listDirectChildren(ctx, 'parent-1', signal)
    assert.deepEqual(out, rows, 'pre-rc.2 read passes the catalog rows through in order')
    assert.deepEqual(calledWith, { parentId: 'parent-1', signal }, 'pre-rc.2 read forwards parent id and signal')
    console.log('PASS listDirectChildren pre-rc.2 (listChildren passthrough)')
  }

  // listDirectChildren — rc.2: listDescendants cut to the depth-1 children,
  // diagnostics and grandchildren dropped, catalog pre-order kept.
  {
    const descendants = [
      { kind: 'child', id: 'c1', mode: 'one-shot', label: 'x', parentId: 'parent-1', depth: 1, hasChildren: true },
      { kind: 'child', id: 'g1', mode: 'one-shot', label: 'grandchild', parentId: 'c1', depth: 2 },
      { kind: 'diagnostic', id: 'd1', parentId: 'parent-1', depth: 1, reason: 'corrupt' },
      { kind: 'child', id: 'c2', mode: 'continuable', label: 'y', parentId: 'parent-1', depth: 1, hasChildren: false },
    ]
    const ctx = probeCtx({ waitForTreeWork: async () => false, listDescendants: async () => descendants })
    const out = await listDirectChildren(ctx, 'parent-1')
    assert.deepEqual(out, [
      { kind: 'child', id: 'c1', mode: 'one-shot', label: 'x', parentId: 'parent-1', depth: 1, hasChildren: true },
      { kind: 'child', id: 'c2', mode: 'continuable', label: 'y', parentId: 'parent-1', depth: 1, hasChildren: false },
    ], 'rc.2 read keeps only depth-1 children in pre-order')
    console.log('PASS listDirectChildren rc.2 (listDescendants depth-1 cut, order kept)')
  }

  // listDirectChildren — a host with neither read fails loud (no silent empty).
  {
    const ctx = probeCtx({ listDescendants: async () => [] })
    await assert.rejects(listDirectChildren(ctx, 'parent-1'), /no child catalog read/, 'missing reads on both shapes fail loud')
    console.log('PASS listDirectChildren loud failure when no read exists')
  }

  // installChildCompositionListener — the deny filter installed on every
  // child also removes the spawn tools from its schema.
  {
    const listeners = new Map()
    const known = new Set(['subagent', 'use_agent', 'workflow', 'read'])
    const child = {
      id: 'child-1',
      ctx: {
        systemPrompt: { getSectionOrder: () => 0, section(section) { child.persona = section.text } },
        tools: {
          restrict(filter) { for (const name of filter.deny ?? []) known.delete(name) },
          names: () => [...known],
        },
      },
    }
    const ctx = {
      subagents: { startActivation: async () => ({}) },
      agents: { get: (id) => id === child.id ? child : undefined },
      on(name, cb) {
        const set = listeners.get(name) ?? new Set()
        listeners.set(name, set); set.add(cb)
        return () => set.delete(cb)
      },
    }
    const release = installChildCompositionListener(ctx)
    reserveChildComposition(child.id, 'parent', { persona: 'child persona', toolFilter: { deny: ['subagent', 'use_agent', 'workflow'] } })
    for (const cb of listeners.get('subagent/start') ?? []) cb({ id: child.id })
    assert.equal(child.persona, 'child persona', 'persona installed at the start edge')
    assert.deepEqual(child.ctx.tools.names(), ['read'], 'spawn tools removed from the child schema')
    release()
    assert.ok([...listeners.values()].every(set => set.size === 0), 'listener released')
    console.log('PASS child composition installs persona and spawn-tool deny at start edge')
  }
} finally {
  clearTimeout(timeout)
}

console.log('\nAll host-compat assertions passed.')
