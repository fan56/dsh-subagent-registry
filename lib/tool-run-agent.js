/**
 * The `use_agent` tool: delegates to a locally-defined custom agent by name.
 *
 * The roster (available agent names + sanitized descriptions) is read once at
 * tool-definition time so the tool's static description lets the main
 * conversation model pick an agent by name. At execute time the target
 * `<agents-dir>/<name>.md` is re-read, its frontmatter `model` (a
 * `provider/model` route) is split into `agentOptions`, and its body is
 * passed as the child's `persona`. The effective model/thinking are the
 * COMPOSED runtime (see ./profile-resolution.ts): the frontmatter is the
 * baseline, and a workspace profile pin may override it per agent. The
 * delegation runs through the already-assembled `spawn` subagent provider
 * (same single-instance realm dsh uses), so the child is a real dsh
 * subagent with its own system prompt.
 *
 * When the same agent was already run in this conversation and that run was
 * interrupted (error, cancellation, crash, token limit), the tool instead
 * resumes the persisted child session and continues it from its partial work
 * (see `./resume.ts`), unless the caller passes `fresh: true`.
 *
 * @module dsh-subagent-registry/tool-run-agent
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveChildDepth, finalAssistantOutput } from '@deepseek-ai/dsh-subagent';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { createLegacyDescendantJoin, drainRunDescendants, legacySubagents } from "./host-compat.js";
import { expandHome, listAgentFiles, parseAgentMarkdown } from "./agents-dir.js";
import { composeAgentRuntime } from "./profile-resolution.js";
import { decideBackgroundMode } from "./interactive.js";
import { buildContinuationPrompt, decideResume, driveResumedRun, findResumableRun, foregroundLabel, accountingTurnEnd, readStoredEvents, toStopReason, } from "./resume.js";
/**
 * Every tool in the stock dsh base distribution that can start agents,
 * excluding this plugin's own configurable `use_agent` tool name (registered
 * separately through `RunAgentConfig.toolName`). `dsh-tool-workflow` fans work
 * out across many subagents and `dsh-tool-ralph` starts a fresh child every
 * round, so both are agent-spawning even though they are not `subagent`-named;
 * `send_message`/`interrupt_agent`/`list_agents` only address already-running
 * children, so a leaf cannot abuse them to spawn and they stay visible.
 */
export const SPAWN_TOOL_NAMES = [
    // dsh-base patch: dsh-tool-subagent registered twice with these toolNames.
    'subagent',
    'subagent_fork',
    // dsh-base patch: dsh-tool-workflow (toolName default 'workflow', spawn).
    'workflow',
    // dsh-base patch: dsh-tool-ralph (fixed tool name 'ralph', fresh children).
    'ralph',
];
/**
 * The deny list installed on a `deep: 0` (leaf) agent's child, both at fresh
 * dispatch and again at resume: an explicit non-empty `leafDenyTools` replaces
 * the default (every agent-spawning tool in the dsh base distribution plus
 * this plugin's own `toolName`).
 *
 * `hostKnown` is the host's currently-registered global tool names (see
 * `resolveHostToolNames`); when provided, the DEFAULT list is intersected
 * with it. The stock spawn-tool names are a static enumeration over a
 * distribution whose composition moves — dsh 0.1.7-rc.1 stopped registering
 * `dsh-tool-ralph` while its `tools.restrict()` became fail-fast on unknown
 * names, so passing a stale default verbatim aborts the whole spawn. An
 * explicit `leafDenyTools` is NOT intersected: the caller owns that list and
 * the host's strict validation is the right feedback for a stale entry.
 */
export function leafDenyList(toolName, leafDenyTools, hostKnown) {
    if (leafDenyTools !== undefined && leafDenyTools.length > 0)
        return leafDenyTools;
    const defaults = [...SPAWN_TOOL_NAMES, toolName];
    return hostKnown ? defaults.filter(name => hostKnown.has(name)) : defaults;
}
/**
 * The names the host would accept in a `tools.restrict()` filter for the
 * plugin's own context — `ctx.tools.view().restrictableNames`, read
 * defensively: older hosts may lack `view()`, and anything unexpected here
 * must degrade to "pass the default list verbatim" (the pre-0.1.7 behavior),
 * never to "deny nothing".
 */
