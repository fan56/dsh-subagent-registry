/**
 * dsh-subagent-registry — register locally-defined custom agents.
 *
 * At session startup this plugin registers two tools (both names
 * configurable): `use_agent` calls any agent defined in
 * `~/.dsh/agents/<name>.md` by name — foreground activation with interrupted-run
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

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
// Types only (erased at emit). The runtime import is deliberately avoided:
// the registry-published dsh-skill lib imports host-closure siblings
// (@deepseek-ai/dsh-scope, dsh-llm — peers of it, but absent from a plugin
// repo's own dependency graph), which dies under pnpm's isolated layout.
// The host injects the real service at runtime; these types only shape the
// provider object this plugin hands it.
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'
import type { Language } from './preset-contract.ts'
import { createCodemodeTool, type CodemodeDeps } from './ptc/runner.ts'
import { createUsageLog } from './ptc/usage.ts'
import { ptcConfigOf } from './ptc/config.ts'
import { resolveUsageDir } from './ptc/paths.ts'
import { makePtcEnabledReader, registerSubagentsCommand } from './subagents-command.ts'

/** Mirrors dsh-skill's bundled-skill rank (a non-load-bearing ordering hint;
 *  the constant is hardcoded there too). Local copy — see the type-import
 *  note above for why dsh-skill is not loaded at runtime here. */
const BUNDLED_SKILL_RANK = 600
import { agentsDir, expandHome } from './agents-dir.ts'
import { seedBundledAgents } from './seed-defaults.ts'
import { runAgentTool, type RunAgentConfig } from './tool-run-agent.ts'
import { askAgentTool } from './interactive.ts'
import { registerDelegationGuidance } from './delegation-guidance.ts'
import { registerPresetsRpc } from './presets-rpc.ts'
import { installChildCompositionListener } from './host-compat.ts'

// Profile-aware runtime synthesis (the read side of the model-profile
// feature): dsh-tui-pi imports these from this package.
export { agentsDir, dshHome } from './agents-dir.ts'
export { readAgentMaxRounds } from './agent-caps.ts'
export { foregroundLabel, stripForegroundLabel } from './resume.ts'
export { composeAgentRuntime, readModelProfilesDoc, workspaceProfileName } from './profile-resolution.ts'

export const name = 'dsh-subagent-registry'

// --- Bundled skill -----------------------------------------------------------

/** Provider name under `ctx.skills`; doubles as the skill name. */
const SKILL_PROVIDER_NAME = 'dsh-subagent-registry-config'

/** Packaged skill body per language; `../skills/` resolves to the package root
 *  from both lib/ and src/. `zh` keeps the plain `SKILL.md` filename for
 *  backward compatibility (existing installs and the GitHub/manual path). */
const SKILL_BODY_URLS: Record<Language, URL> = {
  zh: new URL('../skills/dsh-subagent-registry-config/SKILL.md', import.meta.url),
  en: new URL('../skills/dsh-subagent-registry-config/SKILL.en.md', import.meta.url),
  ru: new URL('../skills/dsh-subagent-registry-config/SKILL.ru.md', import.meta.url),
}

/** Resource base served with the skill so its relative links resolve. */
const SKILL_RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../skills/dsh-subagent-registry-config/', import.meta.url)),
} as const

const SKILL_INVOCATION = { modelInvocable: true, userInvocable: true } as const

/**
 * Routing descriptions, one per language; each must stay identical to the
 * frontmatter of the matching SKILL.<lang>.md file (asserted in tests) and
 * within the 500-char routing budget.
 */
const SKILL_DESCRIPTIONS: Record<Language, string> = {
  zh: 'dsh 子代理注册表插件（@aiwayds/dsh-subagent-registry）使用与配置指南。凡涉及自定义子代理、use_agent/ask_agent、/registry-config 命令、agents 目录、agent .md 编写、子代理续跑，或要调整本插件配置时先读本指南：~/.dsh/agents/*.md frontmatter 全键、entry config 全键（agentsDir…language/disabledAgents/ptcEnabled/jev*）、opt-in agent 安装（ptc-subagent/minimal-subagent，试验性，默认关闭）、ask_user_question 代写向导、中断续跑、接入与使用体检。触发词：子代理、agent、use_agent、ask_agent、/registry-config、停用、disabledAgents、ptc、codemode、续跑、resume、体检、调试、没调用、语言。',
  en: 'Guide to the dsh subagent registry plugin. Covers custom subagents, use_agent/ask_agent, /registry-config, the agents dir, agent .md, resume, plugin config: ~/.dsh/agents/*.md frontmatter keys, entry config keys (agentsDir…/language/disabledAgents/ptcEnabled/jev*), opt-in installs (ptc-subagent/minimal-subagent; experimental, default off), ask_user_question wizard, diagnostics. Triggers: subagent, agent, /registry-config, disable, disabledAgents, ptc, codemode, resume, debug, язык.',
  ru: 'Руководство по плагину @aiwayds/dsh-subagent-registry: суб-агенты, use_agent/ask_agent, /registry-config, каталог agents, agent .md, resume, настройка: frontmatter ~/.dsh/agents/*.md, ключи entry config (disabledAgents/ptcEnabled/jev*), opt-in агенты (ptc-subagent/minimal-subagent; экспериментальные, по умолчанию выключены), ask_user_question, диагностика. Триггеры: суб-агент, agent, /registry-config, отключить, disabledAgents, ptc, codemode, resume, отладка, не вызывается, язык.',
}

