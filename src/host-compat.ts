/** Public host seams used only when managed activations are absent — plus the out-of-band child composition for activation hosts. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentResult, SubagentRunInfo, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
import { carrierKeyOf } from '@deepseek-ai/dsh-scope'

export interface LegacyRun {
  readonly id: SessionId
  readonly localAgent: Agent | undefined
  readonly result: Promise<SubagentResult>
  dispose(): Promise<void>
}

interface LegacyDescendant {
  readonly kind: 'child' | 'diagnostic'
  readonly id: SessionId
  readonly parentId: SessionId
  readonly mode?: 'one-shot' | 'continuable'
  readonly reason?: string
}

/** The old service remains the receiver of every legacy method. */
export interface LegacySubagents {
  start(provider: string, request: SubagentStartRequest & ChildComposition): Promise<LegacyRun>
  startContinuable(spec: {
    provider: string
    label: string
    request: Omit<SubagentStartRequest, 'label' | 'signal'> & ChildComposition
    signal: AbortSignal
  }): Promise<{ childId: SessionId }>
  listDescendants(id: SessionId, signal?: AbortSignal): Promise<readonly LegacyDescendant[]>
  drainContinuableDescendants(parents: readonly Agent[]): Promise<void>
  /** The pre-rc.2 child catalog read (removed from the rc.2 runtime). */
  listChildren?(parentSessionId: SessionId, signal?: AbortSignal): Promise<readonly DirectChildEntry[]>
  /** The pre-rc.2 descendant join (replaced by waitForTreeWork on rc.2). */
  waitForChildren?(parent: Agent): Promise<boolean>
}

export const legacySubagents = (ctx: Context): LegacySubagents => ctx.subagents as unknown as LegacySubagents

// ---------------------------------------------------------------------------
// The 0.2.2-rc.2 child surface
// ---------------------------------------------------------------------------
//
// The 0.2.2-rc.2 wave reshaped four child seams at once; every reshape keeps a
// cross-generation reading here:
//   1. `SubagentRuntime.waitForChildren(parent)` became
//      `waitForTreeWork(root)` — same join contract under tree-rooted naming
//      (the rc.2 headless driver runs the identical idle/seq loop against it).
//   2. `SubagentRuntime.listChildren(parentId)` is gone. The direct-child read
//      becomes `listDescendants(parentId)` cut to the `depth === 1` rows: the
//      stable pre-order keeps the parent catalog's event order at depth 1, so
//      the pickers' "last match wins" semantics survive unchanged.
//   3. `ResumeAgentOptions.parentAgent` was removed — agent ownership now
//      follows the calling context (the rc.2 resume path destructures only
//      `{ resumeSessionId, agentOptions, signal, setup }` and hangs the agent
//      off the context the call went through). A carried `parentAgent` key is
//      inert there while pre-rc.2 lines REQUIRE it, so one call form through
//      `parent.ctx` with the key covers every generation.
//   4. `SubagentActivationSpec` flattened: the nested `request` object now
//      rides the spec itself (the spec extends
//      `Omit<SubagentStartRequest, 'label' | 'signal'>`).
//
// `waitForTreeWork` is the runtime probe for the whole wave: it first exists
// in 0.2.2-rc.2 (rc.1 still carried waitForChildren/listChildren and the
// nested spec), and the four reshapes shipped together in that release.

/** Whether the host's subagents service speaks the 0.2.2-rc.2 child surface. */
export function rc2ChildSurface(ctx: Context): boolean {
  return typeof (ctx.subagents as unknown as { waitForTreeWork?: unknown }).waitForTreeWork === 'function'
}

/** Structural minimum of a direct-child catalog row the pickers read. */
export interface DirectChildEntry {
  readonly id: unknown
  readonly mode?: 'one-shot' | 'continuable' | 'external' | 'unknown'
  readonly label?: string
}

/**
 * Read the parent's durable direct-child catalog in catalog event order.
 * Pre-rc.2 hosts answer through `SubagentRuntime.listChildren`; rc.2 hosts
 * through `listDescendants(parentId)` cut to the depth-1 rows (every row
 * carries its `depth`; the pre-order keeps the parent catalog's order).
 */
export async function listDirectChildren(ctx: Context, parentId: SessionId, signal?: AbortSignal): Promise<DirectChildEntry[]> {
  if (!rc2ChildSurface(ctx)) {
    const legacy = legacySubagents(ctx)
    if (typeof legacy.listChildren !== 'function') throw new Error('the subagents service exposes no child catalog read')
    return [...(await legacy.listChildren(parentId, signal))]
  }
  const rows = await ctx.subagents.listDescendants(parentId, signal)
  return rows.filter((row): row is typeof row & { kind: 'child'; depth: 1 } => row.kind === 'child' && row.depth === 1)
}