export function resolveHostToolNames(ctx, scope) {
    try {
        // `view` is private in the host's ToolRuntime typing but callable at
        // runtime; the double cast keeps this compilation-independent of it.
        const names = ctx.tools?.view?.(scope)?.restrictableNames;
        return names instanceof Set ? names : undefined;
    }
    catch {
        return undefined;
    }
}
/** Join text blocks from a canonical block array without trusting values. */
export function textOf(output) {
    return output
        .flatMap((block) => {
        if (typeof block !== 'object' || block === null)
            return [];
        const candidate = block;
        return candidate.type === 'text' && typeof candidate.text === 'string' ? [candidate.text] : [];
    })
        .join('');
}
/**
 * Sanitize a frontmatter `description` into clean display prose:
 * 1. drop the leading run of backslashes left by an escaped-quote residue
 *    (`\\\\"…"`), 2. peel one pair of surrounding quotes, 3. drop any stray
 *    backslashes, 4. drop a `>` wedged between two CJK characters (markdown
 *    blockquote artifact, e.g. `稳>定性`), 5. collapse whitespace.
 */
export function sanitizeDescription(raw) {
    let s = raw ?? '';
    s = s.replace(/^\\+/, '');
    s = s.trim();
    if (s.length >= 2) {
        const first = s[0];
        const last = s[s.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'"))
            s = s.slice(1, -1);
    }
    s = s.replace(/\\/g, '');
    s = s.replace(/([\u4e00-\u9fff]|[\u3400-\u4dbf])>([\u4e00-\u9fff]|[\u3400-\u4dbf])/g, '$1$2');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}
/** Build the static roster (agents already sorted by listAgentFiles). */
function buildRoster(dir) {
    const { agents, broken } = listAgentFiles(dir);
    const lines = agents.map((agent) => {
        const label = agent.meta.displayName !== undefined
            ? `${agent.meta.name} (${agent.meta.displayName})`
            : agent.meta.name;
        return `- ${label}: ${sanitizeDescription(agent.meta.description ?? '')}`;
    });
    const nameList = agents.map((agent) => agent.meta.name).join(', ');
    if (broken.length > 0) {
        lines.push(`- (unparsable agents excluded: ${broken.map((b) => b.path).join(', ')})`);
    }
    return { rosterText: lines.join('\n'), nameList };
}
/**
 * Split a dsh model route (`provider/model`) into `agentOptions`. Tolerant of
 * suffixes and unusual shapes (e.g. `deepseek-v4-flash（正式版）`): the first
 * slash splits provider from model and trailing parenthetical notes are kept
 * in the model string. A value without a slash yields provider-only routing.
 */
export function splitModel(model) {
    const value = model?.trim() ?? '';
    if (value === '')
        return {};
    const slash = value.indexOf('/');
    if (slash < 0)
        return { provider: value };
    return {
        provider: value.slice(0, slash).trim(),
        model: value.slice(slash + 1).trim(),
    };
}
/**
 * Build the one-shot subagent start request for one custom agent, encoding the
 * `deep` semantics:
 *
 * - `deep === 0` (leaf): the child must run but must not start any subagent.
 *   `maxDepth` is OMITTED (an absolute `maxDepth: 0` would fail the child's
 *   own start — `resolveChildDepth` rejects child depth 1 > 0), and a
 *   `toolFilter` deny list removes every agent-spawning tool from the child's
 *   registry (the in-process driver applies it as a scoped `tools.restrict()`
 *   in the creation window, so the tools vanish from the prompt AND refuse to
 *   execute). The child keeps its full non-spawn tool set.
 *
 * - `deep >= 1` (default 1): the child may start subagents. No `toolFilter`;
 *   `maxDepth` is set to the child's own absolute depth plus `deep`, a
 *   relative budget that can never reject the start (`childDepth <=
 *   childDepth + deep` always holds), while keeping the "deep = generations
 *   of spawns" reading: a `deep: 1` agent's children may themselves sit one
 *   level deeper before their own per-request caps take over as the
 *   recursion backstop. The host's native default — `3` in dsh ≤ 0.1.5,
 *   lowered to `1` from 0.1.6-alpha.1 (upstream B-04) — is never binding
 *   here, since this plugin always passes an explicit `maxDepth`.
 */
export function buildStartRequest(input) {
    const { agentName, prompt, parent, persona, deep, toolName, leafDenyTools, hostKnownTools, model, displayName, thinking } = input;
    // The child's absolute delegation depth, computed by the same authoritative
    // resolver the in-process driver uses (parent depth + 1, monotone floor).
    const childDepth = resolveChildDepth(parent, undefined);
    const modelOptions = model !== undefined ? splitModel(model) : {};
    // TODO(alpha): expose a frontmatter `maxTokens` → `agentOptions.maxTokens`
    //   (native since v0.1.2-alpha) alongside model/thinking.
    const routeOptions = {
        ...modelOptions,
        ...(thinking !== undefined ? { reasoningEffort: thinking } : {}),
    };
    const request = {
        label: displayName ?? agentName,
        prompt: [{ type: 'text', text: prompt }],
        parent: parent,
        persona,
        ...(deep === 0
            ? {
                // Leaf: strip every spawn capability; no maxDepth at all.
                toolFilter: {
                    deny: [...leafDenyList(toolName, leafDenyTools, hostKnownTools)],
                },
            }
            : {
                // Relative depth budget: childDepth + deep, never a start blocker.
                maxDepth: childDepth + deep,
            }),
        ...(Object.keys(routeOptions).length > 0 ? { agentOptions: routeOptions } : {}),
    };
    return request;
}
/** Caller cancellation owns accepted foreground work until teardown finishes. */
async function settleForegroundRun(ctx, run, agentName, signal) {
    let disposal;
    const dispose = () => disposal ??= Promise.resolve().then(() => run.dispose());
    const onAbort = () => {
        if (run.cancel)
            run.cancel();
        else
            void dispose().catch(() => { });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted)
        onAbort();
    const [execution] = await Promise.allSettled([
        run.result.then(async (result) => {
            if (result.stopReason !== 'completed') {
                const text = textOf(result.output);
                const headline = `${stopReasonError(String(result.stopReason))} (agent "${agentName}")`;
                const parts = [text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`];
                let diagnostic = result.diagnostic;
                if (!diagnostic && result.stopReason === 'error') {
                    try {
                        const events = await readStoredEvents(ctx, run.childId, { signal });
                        const end = events && accountingTurnEnd(events);
                        diagnostic = end?.data?.reason?.error?.message;
                    }
                    catch {
                        // Best-effort detail must not replace the original run failure.
                    }
                }
                if (diagnostic)
                    parts.push(`Child diagnostic: ${diagnostic}`);
                throw new Error(parts.join('\n'));
            }
            return result.output;
        }),
    ]);
    signal.removeEventListener('abort', onAbort);
    const [released] = await Promise.allSettled([dispose()]);
    if (execution.status === 'rejected') {
        if (released.status === 'rejected')
            throw new AggregateError([execution.reason, released.reason], `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(released.reason)}`);
        throw execution.reason;
    }
    if (released.status === 'rejected')
        throw released.reason;
    return execution.value;
}
/** rc.2's one-shot result precedes descendant settlement; read the live final suffix before release. */
async function startLegacyForeground(ctx, provider, request) {
    const join = createLegacyDescendantJoin(ctx, request.signal);
    try {
        const run = await legacySubagents(ctx).start(provider, request);
        const child = run.localAgent;
        if (!child) {
            join.dispose();
            return { childId: run.id, result: run.result, dispose: () => run.dispose() };
        }
        let drain;
        const drainDescendants = () => drain ??= Promise.resolve().then(() => drainRunDescendants(ctx, child));
        const cancel = () => {
            child.cancel({ kind: 'parent' });
            void drainDescendants().catch(() => { });
        };
        // Keep diagnostics live: cancellation stops/drains now, but disposal waits for the result read.
        const result = run.result.then(async (early) => {
            try {
                await join.wait(child);
            }
            catch (error) {
                if (!request.signal.aborted)
                    throw error;
                await child.whenIdle();
            }
            const own = child.session.snapshotEvents(child.session.inheritedEventCount);
            const end = accountingTurnEnd(own);
            const reason = end?.data?.reason;
            return {
                ...early,
                output: finalAssistantOutput(own) ?? [],
                stopReason: request.signal.aborted ? 'aborted' : toStopReason(reason?.kind),
                ...(reason?.error?.message ? { diagnostic: reason.error.message } : {}),
            };
        }).finally(() => join.dispose());
        return {
            childId: run.id,
            result,
            cancel,
            async dispose() {
                const [descendants] = await Promise.allSettled([drainDescendants()]);
                const [released] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
                const errors = [descendants, released].flatMap(r => r.status === 'rejected' ? [r.reason] : []);
                if (errors.length > 0)
                    throw new AggregateError(errors, 'subagent cleanup failed: ' + errors.map(String).join('; '));
            },
        };
    }
    catch (error) {
        join.dispose();
        throw error;
    }
}
/** Map a non-`completed` stop reason to a human headline for the parent model. */
export function stopReasonError(reason) {
    switch (reason) {
        case 'completed': return '';
        case 'aborted': return 'subagent run was cancelled';
        case 'error': return 'subagent run failed';
        case 'max-tokens': return 'subagent run hit its token limit before finishing';
        case 'refusal': return 'subagent declined the task';
        default: return `subagent run ended abnormally (${reason})`;
    }
}
/** Read + parse one agent file, throwing a friendly, roster-aware error. */
export function loadAgent(dir, name, available) {
    const target = join(dir, `${name}.md`);
    let text;
    try {
        text = readFileSync(target, 'utf8');
    }
    catch {
        const hint = available.length > 0 ? `available agents: ${available.join(', ')}` : 'no agents defined in this directory';
        throw new Error(`unknown agent "${name}" — no ${name}.md in ${dir} (${hint})`);
    }
    const parsed = parseAgentMarkdown(text, target);
    if (!parsed.ok) {
        throw new Error(`agent "${name}": ${parsed.error}`);
    }
    return parsed.agent;
}
/** The cordis `ctx.tools.register`-ready definition for the `use_agent` tool. */
export function runAgentTool(ctx, cfg) {
    const dir = expandHome(cfg.agentsDir);
    const { rosterText, nameList } = buildRoster(dir);
    const description = `Call one of the locally-defined custom agents by name. These are your own ` +
        `custom sub-agents (defined in ${dir}/<name>.md); each runs as its own ` +
        `subagent with its own system prompt and returns its result. ` +
        `Pass the exact agent name and a self-contained prompt (the subagent does ` +
        `not see this conversation, so include everything it needs). ` +
        `If a previous run of the same agent in this conversation was interrupted ` +
        `(error, cancellation, crash, or token limit), the call automatically resumes ` +
        `it from its saved partial work instead of restarting; on a resume the prompt is ` +
        `only shown to the subagent as the reworded request (the original task is already ` +
        `in its context). Pass fresh=true to force a clean restart, or resume=true to ` +
        `require a resume.\n` +
        `Set background=true to start the agent as a durable background conversation ` +
        `instead: the call returns the subagent's id immediately, the agent keeps its ` +
        `session across turns, and you can follow up with ${cfg.askToolName ?? 'ask_agent'} ` +
        `(waits for the reply) or the base send_message (steer only) while the runtime ` +
        `notifies you when the run settles. Background dispatch ignores resume/fresh — ` +
        `it always opens the agent's new conversation.\n` +
        `Available agents:\n${rosterText}`;
    return defineTool({
        name: cfg.toolName,
        description,
        parameters: {
            agent: {
                type: 'string',
                required: true,
                description: `The name of the local agent to run. One of: ${nameList}`,
            },
            prompt: {
                type: 'string',
                required: true,
                description: 'The complete, self-contained task for the selected agent.',
            },
            resume: {
                type: 'boolean',
                description: 'Require continuing this agent\'s previous interrupted run from its saved partial work; fails if none exists. Mutually exclusive with fresh.',
            },
            fresh: {
                type: 'boolean',
                description: 'Force a clean start, ignoring any interrupted previous run of this agent.',
            },
            background: {
                type: 'boolean',
                description: 'Start the agent as a durable background conversation and return its subagent id immediately instead of waiting for the result. Follow up with ask_agent or send_message. Defaults to the agent file\'s background frontmatter, else false. Mutually exclusive with resume.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', required: true },
                    output: { type: 'array', required: true, items: { type: 'json' } },
                    subagentId: { type: 'string' },
                    label: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: textOf(value.output) }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const parent = exec.agent;
            if (parent === undefined) {
                throw new Error(`${cfg.toolName} requires a calling agent (exec.agent was undefined)`);
            }
            // Read after registration, in the caller's scope, including this dispatch tool.
            const hostKnownTools = resolveHostToolNames(ctx, scopeOf(parent.ctx ?? ctx));
            if (args.resume === true && args.fresh === true) {
                throw new Error(`${cfg.toolName}: "resume" and "fresh" are mutually exclusive — pass at most one`);
            }
            // Re-check existence at execute time with a friendly, roster-aware error.
            const agent = loadAgent(dir, args.agent, nameList === '' ? [] : nameList.split(',').map((n) => n.trim()));
            // Synthesize the effective model/thinking for this dispatch: the file
            // frontmatter is the BASELINE and a workspace profile pin
            // (`.dsh-profile` → `$DSH_HOME/model-profiles.json` per-agent override)
            // may replace it. Both branches below — resume and fresh — consume the
            // composed values, so a profile switch applies to continuations too.
            const runtime = composeAgentRuntime(args.agent, {
                model: agent.meta.model,
                thinking: agent.meta.thinking,
            });
            const label = agent.meta.displayName ?? args.agent;
            // Background dispatch: a durable continuable conversation on the same
            // provider (the alpha.4 interaction model). The call resolves at inbox
            // acceptance with the child's durable id instead of the run result;
            // follow-ups ride ask_agent / send_message and the runtime's settlement
            // notice reports how the conversation ended. The resume machinery stays
            // foreground-only: a background dispatch always opens the agent's NEW
            // conversation (foreground calls keep resuming interrupted one-shot
            // runs of the same agent).
            const wantsBackground = decideBackgroundMode(args.background, agent.meta.background);
            if (wantsBackground && args.resume === true) {
                throw new Error(`${cfg.toolName}: "background" and "resume" are mutually exclusive — a background dispatch always starts the agent's new conversation`);
            }
            if (wantsBackground) {
                const { label: _requestLabel, ...request } = buildStartRequest({
                    agentName: args.agent,
                    prompt: args.prompt,
                    parent,
                    persona: agent.body,
                    deep: agent.meta.deep,
                    toolName: cfg.toolName,
                    leafDenyTools: cfg.leafDenyTools,
                    hostKnownTools,
                    model: runtime.model,
                    displayName: agent.meta.displayName,
                    thinking: runtime.thinking,
                });
                const { childId } = typeof ctx.subagents.startActivation === 'function'
                    ? await ctx.subagents.startActivation({
                        provider: cfg.provider,
                        label,
                        delivery: 'parent',
                        request,
                        signal: exec.signal,
                    })
                    : await legacySubagents(ctx).startContinuable({
                        provider: cfg.provider,
                        label,
                        request,
                        signal: exec.signal,
                    });
                const followUpTool = cfg.askToolName ?? 'ask_agent';
                return {
                    kind: 'agent-start',
                    subagentId: String(childId),
                    label,
                    output: [
                        {
                            type: 'text',
                            text: `Started background agent "${label}" (durable subagent id ${String(childId)}). ` +
                                `It is now working on the task in its own conversation, so continue your own work in parallel. ` +
                                `Send follow-ups with ${followUpTool} (waits for the reply) or send_message (delivery only), ` +
                                `addressing it by agent name "${label}" or by id ${String(childId)}. ` +
                                `A runtime notice will report how this run settled.`,
                        },
                    ],
                };
            }
            // Resume decision: continue the parent's latest interrupted run of this
            // agent from its persisted partial log (see ./resume.ts). An explicit
            // resume=true overrides a deployment-level 'off'; everything else
            // follows the configured mode. Lookup is skipped entirely when it
            // cannot change the outcome.
            const configuredMode = cfg.resume ?? 'auto';
            const effectiveMode = configuredMode === 'off' && args.resume === true ? 'opt-in' : configuredMode;
            const candidate = effectiveMode === 'off' || args.fresh === true
                ? undefined
                : await findResumableRun(ctx, parent, label, exec.signal);
            const decision = decideResume(effectiveMode, {
                explicitResume: args.resume === true,
                explicitFresh: args.fresh === true,
                hasCandidate: candidate !== undefined,
            });
            if (decision === 'explicit-resume-unavailable') {
                throw new Error(`${cfg.toolName}: resume requested, but no interrupted prior run of agent "${args.agent}" was found for this conversation ` +
                    `(a prior run only counts while its last turn ended abnormally) — call again without "resume" to start fresh`);
            }
            if (decision === 'resume' && candidate !== undefined) {
                const modelOptions = splitModel(runtime.model ?? '');
                const resumeOptions = {
                    ...modelOptions,
                    ...(runtime.thinking !== undefined
                        ? { reasoningEffort: runtime.thinking }
                        : {}),
                };
                const resumed = await driveResumedRun({
                    ctx,
                    parent,
                    childId: candidate.childId,
                    persona: agent.body,
                    toolFilter: agent.meta.deep === 0
                        ? { deny: [...leafDenyList(cfg.toolName, cfg.leafDenyTools, hostKnownTools)] }
                        : undefined,
                    agentOptions: Object.keys(resumeOptions).length > 0 ? resumeOptions : undefined,
                    continuationPrompt: buildContinuationPrompt(candidate.classification.endedAs, args.prompt),
                    noticeSummary: `resume interrupted "${args.agent}" subagent run`,
                    signal: exec.signal,
                });
                if (resumed.stopReason !== 'completed') {
                    const text = textOf(resumed.output);
                    const headline = `${stopReasonError(String(resumed.stopReason))} (agent "${args.agent}", resumed from interrupted run)`;
                    throw new Error(text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`);
                }
                const provenance = `Resumed from the interrupted prior run of agent "${args.agent}" ` +
                    `(session ${String(candidate.childId)}; ${candidate.classification.endedAs}); ` +
                    `the subagent kept its earlier partial work and continued from there.`;
                return {
                    kind: 'agent-result',
                    output: [{ type: 'text', text: provenance }, ...resumed.output],
                };
            }
            // persona = the file's body (system prompt); `deep` semantics, model
            // routing, and the frontmatter `thinking` effort (native
            // agentOptions.reasoningEffort) are applied by the pure builder (see
            // buildStartRequest).
            const { label: _requestLabel, ...request } = buildStartRequest({
                agentName: args.agent,
                prompt: args.prompt,
                parent,
                persona: agent.body,
                deep: agent.meta.deep,
                toolName: cfg.toolName,
                leafDenyTools: cfg.leafDenyTools,
                hostKnownTools,
                model: runtime.model,
                displayName: agent.meta.displayName,
                thinking: runtime.thinking,
            });
            const signal = exec.signal;
            const run = typeof ctx.subagents.startActivation === 'function'
                ? await ctx.subagents.startActivation({
                    provider: cfg.provider,
                    label: foregroundLabel(label),
                    request,
                    signal,
                    delivery: 'caller',
                })
                : await startLegacyForeground(ctx, cfg.provider, { ...request, label, signal });
            return {
                kind: 'agent-result',
                // settleForegroundRun always disposes the run, even when result
                // rejects; a non-`completed` stop reason is surfaced as the error.
                // ContentBlock[] → the tool contract's JsonValue[] (structural cast).
                output: (await settleForegroundRun(ctx, run, args.agent, signal)),
            };
        },
    });
}
//# sourceMappingURL=tool-run-agent.js.map