/**
 * Build the bundled-skill provider for one language: the routing description
 * and the served body both follow the configured `language` (zh serves the
 * plain SKILL.md for backward compatibility). Built inside `apply` so the
 * language is read from the run config captured there.
 */
function buildSkillProvider(language: Language): SkillProvider {
  const candidate: SkillCandidate = {
    name: SKILL_PROVIDER_NAME,
    description: SKILL_DESCRIPTIONS[language],
    invocation: SKILL_INVOCATION,
    provider: SKILL_PROVIDER_NAME,
    source: 'bundled',
    resourceBase: SKILL_RESOURCE_BASE,
    rank: BUNDLED_SKILL_RANK,
    locator: SKILL_BODY_URLS[language],
  }
  return {
    name: SKILL_PROVIDER_NAME,
    list: () => Promise.resolve([candidate]),
    async get(_candidate): Promise<SkillDefinition> {
      return {
        name: candidate.name,
        description: candidate.description,
        invocation: candidate.invocation,
        provider: candidate.provider,
        source: candidate.source,
        resourceBase: SKILL_RESOURCE_BASE,
        content: stripFrontmatter(await readFile(SKILL_BODY_URLS[language], 'utf8')),
      }
    },
  }
}

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
export function stripFrontmatter(raw: string): string {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0 || raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return raw
  let lineStart = firstLineEnd + 1
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1).trim()
    }
    if (nextNewline < 0) return raw
    lineStart = nextNewline + 1
  }
  return raw
}

/**
 * Tool injection seam + the subagent (provider) seam + the agent factory seam
 * (`ctx.agents.resume` drives interrupted-run continuation), like
 * dsh-tool-subagent plus the resume dependency — plus the skill registry that
 * serves the bundled usage/config guide.
 */
export const inject = ['tools', 'subagents', 'agents', 'skills', 'systemPrompt']

/**
 * Plugin config. The seven registry keys first: `agentsDir` defaults to the
 * dsh-home agents dir (`$DSH_HOME/agents`, i.e. `~/.dsh/agents`), `provider`
 * reuses dsh-base's already-assembled `spawn` provider, `toolName` names the
 * dispatch tool, `askToolName` names the follow-up tool, `leafDenyTools`
 * overrides the tool list removed from `deep: 0` (leaf) agents' children
 * (default: all agent-spawning tools in the dsh base distribution plus
 * `toolName` itself), `resume` selects when `use_agent` continues a
 * prior interrupted run of the same agent (default `auto`), and
 * `language` selects the UI/skill/seed language (`zh` Chinese default,
 * `en`, `ru`).
 *
 * The roster toggle: `disabledAgents` (volatile, default `[]`) lists agent
 * names excluded from the roster — the `/registry-config` command and a direct
 * settings edit both write it. Volatile, so a write hot-swaps the value and
 * the next roster refresh applies it without remounting; agent files are
 * never touched.
 *
 * The opt-in PTC toolchain (migrated from `@aiwayds/dsh-ptc-subagent`):
 * `ptcEnabled` (default `false`) gates the `codemode` tool registration —
 * false means the tool never registers; true registers it at standing scope
 * like the standalone plugin did. It is deliberately NOT volatile: flipping
 * it remounts the plugin, which is exactly the register/unregister act. The
 * six `jev*`/`storageDir` keys are volatile and hot-reload per call; defaults
 * are the standalone plugin's (jev OFF, zen backend, 3000 ms, usage sink
 * `<dsh home>/storages/ptc-subagent`). Fifteen keys in total.
 */
