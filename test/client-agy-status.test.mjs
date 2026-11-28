import assert from 'node:assert/strict'
import {
  AGY_MAX_ROWS, AGY_STALE_GRACE_MS, DEFAULT_AGY_TIMEOUT_MS, outcomeOf, parseSettlement, reduceAgyStatus,
} from '../src/client/agy-status.ts'
import { AgyController } from '../src/client/agy-state.ts'

const external = (id, createdAt, label = id) => ({ id, createdAt, mode: 'external', label })
const settled = (senderSessionId, stopReason) => ({ senderSessionId, stopReason })
const NOW = 1_800_000_000_000

// A discovered external row with no settlement is inferred live until the deadline.
assert.deepEqual(reduceAgyStatus([external('a', NOW - 1000)], [], NOW), [
  { id: 'a', label: 'a', name: undefined, createdAt: NOW - 1000, outcome: 'running' },
])
assert.equal(outcomeOf(undefined), 'failed')
assert.equal(outcomeOf('completed'), 'completed')
assert.equal(outcomeOf('aborted'), 'cancelled')
assert.equal(outcomeOf('error'), 'failed')
assert.equal(outcomeOf('max-tokens'), 'failed')
assert.equal(outcomeOf('refusal'), 'failed')

// Settlement notices win over the timeout and map stopReason to the triad.
assert.equal(reduceAgyStatus([external('a', 100)], [settled('a', 'completed')], NOW)[0].outcome, 'completed')
assert.equal(reduceAgyStatus([external('a', 100)], [settled('a', 'aborted')], NOW)[0].outcome, 'cancelled')
assert.equal(reduceAgyStatus([external('a', 100)], [settled('a', 'error')], NOW)[0].outcome, 'failed')
assert.equal(reduceAgyStatus([external('a', 100)], [settled('a', undefined)], NOW)[0].outcome, 'failed')

// No settlement past the agy deadline + grace becomes "unknown", never "running".
const staleAt = NOW - DEFAULT_AGY_TIMEOUT_MS - AGY_STALE_GRACE_MS - 1
assert.equal(reduceAgyStatus([external('stale', staleAt)], [], NOW)[0].outcome, 'unknown')
assert.equal(reduceAgyStatus([external('edge', staleAt + 1)], [], NOW)[0].outcome, 'running')
assert.equal(reduceAgyStatus([external('custom', 0)], [], NOW, 10)[0].outcome, 'unknown')

// A late settlement resurrects a previously stale row as terminal, not unknown.
assert.equal(reduceAgyStatus([external('stale', staleAt)], [settled('stale', 'completed')], NOW)[0].outcome, 'completed')

// parseSettlement reads only the structured `subagent-settled` source.
const notice = { role: 'user', source: { kind: 'subagent-settled', form: 'notice', stopReason: 'completed', senderSessionId: 'child-1' } }
assert.deepEqual(parseSettlement(notice), { senderSessionId: 'child-1', stopReason: 'completed' })
assert.deepEqual(parseSettlement({ source: { kind: 'subagent-settled', senderSessionId: 'child-1' } }), { senderSessionId: 'child-1', stopReason: undefined })
assert.equal(parseSettlement({ source: { kind: 'user', senderSessionId: 'child-1' } }), undefined)
assert.equal(parseSettlement({ source: { kind: 'subagent-settled' } }), undefined)
assert.equal(parseSettlement(undefined), undefined)

// De-duplicate by id (newest createdAt wins) and bound the panel to 20 rows.
const dupes = [external('same', 10, 'old'), external('same', 20, 'new'), external('other', 5)]
const deduped = reduceAgyStatus(dupes, [], NOW)
assert.equal(deduped.length, 2)
assert.equal(deduped.find(row => row.id === 'same').label, 'new')
assert.equal(deduped[0].id, 'same')

const many = Array.from({ length: 25 }, (_, index) => external(`id-${index}`, NOW - index))
const bounded = reduceAgyStatus(many, [], NOW)
assert.equal(bounded.length, AGY_MAX_ROWS)
assert.deepEqual(bounded.map(row => row.id), many.slice(0, AGY_MAX_ROWS).map(row => row.id))

// Non-external and malformed rows never reach the panel.
assert.deepEqual(reduceAgyStatus([{ id: 'local', createdAt: NOW, mode: 'one-shot' }, { id: '', createdAt: NOW, mode: 'external' }], [], NOW), [])

// Label fallback: label -> name -> id.
assert.equal(reduceAgyStatus([{ id: 'x', createdAt: NOW, mode: 'external', name: 'Named' }], [], NOW)[0].label, 'Named')
assert.equal(reduceAgyStatus([{ id: 'x', createdAt: NOW, mode: 'external' }], [], NOW)[0].label, 'x')

// Controller: Remote interrupt is called with the row id, and both outcomes are visible.
let currentSession = 'parent'
let interrupted
let failStop = false
let settlementsForTest = []
const controller = new AgyController({
  currentSessionId: () => currentSession,
  catalog: () => [external('child', NOW - 1000, 'agy-child')],
  settlements: async () => settlementsForTest,
  refresh: async () => {},
  interrupt: async id => { interrupted = id; return failStop ? { ok: false, error: 'denied' } : { ok: true } },
  subscribe: () => () => {},
}, 'en')
await controller.load(true)
assert.equal(controller.getSnapshot().rows[0].outcome, 'running')
await controller.stop('child')
assert.equal(interrupted, 'child')
assert.match(controller.getSnapshot().notice, /Stop signal sent to child/)
failStop = true
await controller.stop('child')
assert.match(controller.getSnapshot().notice, /Failed to stop child: denied/)
settlementsForTest = [settled('child', 'completed')]
await controller.load(false)
assert.equal(controller.getSnapshot().rows[0].outcome, 'completed')
currentSession = undefined
await controller.load(false)
assert.deepEqual(controller.getSnapshot().rows, [])
controller.close()
controller.dispose()

console.log('Agy status reducer + controller checks passed (catalog, settlement, timeout, dedupe, cap, stop feedback).')
