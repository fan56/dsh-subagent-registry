import { carrierKeyOf } from '@deepseek-ai/dsh-scope';
export const legacySubagents = (ctx) => ctx.subagents;
/** Drain exactly this forest, preserving the service receiver on both hosts. */
export function drainRunDescendants(ctx, root) {
    return typeof ctx.subagents.drainDescendants === 'function'
        ? ctx.subagents.drainDescendants([root])
        : legacySubagents(ctx).drainContinuableDescendants([root]);
}
/** Install before driving the root; lifecycle edges also cover uncataloged external runs. */
export function createLegacyDescendantJoin(ctx, signal) {
    const nextPulse = () => {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        return { promise, resolve };
    };
    let pulse = nextPulse();
    const wake = () => { pulse.resolve(); pulse = nextPulse(); };
    const epochs = new Map();
    const releases = [];
    try {
        releases.push(ctx.on('subagent/start', function (info) {
            const key = carrierKeyOf(this);
            const parent = key !== undefined && ctx.agents.get(key.id) === key ? key : undefined;
            epochs.set(info.runId, { ...info, parent });
            wake();
        }));
        releases.push(ctx.on('subagent/end', (info) => {
            const start = epochs.get(info.runId);
            if (start?.id === info.id)
                epochs.delete(info.runId);
            wake();
        }));
        releases.push(ctx.on('agent/status', wake), ctx.on('agent/inbox/inserted', wake), ctx.on('agent/inbox/claimed', wake), ctx.on('agent/inbox/discarded', wake), ctx.on('agent/disposed', wake));
        signal.addEventListener('abort', wake);
    }
    catch (error) {
        for (const release of releases)
            release();
        throw error;
    }
    const dispose = () => {
        signal.removeEventListener('abort', wake);
        for (const release of releases.splice(0))
            release();
    };
    return {
        dispose,
        async wait(root) {
            while (true) {
                signal.throwIfAborted();
                // Capture before all asynchronous reads, including whenIdle: no lost terminal edge.
                const observation = pulse;
                const seq = root.session.seq;
                const rows = await legacySubagents(ctx).listDescendants(root.id, signal);
                signal.throwIfAborted();
                const diagnostic = rows.find(row => row.kind === 'diagnostic');
                if (diagnostic)
                    throw new Error(`cannot join subagent ${String(diagnostic.id)}: ${diagnostic.reason}`);
                const live = new Map();
                for (const row of rows) {
                    const child = ctx.agents.get(row.id);
                    if (child === undefined)
                        continue;
                    if (child.session.header.parentSession !== row.parentId)
                        throw new Error('descendant belongs to another parent');
                    live.set(row.id, child);
                }
                const idle = Promise.all([root.whenIdle(), ...[...live.values()].map(child => child.whenIdle())]);
                const settled = await Promise.race([idle.then(() => true), observation.promise.then(() => false)]);
                signal.throwIfAborted();
                if (!settled || pulse !== observation)
                    continue;
                // Re-read publication and exact live identities after whole-agent quiescence.
                const current = await legacySubagents(ctx).listDescendants(root.id, signal);
                signal.throwIfAborted();
                const unavailable = current.find(row => row.kind === 'diagnostic');
                if (unavailable)
                    throw new Error(`cannot join subagent ${String(unavailable.id)}: ${unavailable.reason}`);
                if (pulse !== observation || root.status !== 'idle' || root.session.seq !== seq
                    || current.length !== rows.length || current.some((row, i) => row.id !== rows[i].id || row.parentId !== rows[i].parentId)
                    || rows.some(row => ctx.agents.get(row.id) !== live.get(row.id)))
                    continue;
                const retained = new Set();
                for (const row of current) {
                    const child = live.get(row.id);
                    if (row.mode === 'continuable' && child?.status === 'idle'
                        && (child.inbox.nextTurn.length > 0 || child.inbox.nextStep.length > 0))
                        retained.add(row.id);
                }
                // A parked continuable holds its continuable ancestors resident; still scan every grandchild.
                for (const row of [...current].reverse()) {
                    if (retained.has(row.id) && current.some(parent => parent.id === row.parentId && parent.mode === 'continuable')) {
                        retained.add(row.parentId);
                    }
                }
                let pending = current.some(row => {
                    const child = live.get(row.id);
                    return child !== undefined && (child.status !== 'idle'
                        || row.mode === 'continuable' && !retained.has(row.id));
                });
                const descendants = new Set([root.id, ...current.map(row => row.id)]);
                let added;
                do {
                    added = false;
                    for (const epoch of epochs.values()) {
                        if (epoch.parent && descendants.has(epoch.parent.id) && !descendants.has(epoch.id)) {
                            descendants.add(epoch.id);
                            added = true;
                        }
                    }
                } while (added);
                for (const epoch of epochs.values()) {
                    if (epoch.id === root.id)
                        continue;
                    if (!epoch.parent) {
                        if (descendants.has(epoch.id))
                            throw new Error('cannot join subagent lifecycle without an exact scoped parent');
                        continue;
                    }
                    if (!descendants.has(epoch.parent.id))
                        continue;
                    if (!epoch.local || !live.has(epoch.id) || current.some(row => row.id === epoch.id && row.mode === 'continuable')
                        && !retained.has(epoch.id))
                        pending = true;
                }
                if (!pending) {
                    await Promise.race([root.whenIdle(), observation.promise]);
                    signal.throwIfAborted();
                    if (pulse === observation && root.status === 'idle' && root.session.seq === seq)
                        return;
                    continue;
                }
                await observation.promise;
            }
        },
    };
}
//# sourceMappingURL=host-compat.js.map