/**
 * Resolve the agent the native descendant join must be called with for
 * `parent` on this host, or `undefined` when no native join can serve it
 * (the caller rides {@link createLegacyDescendantJoin}).
 *
 * pre-rc.2 hosts join through `waitForChildren(parent)`, which filters by
 * lineage below any parent — the parent itself is the join target. rc.2 hosts
 * join through `waitForTreeWork(root)`, which takes the exact live subagent
 * tree root: the runtime's first line is `if (this.rootOf(root) !== root)
 * return false`, and `rootOf` throws `UNAUTHORIZED` ("agent has no active
 * runtime owner") for a subagent-origin session outside manager residency.
 * The cold-resume drive child is exactly such an agent — it materializes
 * through the agents service, bypassing the manager — so calling
 * `waitForTreeWork` with it would either throw or silently resolve `false`
 * for a member, dropping the descendant join. Its root must therefore be
 * resolved through the runtime's own `rootOf`; when that throws, no
 * manager-owned tree exists beneath the child at all.
 */
export function nativeChildWorkJoinRoot(ctx: Context, parent: Agent): Agent | undefined {
  const runtime = ctx.subagents as unknown as {
    waitForTreeWork?: unknown
    waitForChildren?: unknown
    rootOf?: (agent: Agent) => Agent
  }
  if (typeof runtime.waitForTreeWork !== 'function') {
    // pre-rc.2: `waitForChildren` joins by lineage below any parent.
    return typeof runtime.waitForChildren === 'function' ? parent : undefined
  }
  if (typeof runtime.rootOf !== 'function') return undefined
  try {
    return runtime.rootOf(parent)
  } catch {
    // No active runtime owner (or the agent is not exact-live): no manager-
    // owned tree to join — the legacy event-driven join stands in.
    return undefined
  }
}

/**
 * Join progressing descendant work below `parent` without cancelling it.
 * `root` is the native join target from {@link nativeChildWorkJoinRoot}:
 * rc.2 hosts join through `waitForTreeWork(root)` — the exact live tree root,
 * never the member itself (a member resolves `false` there and a non-resident
 * agent makes the runtime throw); pre-rc.2 lines through `waitForChildren`.
 * Resolves `false` when the host exposes no usable native join (the caller
 * falls back to {@link createLegacyDescendantJoin}).
 */
export async function waitForChildWork(ctx: Context, parent: Agent, root?: Agent): Promise<boolean> {
  const runtime = ctx.subagents as unknown as {
    waitForTreeWork?: (root: Agent) => Promise<boolean>
    waitForChildren?: (parent: Agent) => Promise<boolean>
  }
  if (typeof runtime.waitForTreeWork === 'function') {
    const joinRoot = root ?? nativeChildWorkJoinRoot(ctx, parent)
    return joinRoot === undefined ? false : runtime.waitForTreeWork(joinRoot)
  }
  if (typeof runtime.waitForChildren === 'function') return runtime.waitForChildren(parent)
  return false
}

// ---------------------------------------------------------------------------
// Out-of-band child composition (activation hosts)
// ---------------------------------------------------------------------------
//
// The 0.2.0 line carries a fresh child's `persona` and `toolFilter` inline in
// the start request; the 0.2.1 line removed both fields from
// `SubagentStartRequest` (composition moved to host agent presets). This
// plugin keeps its markdown-file semantics without presets: each fresh
// dispatch reserves the child's durable id and parks its composition here,
// and `installChildCompositionListener` installs it on the child's own agent
// scope at the `subagent/start` edge — the same window the host itself uses
// (`applyChildOverrides` runs during creation setup, before the first prompt
// is queued), so the persona shadows the deployment persona for that child
// alone and the leaf restriction lands before the first prompt assembly.

/** A fresh custom-agent child's persona and optional leaf tool scoping. */
export interface ChildComposition {
  readonly persona: string
  readonly toolFilter?: ToolRestriction
}

/** The start-request shape this plugin dispatches: the host fields plus the inline composition the 0.2.0 line reads. */
export type DispatchRequest = Omit<SubagentStartRequest, 'label' | 'signal'> & ChildComposition

const pendingChildCompositions = new Map<SessionId, { composition: ChildComposition; parentId: SessionId }>()

