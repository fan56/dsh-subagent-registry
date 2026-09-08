/**
 * dsh-subagent-registry — register locally-defined custom agents.
 *
 * At session startup this plugin registers two tools (both names
 * configurable): `use_agent` calls any agent defined in
 * `~/.dsh/agents/<name>.md` by name — foreground one-shot with interrupted-run
 * resume, or (since dsh v0.1.2-alpha.4) a durable `background` conversation
 * that returns the child's id immediately; and `ask_agent` sends a follow-up
 * to a background run and waits for its reply, closing the parent↔child
 * interaction loop on top of the continuation manager's bidirectional
 * `sendMessage`. Each custom agent runs as its own subagent with the file
 * body as its persona, through the already-assembled `spawn` provider. No
 * patch to the dsh base's own tool-subagent; the roster is surfaced directly
 * in the tool description so the model can dispatch by name.
 *
 * @module dsh-subagent-registry
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { BUNDLED_SKILL_RANK, } from '@deepseek-ai/dsh-skill';
import { agentsDir, expandHome } from "./agents-dir.js";
import { seedBundledAgents } from "./seed-defaults.js";
import { runAgentTool } from "./tool-run-agent.js";
import { askAgentTool } from "./interactive.js";
// Profile-aware runtime synthesis (the read side of the model-profile
// feature): dsh-tui-pi imports these from this package.
export { agentsDir, dshHome } from "./agents-dir.js";
export { composeAgentRuntime, readModelProfilesDoc, workspaceProfileName } from "./profile-resolution.js";
export const name = 'dsh-subagent-registry';
// --- Bundled skill -----------------------------------------------------------
/** Provider name under `ctx.skills`; doubles as the skill name. */
const SKILL_PROVIDER_NAME = 'dsh-subagent-registry';
/** Packaged skill body; `../skills/` resolves to the package root from both lib/ and src/. */
const SKILL_BODY_URL = new URL('../skills/dsh-subagent-registry/SKILL.md', import.meta.url);
/** Resource base served with the skill so its relative links resolve. */
const SKILL_RESOURCE_BASE = {
    kind: 'directory',
    path: fileURLToPath(new URL('../skills/dsh-subagent-registry/', import.meta.url)),
};
const SKILL_INVOCATION = { modelInvocable: true, userInvocable: true };
/** Routing description; must stay identical to the SKILL.md frontmatter (asserted in tests). */
const SKILL_DESCRIPTION = 'dsh 子代理注册表插件（@aiwayds/dsh-subagent-registry）使用与配置指南。凡涉及自定义子代理、use_agent/ask_agent、agents 目录、agent .md 编写、子代理续跑，或要调整本插件配置时先读本指南：~/.dsh/agents/*.md frontmatter 全键（name/deep/display_name/description/model/thinking/background）、entry config 六键（agentsDir/provider/toolName/askToolName/leafDenyTools/resume）、ask_user_question 代写 agent 文件向导、中断 run 续跑语义。触发词：子代理、agent、use_agent、ask_agent、agents 目录、续跑、resume。';
const SKILL_CANDIDATE = {
    name: SKILL_PROVIDER_NAME,
    description: SKILL_DESCRIPTION,
    invocation: SKILL_INVOCATION,
    provider: SKILL_PROVIDER_NAME,
    source: 'bundled',
    resourceBase: SKILL_RESOURCE_BASE,
    rank: BUNDLED_SKILL_RANK,
    locator: SKILL_BODY_URL,
};
const skillProvider = {
    name: SKILL_PROVIDER_NAME,
    list: () => Promise.resolve([SKILL_CANDIDATE]),
    async get(_candidate) {
        return {
            name: SKILL_CANDIDATE.name,
            description: SKILL_CANDIDATE.description,
            invocation: SKILL_CANDIDATE.invocation,
            provider: SKILL_CANDIDATE.provider,
            source: SKILL_CANDIDATE.source,
            resourceBase: SKILL_RESOURCE_BASE,
            content: stripFrontmatter(await readFile(SKILL_BODY_URL, 'utf8')),
        };
    },
};
/**
 * Strip a leading YAML frontmatter block (`---` / body / `---`) from a skill
 * markdown file. `SkillDefinition.content` must be the instruction body after
 * metadata removal — the same shape the filesystem provider serves — so the
 * bundled SKILL.md, which keeps its frontmatter for the GitHub/manual install
 * paths, has the block removed when served through {@link skillProvider.get}.
 * Tolerant by design: input that does not open with a `---` line, or whose
 * frontmatter block is never closed, is returned unchanged. Mirrors the
 * delimiter semantics of the upstream skill-filesystem provider.
 */
export function stripFrontmatter(raw) {
    const firstLineEnd = raw.indexOf('\n');
    if (firstLineEnd < 0 || raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---')
        return raw;
    let lineStart = firstLineEnd + 1;
    while (lineStart <= raw.length) {
        const nextNewline = raw.indexOf('\n', lineStart);
        const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
        if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
            return raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1).trim();
        }
        if (nextNewline < 0)
            return raw;
        lineStart = nextNewline + 1;
    }
    return raw;
}
/**
 * Tool injection seam + the subagent (provider) seam + the agent factory seam
 * (`ctx.agents.resume` drives interrupted-run continuation), like
 * dsh-tool-subagent plus the resume dependency — plus the skill registry that
 * serves the bundled usage/config guide.
 */
