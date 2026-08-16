/**
 * The `use_agent` tool: delegates to a locally-defined custom agent by name.
 *
 * The roster (available agent names + sanitized descriptions) is read once at
 * tool-definition time so the tool's static description lets the main
 * conversation model pick an agent by name. At execute time the target
 * `<agents-dir>/<name>.md` is re-read, its frontmatter `model` (a
 * `provider/model` route) is split into `agentOptions`, and its body is
 * passed as the child's `persona`. The delegation runs through the
 * already-assembled `spawn` subagent provider (same single-instance realm dsh
 * uses), so the child is a real dsh subagent with its own system prompt.
 *
 * @module dsh-subagent-registry/tool-run-agent
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveChildDepth } from '@deepseek-ai/dsh-subagent';
import { expandHome, listAgentFiles, parseAgentMarkdown } from "./agents-dir.js";
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
/** Join text blocks from a canonical block array without trusting values. */
function textOf(output) {
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
 *   level deeper before their own per-request caps (native subagent tools
 *   default `maxDepth: 3`) take over as the recursion backstop.
 */
export function buildStartRequest(input) {
    const { agentName, prompt, parent, persona, deep, toolName, leafDenyTools, model } = input;
    // The child's absolute delegation depth, computed by the same authoritative
    // resolver the in-process driver uses (parent depth + 1, monotone floor).
    const childDepth = resolveChildDepth(parent, undefined);
    const modelOptions = model !== undefined ? splitModel(model) : {};
    const request = {
        label: agentName,
        prompt: [{ type: 'text', text: prompt }],
        parent: parent,
        persona,
        ...(deep === 0
            ? {
                // Leaf: strip every spawn capability; no maxDepth at all.
                toolFilter: {
                    deny: [
                        ...(leafDenyTools !== undefined && leafDenyTools.length > 0
                            ? leafDenyTools
                            : [...SPAWN_TOOL_NAMES, toolName]),
                    ],
                },
            }
            : {
                // Relative depth budget: childDepth + deep, never a start blocker.
                maxDepth: childDepth + deep,
            }),
        ...(modelOptions.provider !== undefined || modelOptions.model !== undefined
            ? { agentOptions: modelOptions }
            : {}),
    };
    return request;
}
/**
 * Collect and release one foreground subagent run without letting disposal
 * replace an independent result failure (mirrors the dsh-tool-subagent
 * `settleForegroundRun` pattern, adapted to this tool's error wording).
 *
 * The run's `result` is awaited through its own `.then()` and `dispose()` is
 * settled separately via `Promise.allSettled`, so a rejecting `result` still
 * guarantees `dispose()` runs, and a rejecting `dispose()` never masks a more
 * meaningful `result` failure. When both fail, both errors are surfaced as an
 * AggregateError.
 */
async function settleForegroundRun(run, agentName) {
    const [execution] = await Promise.allSettled([
        run.result.then((result) => {
            if (result.stopReason !== 'completed') {
                const text = textOf(result.output);
                const headline = `${stopReasonError(String(result.stopReason))} (agent "${agentName}")`;
                throw new Error(text.length === 0 ? headline : `${headline}\nPartial output before the run ended:\n${text}`);
            }
            return result.output;
        }),
    ]);
    const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
    if (execution.status === 'rejected') {
        if (disposal.status === 'rejected') {
            throw new AggregateError([execution.reason, disposal.reason], `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`);
        }
        throw execution.reason;
    }
    if (disposal.status === 'rejected')
        throw disposal.reason;
    return execution.value;
}
/** Map a non-`completed` stop reason to a human headline for the parent model. */
function stopReasonError(reason) {
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
function loadAgent(dir, name, available) {
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
        `not see this conversation, so include everything it needs).\n` +
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
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', required: true, const: 'agent-result' },
                    output: { type: 'array', required: true, items: { type: 'json' } },
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
            // Re-check existence at execute time with a friendly, roster-aware error.
            const agent = loadAgent(dir, args.agent, nameList === '' ? [] : nameList.split(',').map((n) => n.trim()));
            // persona = the file's body (system prompt); `deep` semantics and model
            // routing are applied by the pure builder (see buildStartRequest).
            const request = buildStartRequest({
                agentName: args.agent,
                prompt: args.prompt,
                parent,
                persona: agent.body,
                deep: agent.meta.deep,
                toolName: cfg.toolName,
                leafDenyTools: cfg.leafDenyTools,
                model: agent.meta.model,
            });
            const signal = exec.signal;
            const run = await ctx.subagents.start(cfg.provider, { ...request, signal });
            return {
                kind: 'agent-result',
                // settleForegroundRun always disposes the run, even when result
                // rejects; a non-`completed` stop reason is surfaced as the error.
                output: await settleForegroundRun(run, args.agent),
            };
        },
    });
}
//# sourceMappingURL=tool-run-agent.js.map