/**
 * Park the composition a fresh activation-host dispatch installs on its child
 * at the start edge. The entry lives until the delegating parent session is
 * disposed: an activation-model child materializes a fresh agent scope per
 * run, so the composition must survive every per-run settlement and stay
 * available for each later wake.
 */
export function reserveChildComposition(childId: SessionId, parentId: SessionId, composition: ChildComposition): void {
  pendingChildCompositions.set(childId, { composition, parentId })
}

/** Drop a reserved composition whose dispatch failed before the start edge. */
export function releaseChildComposition(childId: SessionId): void {
  pendingChildCompositions.delete(childId)
}

/** The persona section name and order the host itself uses for a child's shadowing persona (`applyChildOverrides`, the dsh-persona preset row). */
const CHILD_PERSONA_SECTION = 'deployment:persona-prefix'

/** Install one child's persona section and leaf scoping on its own agent scope. */
function installChildComposition(child: Agent, composition: ChildComposition): void {
  child.ctx.systemPrompt.section({
    name: CHILD_PERSONA_SECTION,
    order: child.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    text: composition.persona,
  })
  if (composition.toolFilter !== undefined) child.ctx.tools.restrict(composition.toolFilter)
}

/**
 * Install this plugin's reserved child compositions on activation hosts.
 * Returns a no-op disposer on legacy hosts (the 0.2.0 line keeps the inline
 * request fields, so nothing is parked and no start edge can match a reserved
 * id). The activation model materializes a fresh agent scope for every run of
 * a parked child — first dispatch, each follow-up wake, each manager-driven
 * resume — and agent-scoped contributions unwind with that scope, so the
 * listener re-installs the composition at every start edge of a reserved
 * child (mirroring the host's own per-materialization composition) and prunes
 * the reservation when the delegating parent session is disposed.
 */
export function installChildCompositionListener(ctx: Context): () => void {
  if (typeof ctx.subagents.startActivation !== 'function') return () => {}
  const releases = [
    ctx.on('subagent/start', (info: SubagentRunInfo) => {
      const reserved = pendingChildCompositions.get(info.id)
      if (reserved === undefined) return
      const child = ctx.agents.get(info.id)
      if (child === undefined) return
      installChildComposition(child, reserved.composition)
    }),
    // Prune when the delegating parent session is disposed (its children are
    // drained and disposed with it). The child's own `agent/disposed` fires at
    // every run settlement — pruning there would drop the composition a later
    // wake still needs.
    ctx.on('agent/disposed', (payload: { agent: Agent }) => {
      for (const [childId, reserved] of pendingChildCompositions) {
        if (reserved.parentId === payload.agent.id) pendingChildCompositions.delete(childId)
      }
    }),
  ]
  return () => {
    for (const release of releases) release()
  }
}

/** Drain exactly this forest, preserving the service receiver on both hosts. */
export function drainRunDescendants(ctx: Context, root: Agent): Promise<void> {
  const runtime = ctx.subagents as unknown as {
    drainDescendants?: (parents: readonly Agent[]) => Promise<void>
    waitForTreeWork?: unknown
    rootOf?: (agent: Agent) => Agent
  }
  if (typeof runtime.drainDescendants !== 'function') return legacySubagents(ctx).drainContinuableDescendants([root])
  if (typeof runtime.waitForTreeWork === 'function' && typeof runtime.rootOf === 'function') {
    // rc.2 drains exact live subagent tree roots: a resident member is
    // ignored there, but the manager's `rootOf` throws UNAUTHORIZED for an
    // agent with no active runtime owner — the cold-resume drive child,
    // which materializes outside manager residency. Nothing manager-owned
    // can exist beneath such an agent, so there is nothing to drain.
    try {
      if (runtime.rootOf(root) !== root) return Promise.resolve()
    } catch {
      return Promise.resolve()
    }
  }
  return runtime.drainDescendants([root])
}

