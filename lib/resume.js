/** Foreground recall, with managed fresh dispatch and a scoped cold-resume driver. */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { foldConsumedWork } from '@deepseek-ai/dsh-agent';
import { createLegacyDescendantJoin, drainRunDescendants } from "./host-compat.js";
import { applyChildComposition, finalAssistantOutput, resolveChildAgentOptions, resolveChildDepth, } from '@deepseek-ai/dsh-subagent';
/** Map a `turn/end` reason kind to the subagent seam's stop vocabulary. */
export function toStopReason(kind) {
    switch (kind) {
        case 'completed': return 'completed';
        case 'max-tokens': return 'max-tokens';
        case 'aborted': return 'aborted';
        case 'blocked': return 'refusal';
        default: return 'error';
    }
}
/** The `turn/end` reason kind of one event, when it is one. */
function turnEndKind(event) {
    const reason = event?.data?.reason;
    return typeof reason?.kind === 'string' ? reason.kind : undefined;
}
/** Human phrase for how a prior run's last turn ended. */
export function describeTurnEnd(kind) {
    switch (kind) {
        case 'completed': return 'the model finished its turn normally';
        case 'aborted': return 'the run was cancelled before it could finish';
        case 'blocked': return 'the model declined to continue';
        case 'error': return 'the turn failed with an error';
        case 'max-tokens': return 'the turn hit its output-token limit before finishing';
        case 'interrupted': return 'the host process died mid-turn (crash-interrupted)';
        default: return 'the log ends with no recorded turn result (interrupted)';
    }
}
/** The last `turn/end` event, or undefined when the log records none. */
export function lastTurnEnd(events) {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'turn/end')
            return events[i];
    }
    return undefined;
}
/**
 * The log's accounting `turn/end` — the last closed turn that actually did
 * work — folded exactly the way the one-shot driver reads a child's outcome
 * (`foldConsumedWork`). Reading the raw last `turn/end` instead would let a
 * trailing no-op turn (a rejected or rewritten-away step) mask the real
 * ending.
 */
export function accountingTurnEnd(events) {
    return foldConsumedWork(events).end;
}
/**
 * Classify a prior run from its persisted events: a run is resumable unless
 * its last ACCOUNTING turn ended `completed` — a mid-log failure followed by a
 * later success means the run as a whole finished, and a trailing no-op turn
 * must not mask the real ending. A log with no accounting turn at all (crash
 * before any turn closed over work) counts as interrupted.
 */
export function classifyPriorRun(events) {
    let turnCount = 0;
    for (const event of events) {
        if (event.type === 'turn/end')
            turnCount += 1;
    }
    const work = foldConsumedWork(events);
    const openTurns = new Set();
    for (const event of events) {
        const turn = event.data?.turn;
        if (event.type === 'turn/start')
            openTurns.add(turn);
        if (event.type === 'turn/end')
            openTurns.delete(turn);
    }
    const kind = work.droppedUnrun ? 'aborted' : openTurns.size > 0 ? 'interrupted' : turnEndKind(work.end);
    return {
        status: kind === 'completed' ? 'completed' : 'resumable',
        endedAs: describeTurnEnd(kind),
        turnCount,
    };
}
/** Durable namespace separates managed foreground children from background conversations. */
export const foregroundLabel = (label) => `[use_agent foreground] ${label}`;
export function pickLatestLabeledChild(entries, label) {
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!(entry.mode === 'one-shot' && entry.label === label)
            && !(entry.mode === 'continuable' && entry.label === foregroundLabel(label)))
            continue;
        return entry;
    }
    return undefined;
}
/**
 * Decide resume vs fresh. `explicitFresh` always wins; `off` disables resume
 * entirely; `explicitResume` demands a candidate and fails loudly without
 * one; plain `auto` resumes whenever a candidate exists, `opt-in` only when
 * asked.
 */
export function decideResume(mode, options) {
    if (options.explicitFresh === true)
        return 'fresh';
    if (mode === 'off')
        return 'fresh';
    if (options.explicitResume === true) {
        return options.hasCandidate ? 'resume' : 'explicit-resume-unavailable';
    }
    if (mode === 'opt-in')
        return 'fresh';
    return options.hasCandidate ? 'resume' : 'fresh';
}
/**
 * The single follow-up message that continues a resumed child. The child's
 * context already holds the original task and its own partial work; the
 * prompt only has to point the model at that and forbid redoing finished
 * steps. When the new `use_agent` call carried a task text, it is appended so
 * the child can reconcile a reworded (or revised) request against the
 * original task itself.
 */