export const inject = ['tools', 'subagents', 'agents', 'skills'];
/**
 * Plugin config. `agentsDir` defaults to the dsh-home agents dir
 * (`$DSH_HOME/agents`, i.e. `~/.dsh/agents`), `provider` reuses
 * dsh-base's already-assembled `spawn` provider, `toolName` names the
 * dispatch tool, `askToolName` names the follow-up tool, `leafDenyTools`
 * overrides the tool list removed from `deep: 0` (leaf) agents' children
 * (default: all agent-spawning tools in the dsh base distribution plus
 * `toolName` itself), and `resume` selects when `use_agent` continues a
 * prior interrupted run of the same agent (default `auto`).
 */
export const Config = z.object({
    agentsDir: z.string().default('~/.dsh/agents'),
    provider: z.string().default('spawn'),
    toolName: z.string().default('use_agent'),
    askToolName: z.string().default('ask_agent'),
    leafDenyTools: z.array(z.string()).default([]),
    resume: z.union(['auto', 'opt-in', 'off']).default('auto'),
});
export function apply(ctx, config) {
    // `inject = ['skills']` guarantees the service exists on every real host;
    // register unconditionally so a missing service fails loud instead of
    // silently dropping the bundled skill.
    ctx.skills.registerProvider(() => skillProvider);
    // Resolve the agents dir against the dsh home: the schema default literal
    // means "the agents dir under the dsh home", so `$DSH_HOME` is honored by
    // the same resolution the host uses (dshHome) — this keeps seeding, the
    // tool's roster and the profile store (`$DSH_HOME/model-profiles.json`)
    // under one root. A configured custom path is taken verbatim (after `~`
    // expansion).
    const dir = config.agentsDir === '~/.dsh/agents' ? agentsDir() : expandHome(config.agentsDir);
    const runConfig = { ...config, agentsDir: dir };
    // One-time seeding of the bundled default roster (workhorse / oldfox /
    // rubber-duck) into the configured agents dir: a fresh install starts
    // with a usable roster. Runs synchronously BEFORE the tool registers, so
    // the roster the model sees already includes the defaults; runs only
    // while the dir holds no agents, so existing files and deletions are
    // always user-owned. Best-effort: an unwritable dir must not break the
    // plugin mount, so failures are swallowed.
    try {
        seedBundledAgents(dir);
    }
    catch {
        // Seeding is an install convenience, never a hard dependency.
    }
    // Register the dispatch + follow-up tools as soon as the configured subagent provider
    // (e.g. `spawn`) is available. Cordis activates mutually independent
    // plugins in parallel, so the provider backend plugin's `apply` may run
    // *after* this plugin's apply; a synchronous fail-early pre-check here would
    // therefore lose the race and drop the tool. Instead we register
    // immediately when the provider already exists, and otherwise wait for the
    // `subagent/provider-added` event (emitted by ctx.subagents.registerProvider)
    // before registering. The tool's execute always re-resolves the provider at
    // call time through ctx.subagents.start, so no further check is needed.
    const registerTool = () => {
        ctx.effect(() => {
            const dispatch = ctx.tools.register(runAgentTool(ctx, runConfig));
            const followUp = ctx.tools.register(askAgentTool(ctx, {
                agentsDir: dir,
                toolName: config.askToolName ?? 'ask_agent',
                dispatchToolName: config.toolName,
            }));
            return [dispatch, followUp];
        }, `dsh-subagent-registry:${config.toolName}`);
    };
    // TODO(upstream): upstream added a read-only `list_subagent_models`
    // tool on the 0.1.2 alpha line (model-selection policy; spawns nothing, so
    // the maxAgents fence is untouched). Investigated against the 0.1.2-rc.1
    // closure — still NOT attachable from
    // a third-party plugin today: `registerListSubagentModels(ctx, policy)` is a
    // module-private function of @deepseek-ai/dsh-tool-subagent (its entry
    // exports only `Config/apply/inject/name`), its required `policy` argument is
    // the route list that plugin itself projects into each Session
    // (`subagentModelSelectionPolicy` state key, fed by the host
    // `subagent-model-selection` setting), and the global tool name is owned by
    // that plugin's delegation-tool instances ("at most one instance in a tool
    // scope may own model selection"). Revisit only if upstream exports a public
    // discovery seam; until then the roster's frontmatter `model` routes stay
    // the model-visible surface for where a pinned subagent may land.
    if (ctx.subagents.getProvider(config.provider) !== undefined) {
        registerTool();
        return;
    }
    let removeListener;
    removeListener = ctx.on('subagent/provider-added', () => {
        if (ctx.subagents.getProvider(config.provider) !== undefined) {
            registerTool();
            removeListener?.();
        }
    });
}
//# sourceMappingURL=index.js.map