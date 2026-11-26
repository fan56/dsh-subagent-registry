import { recordRegistryChild, releaseRegistryChild } from "./caller-guard.js";
export const legacySubagents = (ctx) => ctx.subagents;
// ---------------------------------------------------------------------------
// The 0.2.2-rc.2 child surface
// ---------------------------------------------------------------------------
//
// The 0.2.2-rc.2 wave reshaped the child seams; every reshape keeps a
// cross-generation reading here:
//   1. `SubagentActivationSpec` flattened: the nested `request` object now
//      rides the spec itself (the spec extends
//      `Omit<SubagentStartRequest, 'label' | 'signal'>`).
//   2. `SubagentRuntime.listChildren(parentId)` is gone. The direct-child read
//      becomes `listDescendants(parentId)` cut to the `depth === 1` rows: the
//      stable pre-order keeps the parent catalog's event order at depth 1, so
//      the pickers' "last match wins" semantics survive unchanged.
//   3. `ResumeAgentOptions.parentAgent` was removed — agent ownership now
//      follows the calling context. A carried `parentAgent` key is inert on
//      rc.2 while pre-rc.2 lines REQUIRE it.
//
// `waitForTreeWork` is the runtime probe for the whole wave: it first exists
// in 0.2.2-rc.2 (rc.1 still carried waitForChildren/listChildren and the
// nested spec), and the reshapes shipped together in that release. The probe
// is structural only — it selects the flattened spec and catalog read, never
// a descendant join (this plugin does not support nested subagents).
/** Whether the host's subagents service speaks the 0.2.2-rc.2 child surface. */
export function rc2ChildSurface(ctx) {
    return typeof ctx.subagents.waitForTreeWork === 'function';
}
/**
 * Read the parent's durable direct-child catalog in catalog event order.
 * Pre-rc.2 hosts answer through `SubagentRuntime.listChildren`; rc.2 hosts
 * through `listDescendants(parentId)` cut to the depth-1 rows (every row
 * carries its `depth`; the pre-order keeps the parent catalog's order).
 */
export async function listDirectChildren(ctx, parentId, signal) {
    if (!rc2ChildSurface(ctx)) {
        const legacy = legacySubagents(ctx);
        if (typeof legacy.listChildren !== 'function')
            throw new Error('the subagents service exposes no child catalog read');
        return [...(await legacy.listChildren(parentId, signal))];
    }
    const rows = await ctx.subagents.listDescendants(parentId, signal);
    return rows.filter((row) => row.kind === 'child' && row.depth === 1);
}
const pendingChildCompositions = new Map();
/**
 * Park the composition a fresh activation-host dispatch installs on its child
 * at the start edge. The entry lives until the delegating parent session is
 * disposed: an activation-model child materializes a fresh agent scope per
 * run, so the composition must survive every per-run settlement and stay
 * available for each later wake.
 */
export function reserveChildComposition(childId, parentId, composition) {
    pendingChildCompositions.set(childId, { composition, parentId });
    recordRegistryChild(childId);
}
/** Drop a reserved composition whose dispatch failed before the start edge. */
export function releaseChildComposition(childId) {
    pendingChildCompositions.delete(childId);
    releaseRegistryChild(childId);
}
/** The persona section name and order the host itself uses for a child's shadowing persona (`applyChildOverrides`, the dsh-persona preset row). */
const CHILD_PERSONA_SECTION = 'deployment:persona-prefix';
/** Install one child's persona section and tool scoping on its own agent scope. */
function installChildComposition(child, composition) {
    child.ctx.systemPrompt.section({
        name: CHILD_PERSONA_SECTION,
        order: child.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
        text: composition.persona,
    });
    if (composition.toolFilter !== undefined)
        child.ctx.tools.restrict(composition.toolFilter);
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
export function installChildCompositionListener(ctx) {
    if (typeof ctx.subagents.startActivation !== 'function')
        return () => { };
    const releases = [
        ctx.on('subagent/start', (info) => {
            const reserved = pendingChildCompositions.get(info.id);
            if (reserved === undefined)
                return;
            const child = ctx.agents.get(info.id);
            if (child === undefined)
                return;
            installChildComposition(child, reserved.composition);
        }),
        // Prune when the delegating parent session is disposed (its children are
        // disposed with it). The child's own `agent/disposed` fires at every run
        // settlement — pruning there would drop the composition a later wake
        // still needs.
        ctx.on('agent/disposed', (payload) => {
            for (const [childId, reserved] of pendingChildCompositions) {
                if (reserved.parentId === payload.agent.id) {
                    pendingChildCompositions.delete(childId);
                    releaseRegistryChild(childId);
                }
            }
        }),
    ];
    return () => {
        for (const release of releases)
            release();
    };
}
//# sourceMappingURL=host-compat.js.map