export function buildContinuationPrompt(endedAs, callerPrompt) {
    const head = `Your previous attempt at this task stopped before it finished: ${endedAs}. ` +
        'The conversation above already contains the original task and all the work you completed before the interruption. ' +
        'Continue exactly where you left off: review what you already did, finish the remaining work without redoing completed steps, ' +
        'and then produce your final result message as usual.';
    if (callerPrompt === undefined || callerPrompt.trim() === '')
        return head;
    return (`${head}\n\n` +
        'The caller submitted this request with the re-dispatch (it is usually the same task restated; ' +
        'if it genuinely differs from the original task above, finish or wrap up the original work first and say so):\n' +
        callerPrompt);
}
/**
 * Fetch the deployment's session persistence, or undefined in a bare context.
 * Read through an untyped `get` so this plugin never hard-depends on the
 * service being mounted.
 */
export function getPersistence(ctx) {
    return ctx.get('sessionPersistence');
}
/**
 * Read stored events through a read handle — the whole log by default, the
 * suffix from `offset` when given. Returns undefined when the log is
 * unreadable (persistence absent, session missing, decode failure); every
 * strict resume lookup propagates failures; best-effort reply observation
 * returns undefined. The handle is always closed.
 */
export async function readStoredEvents(ctx, id, options = {}) {
    const persistence = getPersistence(ctx);
    if (persistence === undefined)
        return undefined;
    let handle;
    try {
        handle = await persistence.open(id, 'read', { signal: options.signal });
    }
    catch (error) {
        options.signal?.throwIfAborted();
        if (options.strict)
            throw error;
        return undefined;
    }
    try {
        const { events } = await handle.read(options.offset, undefined, { signal: options.signal });
        return events;
    }
    catch (error) {
        options.signal?.throwIfAborted();
        if (options.strict)
            throw error;
        return undefined;
    }
    finally {
        if (options.strict)
            await handle.close();
        else
            await handle.close().catch(() => { });
    }
}
/** Select the latest foreground run; unreadable or busy candidates must not create duplicate work. */
export async function findResumableRun(ctx, parent, label, signal) {
    signal?.throwIfAborted();
    const entries = await ctx.subagents.listChildren(parent.id, signal);
    const candidate = pickLatestLabeledChild(entries, label);
    if (candidate === undefined)
        return undefined;
    // Read the live agent registry without a hard dependency (a bare context —
    // tests, exotic deployments — may omit the service).
    const agents = ctx.get('agents');
    if (agents?.get(candidate.id) !== undefined)
        throw new Error('subagent resume is already in progress');
    const events = await readStoredEvents(ctx, candidate.id, { signal, strict: true });
    if (events === undefined)
        throw new Error('cannot inspect the prior subagent run; pass fresh=true to start a new run');
    const classification = classifyPriorRun(events);
    if (classification.status !== 'resumable')
        return undefined;
    return { childId: candidate.id, mode: candidate.mode, classification };
}
/**
 * Resume one persisted one-shot child and drive exactly one continuation
 * turn, then dispose. Mirrors the in-process one-shot driver
 * (`drivePublishedRun`): signal handoff via `child.cancel`, result read from
 * the session events appended after the resume boundary, and settle-before-
 * dispose so a disposal failure never masks the run outcome (and vice versa).
 */