export const Config = z.object({
  agentsDir: z.string().default('~/.dsh/agents'),
  provider: z.string().default('spawn'),
  toolName: z.string().default('use_agent'),
  askToolName: z.string().default('ask_agent'),
  leafDenyTools: z.array(z.string()).default([]),
  resume: z.union(['auto', 'opt-in', 'off']).default('auto'),
  language: z.union(['zh', 'en', 'ru']).default('zh'),
  disabledAgents: z.array(z.string()).default([]).volatile(),
  ptcEnabled: z.boolean().default(false),
  jevEnabled: z.boolean().default(false).volatile(),
  jevBackend: z.union([z.const('zen'), z.const('native'), z.const('openrouter')]).default('zen').volatile(),
  jevModel: z.string().default('').volatile(),
  jevTimeoutMs: z.natural().min(1).default(3000).volatile(),
  jevSecretFile: z.string().default('').volatile(),
  storageDir: z.string().default('').volatile(),
})

export function apply(ctx: Context, config: RunAgentConfig): void {
  // The UI/skill/seed language: read once at apply time (the schema default
  // keeps `zh` when the key is absent). The runConfig-wide type keeps working
  // whether or not the shared RunAgentConfig interface already carries the
  // field.
  const language: Language = (config as { language?: Language }).language ?? 'zh'
  // `inject = ['skills']` guarantees the service exists on every real host;
  // register unconditionally so a missing service fails loud instead of
  // silently dropping the bundled skill. The provider is built per apply so
  // the routing description and served body follow the configured language.
  ctx.skills.registerProvider(() => buildSkillProvider(language))
  // Resolve the agents dir against the dsh home: the schema default literal
  // means "the agents dir under the dsh home", so `$DSH_HOME` is honored by
  // the same resolution the host uses (dshHome) — this keeps seeding, the
  // tool's roster and the profile store (`$DSH_HOME/model-profiles.json`)
  // under one root. A configured custom path is taken verbatim (after `~`
  // expansion).
  const dir = config.agentsDir === '~/.dsh/agents' ? agentsDir() : expandHome(config.agentsDir)
  const runConfig: RunAgentConfig & { language: Language } = { ...config, agentsDir: dir, language }
  // One-time seeding of the bundled default roster (workhorse / oldfox /
  // rubber-duck) into the configured agents dir: a fresh install starts
  // with a usable roster. Runs synchronously BEFORE the tool registers, so
  // the roster the model sees already includes the defaults; runs only
  // while the dir holds no agents, so existing files and deletions are
  // always user-owned. Best-effort: an unwritable dir must not break the
  // plugin mount, so failures are swallowed.
  try {
    seedBundledAgents(dir, runConfig.language)
  } catch {
    // Seeding is an install convenience, never a hard dependency.
  }
  // Opt-in PTC toolchain (migrated from @aiwayds/dsh-ptc-subagent): the
  // `codemode` tool registers ONLY when `ptcEnabled` is true — the default
  // install mounts nothing extra. When enabled, the standing scope matches
  // the standalone plugin: the tool registers on the global tool registry,
  // visible to the main agent AND every dispatched subagent. `ptcRuntime` is
  // read at call time (the runner throws a friendly misconfiguration error
  // when absent) instead of a static inject — an inject here would make the
  // whole plugin unmountable on hosts without the PTC runtime line even with
  // ptcEnabled false. The six jev keys ride the volatile refs, so a
  // settings-page edit applies to the next classify without remounting.
  if ((runConfig as { ptcEnabled?: boolean }).ptcEnabled === true) {
    const jevConfig = ptcConfigOf(runConfig as unknown as Record<string, unknown>)
    const usage = createUsageLog(resolveUsageDir(jevConfig.storageDir.get()))
    const deps: CodemodeDeps = {
      ctx,
      jev: {
        config: jevConfig,
        log: usage,
        env: process.env,
      },
    }
    ctx.effect(() => ctx.tools.register(createCodemodeTool(deps)), 'dsh-subagent-registry:codemode')
  }
  // Register the dispatch + follow-up tools as soon as the configured subagent provider
  // (e.g. `spawn`) is available. Cordis activates mutually independent
  // plugins in parallel, so the provider backend plugin's `apply` may run
  // *after* this plugin's apply; a synchronous fail-early pre-check here would
  // therefore lose the race and drop the tool. Instead we register
  // immediately when the provider already exists, and otherwise wait for the
  // `subagent/provider-added` event (emitted by ctx.subagents.registerProvider)
  // before registering. The tool's execute always re-resolves the provider at
  // call time through ctx.subagents.startActivation, so no further check is needed.
  let refreshRoster = async (): Promise<void> => {}
  // Web is optional: CLI/TUI mounts must keep their dispatch tools without Connection.
  ctx.inject?.(['connection', 'webServer'], web => registerPresetsRpc(web, dir, () => refreshRoster(), () => runConfig.language))
  // The /registry-config management command (roster toggle + opt-in installs + the
  // codemode switch). Guarded on the host's commands service: a host without
  // it keeps the manual config recipe as the only surface. The command shares
  // the roster refresh seam with the web panel — the trailing refresh applies
  // a volatile disabledAgents write to the tool descriptions immediately,
  // while a ptcEnabled flip takes effect through the loader's remount.
  registerSubagentsCommand({
    ctx,
    agentsDir: dir,
    language,
    disabledAgents: runConfig.disabledAgents,
    refreshRoster: () => refreshRoster(),
    isPtcEnabled: makePtcEnabledReader(ctx, (runConfig as { ptcEnabled?: boolean }).ptcEnabled === true),
  })
  // Activation hosts (the 0.2.1 line) carry a fresh child's persona and leaf
  // scoping out-of-band: the start request no longer holds `persona` /
  // `toolFilter`, so each dispatch reserves them under the child's durable id
  // and this listener installs them on the child scope at the `subagent/start`
  // edge — before the first prompt is queued. No-op on the 0.2.0 line (the
  // request fields exist there; nothing is ever parked).
  ctx.effect(() => installChildCompositionListener(ctx), 'dsh-subagent-registry:child-composition')
  const registerTool = (): void => {
    ctx.effect(() => {
      let definition = runAgentTool(ctx, runConfig)
      let followUpDefinition = buildFollowUp()
      let dispatch = ctx.tools.register(definition)
      let followUp = ctx.tools.register(followUpDefinition)
      let guidance = registerDelegationGuidance(ctx, definition, config.askToolName ?? 'ask_agent')
      let active = true
      let pending = Promise.resolve()
      function buildFollowUp() {
        return askAgentTool(ctx, {
          agentsDir: dir,
          toolName: config.askToolName ?? 'ask_agent',
          dispatchToolName: config.toolName,
          disabledAgents: runConfig.disabledAgents,
        })
      }
      const replace = async (): Promise<void> => {
        const next = runAgentTool(ctx, runConfig)
        const nextFollowUp = buildFollowUp()
        // Roster refresh replaces BOTH tools: the dispatch description carries
        // the roster, and the follow-up description carries the same (toggled)
        // name list — one refresh, one swap.
        if (!active || (next.description === definition.description && nextFollowUp.description === followUpDefinition.description)) return
        const previous = definition
        const previousFollowUp = followUpDefinition
        guidance()
        await dispatch()
        await followUp()
        if (!active) return
        try {
          dispatch = ctx.tools.register(next)
          definition = next
          followUp = ctx.tools.register(nextFollowUp)
          followUpDefinition = nextFollowUp
        } catch (error) {
          dispatch = ctx.tools.register(previous)
          definition = previous
          followUp = ctx.tools.register(previousFollowUp)
          followUpDefinition = previousFollowUp
          guidance = registerDelegationGuidance(ctx, previous, config.askToolName ?? 'ask_agent')
          throw error
        }
        guidance = registerDelegationGuidance(ctx, definition, config.askToolName ?? 'ask_agent')
      }
      refreshRoster = () => {
        const operation = pending.then(replace)
        pending = operation.catch(() => {})
        return operation
      }
      return async () => {
        active = false
        refreshRoster = async () => {}
        await pending
        guidance()
        await dispatch()
        await followUp()
      }
    }, `dsh-subagent-registry:${config.toolName}`)
  }
  // TODO(upstream): upstream added a read-only `list_subagent_models`
  // tool on the 0.1.2 alpha line (model-selection policy; spawns nothing, so
  // it cannot occupy the official subagent capacity budget). Investigated
  // against the 0.1.2-rc.1 closure — still NOT attachable from
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
  //
  // Concurrency and depth limits are OFFICIAL-owned as of 0.1.7: this plugin
  // keeps no concurrency counter or queue of its own. dsh-subagent enforces
  // `maxActiveSubagents` (volatile, default 8) through its ActivationManager
  // and `maxDepth` (volatile, default 1) at start; tune them from a profile
  // patch (`subagent: { maxActiveSubagents: N, maxDepth: M }`) or
  // `settings.update('subagent', …)` — see README. The per-agent `maxRounds`
  // frontmatter key stays: the official seam has no round budget.
  if (ctx.subagents.getProvider(config.provider) !== undefined) {
    registerTool()
    return
  }
  let removeListener: (() => void) | undefined
  removeListener = ctx.on('subagent/provider-added', () => {
    if (ctx.subagents.getProvider(config.provider) !== undefined) {
      registerTool()
      removeListener?.()
    }
  })
}