/** Install before driving the root; lifecycle edges also cover uncataloged external runs. */
export function createLegacyDescendantJoin(ctx: Context, signal: AbortSignal): {
  wait(root: Agent): Promise<void>
  dispose(): void
} {
  const nextPulse = () => {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    return { promise, resolve }
  }
  let pulse = nextPulse()
  const wake = () => { pulse.resolve(); pulse = nextPulse() }
  const epochs = new Map<SubagentRunInfo['runId'], SubagentRunInfo & { parent?: Agent }>()
  const releases: (() => void)[] = []
  try {
    releases.push(ctx.on('subagent/start', function (info) {
      const key = carrierKeyOf(this) as Agent | undefined
      const parent = key !== undefined && ctx.agents.get(key.id) === key ? key : undefined
      epochs.set(info.runId, { ...info, parent })
      wake()
    }))
    releases.push(ctx.on('subagent/end', (info) => {
      const start = epochs.get(info.runId)
      if (start?.id === info.id) epochs.delete(info.runId)
      wake()
    }))
    releases.push(ctx.on('agent/status', wake), ctx.on('agent/inbox/inserted', wake),
      ctx.on('agent/inbox/claimed', wake), ctx.on('agent/inbox/discarded', wake),
      ctx.on('agent/disposed', wake))
    signal.addEventListener('abort', wake)
  } catch (error) {
    for (const release of releases) release()
    throw error
  }
  const dispose = () => {
    signal.removeEventListener('abort', wake)
    for (const release of releases.splice(0)) release()
  }
  return {
    dispose,
    async wait(root) {
      while (true) {
        signal.throwIfAborted()
        // Capture before all asynchronous reads, including whenIdle: no lost terminal edge.
        const observation = pulse
        const seq = root.session.seq
        const rows = await legacySubagents(ctx).listDescendants(root.id, signal)
        signal.throwIfAborted()
        const diagnostic = rows.find(row => row.kind === 'diagnostic')
        if (diagnostic) throw new Error(`cannot join subagent ${String(diagnostic.id)}: ${diagnostic.reason}`)
        const live = new Map<SessionId, Agent>()
        for (const row of rows) {
          const child = ctx.agents.get(row.id)
          if (child === undefined) continue
          if (child.session.header.parentSession !== row.parentId) throw new Error('descendant belongs to another parent')
          live.set(row.id, child)
        }
        const idle = Promise.all([root.whenIdle(), ...[...live.values()].map(child => child.whenIdle())])
        const settled = await Promise.race([idle.then(() => true), observation.promise.then(() => false)])
        signal.throwIfAborted()
        if (!settled || pulse !== observation) continue
        // Re-read publication and exact live identities after whole-agent quiescence.
        const current = await legacySubagents(ctx).listDescendants(root.id, signal)
        signal.throwIfAborted()
        const unavailable = current.find(row => row.kind === 'diagnostic')
        if (unavailable) throw new Error(`cannot join subagent ${String(unavailable.id)}: ${unavailable.reason}`)
        if (pulse !== observation || root.status !== 'idle' || root.session.seq !== seq
          || current.length !== rows.length || current.some((row, i) => row.id !== rows[i].id || row.parentId !== rows[i].parentId)
          || rows.some(row => ctx.agents.get(row.id) !== live.get(row.id))) continue
        const retained = new Set<SessionId>()
        for (const row of current) {
          const child = live.get(row.id)
          if (row.mode === 'continuable' && child?.status === 'idle'
            && (child.inbox.nextTurn.length > 0 || child.inbox.nextStep.length > 0)) retained.add(row.id)
        }
        // A parked continuable holds its continuable ancestors resident; still scan every grandchild.
        for (const row of [...current].reverse()) {
          if (retained.has(row.id) && current.some(parent => parent.id === row.parentId && parent.mode === 'continuable')) {
            retained.add(row.parentId)
          }
        }
        let pending = current.some(row => {
          const child = live.get(row.id)
          return child !== undefined && (child.status !== 'idle'
            || row.mode === 'continuable' && !retained.has(row.id))
        })
        const descendants = new Set([root.id, ...current.map(row => row.id)])
        let added: boolean
        do {
          added = false
          for (const epoch of epochs.values()) {
            if (epoch.parent && descendants.has(epoch.parent.id) && !descendants.has(epoch.id)) {
              descendants.add(epoch.id)
              added = true
            }
          }
        } while (added)
        for (const epoch of epochs.values()) {
          if (epoch.id === root.id) continue
          if (!epoch.parent) {
            if (descendants.has(epoch.id)) throw new Error('cannot join subagent lifecycle without an exact scoped parent')
            continue
          }
          if (!descendants.has(epoch.parent.id)) continue
          if (!epoch.local || !live.has(epoch.id) || current.some(row => row.id === epoch.id && row.mode === 'continuable')
            && !retained.has(epoch.id)) pending = true
        }
        if (!pending) {
          await Promise.race([root.whenIdle(), observation.promise])
          signal.throwIfAborted()
          if (pulse === observation && root.status === 'idle' && root.session.seq === seq) return
          continue
        }
        await observation.promise
      }
    },
  }
}