const resumingChildren = new Set();
export async function driveResumedRun(input) {
    if (resumingChildren.has(input.childId))
        throw new Error('subagent resume is already in progress');
    resumingChildren.add(input.childId);
    let releaseParent;
    try {
        const lifecycle = new AbortController();
        releaseParent = input.parent.ctx?.effect(() => () => lifecycle.abort());
        const signal = AbortSignal.any([input.signal, lifecycle.signal]);
        return await driveLegacyResume({ ...input, signal });
    }
    finally {
        try {
            releaseParent?.();
        }
        finally {
            resumingChildren.delete(input.childId);
        }
    }
}
// ponytail: foreground resume is outside manager capacity/interrupt; migrate when host supports caller-delivery cold resume with composition overrides.
async function driveLegacyResume(input) {
    const { ctx, parent, childId, signal } = input;
    signal.throwIfAborted();
    const childDepth = resolveChildDepth(parent, undefined);
    const handle = await ctx.agents.resume({
        resumeSessionId: childId,
        parentAgent: parent,
        agentOptions: resolveChildAgentOptions(parent, input.agentOptions, childDepth),
        signal,
        setup: (childCtx, child) => {
            if (child.session.header.parentSession !== parent.id)
                throw new Error('resume target belongs to another parent');
            // Cold resume replays the persisted log but not the composition: the
            // one-shot descriptor keeps no persona, so re-apply exactly what a
            // fresh dispatch would (persona section + leaf tool scoping).
            applyChildComposition(childCtx, parent, { persona: input.persona, toolFilter: input.toolFilter });
            return { commit() {
                    signal.throwIfAborted();
                    if (ctx.agents.get(parent.id) !== parent)
                        throw new Error('resume requires the exact live parent');
                } };
        },
    });
    const child = handle.agent;
    let join;
    let drain;
    const drainDescendants = () => drain ??= Promise.resolve().then(() => drainRunDescendants(ctx, child));
    const dispose = async () => {
        const [descendants] = await Promise.allSettled([drainDescendants()]);
        const [handleDisposed] = await Promise.allSettled([handle.dispose()]);
        const errors = [descendants, handleDisposed].flatMap((r) => r.status === 'rejected' ? [r.reason] : []);
        if (errors.length > 0)
            throw new AggregateError(errors, 'resumed subagent cleanup failed: ' + errors.map(String).join('; '));
    };
    const flags = { cancelled: false };
    const onAbort = () => {
        flags.cancelled = true;
        child.cancel({ kind: 'parent' });
        void drainDescendants().catch(() => { });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted)
        onAbort();
    let outcome;
    try {
        // Everything the replay loaded is prior work; the continuation turn's
        // own events start at this boundary. The on-demand read (the session's
        // `snapshotEvents(fromSeq)`) keeps the window offset-addressed instead
        // of relying on array indices coinciding with log offsets. The read is
        // @deprecated on 0.1.7 (soft; replacement = persistence-handle reads)
        // but stays here: the result read of the just-driven turn must observe
        // the live child before disposal and fail identically in bare contexts
        // without persistence.
        const boundary = child.session.seq;
        if (typeof ctx.subagents.waitForChildren !== 'function')
            join = createLegacyDescendantJoin(ctx, signal);
        if (!flags.cancelled) {
            child.followup(createUserMessage({
                content: [{ type: 'text', text: input.continuationPrompt }],
                source: {
                    kind: 'dsh-subagent-registry',
                    form: 'notice',
                    summary: input.noticeSummary.slice(0, 120),
                },
            }));
            // Inbox listeners may cancel synchronously before followup wakes its driver.
            if (signal.aborted)
                onAbort();
            if (join) {
                try {
                    await join.wait(child);
                }
                catch (error) {
                    if (!signal.aborted)
                        throw error;
                    await child.whenIdle();
                }
            }
            else {
                while (true) {
                    await child.whenIdle();
                    const seq = child.session.seq;
                    await ctx.subagents.waitForChildren(child);
                    if (child.status === 'idle' && child.session.seq === seq)
                        break;
                }
            }
        }
        const own = child.session.snapshotEvents(boundary);
        const output = finalAssistantOutput(own) ?? [];
        const recorded = toStopReason(turnEndKind(accountingTurnEnd(own)));
        outcome = {
            output,
            stopReason: flags.cancelled ? 'aborted' : recorded,
        };
    }
    catch (error) {
        // A failed drive still disposes; a disposal failure never masks it.
        const [disposal] = await Promise.allSettled([dispose()]);
        signal.removeEventListener('abort', onAbort);
        join?.dispose();
        if (disposal.status === 'rejected') {
            throw new AggregateError([error, disposal.reason], `resumed subagent run failed: ${String(error)}; dispose failed: ${String(disposal.reason)}`);
        }
        throw error;
    }
    signal.removeEventListener('abort', onAbort);
    join?.dispose();
    await dispose();
    return outcome;
}
//# sourceMappingURL=resume.js.map