/**
 * The `/registry-config` slash command — the plugin's management wizard over
 * the two configuration surfaces it owns:
 *
 * 1. **The roster toggle** (`disabledAgents`, volatile): a multi-select
 *    question listing every roster agent; the checked set BECOMES the new
 *    `disabledAgents` list (default = nothing checked = all enabled). The
 *    toggle is a pure roster filter — agent `.md` files are never touched.
 *    The volatile write hot-swaps in place, so the trailing
 *    `refreshRoster()` applies it to the tool descriptions immediately.
 * 2. **The opt-in agents** (`ptc-subagent` / `minimal-subagent`): a
 *    multi-select over the templates shipped under
 *    `templates/opt-in-agents/`. Both are Experimental — disabled by default;
 *    the wizard texts mark it. Checking one installs its template into the
 *    agents dir (an existing file is NEVER overwritten; unchecking never
 *    deletes one). Selecting `ptc-subagent` additionally flips
 *    `ptcEnabled: true` (the codemode tool registers on the next plugin
 *    mount); unselecting flips it back to false and parks the installed
 *    `ptc-subagent` in `disabledAgents` (file kept, roster excluded).
 *
 * Persistence goes through `settings.mutate` against the plugin's own entry
 * config (namespace = the entry id `dsh-subagent-registry`), the same
 * describe → mutate(with revision) → one-conflict-retry spell
 * dsh-tui's preference writer uses. The texts follow the configured
 * `language` via the packaged `locale/<language>.json`.
 *
 * Degradation: on a headless deployment no answerer accepts the ask (the
 * service rejects with `NO_PROVIDER`) — the handler catches any ask failure
 * and returns a CommandResult error carrying the manual configuration recipe
 * (the `disabledAgents` / `ptcEnabled` keys plus the template copy path), so
 * the command stays usable without an interactive surface.
 *
 * @module subagents-command
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { listAgentFiles } from "./agents-dir.js";
import { currentDisabledAgents } from "./tool-run-agent.js";
import { installOptInAgent, OPT_IN_AGENT_IDS } from "./opt-in-agents.js";
/** The plugin's settings namespace = the profile patch entry id. */
export const SUBAGENTS_SETTINGS_NAMESPACE = 'dsh-subagent-registry';
/** `{key}` interpolation over one locale string. */
function format(template, vars) {
    return template.replace(/\{(\w+)\}/g, (whole, key) => vars[key] ?? whole);
}
/** The English table doubles as the key whitelist and the last fallback. */
const EN_STRINGS = {
    commandDescription: 'Manage subagents: toggle roster agents on/off, install opt-in agents (ptc-subagent / minimal-subagent), flip the codemode (PTC) toolchain switch.',
    askUnavailable: 'No ask surface is available (the userQuestions service is not mounted). Edit the dsh-subagent-registry entry config manually (profile cordis.patch.yml or the settings page).',
    askFailed: 'The wizard could not complete ({error}). Configure manually, see below.',
    manualHint: 'Manual configuration: set disabledAgents (array of agent names hidden from the roster; agent files are never touched) and ptcEnabled (true/false — the codemode toolchain switch, applied on the next plugin mount) on the dsh-subagent-registry entry config (profile cordis.patch.yml or the settings page). Opt-in agents install by copying templates/opt-in-agents/<language>/<name>.md from the package into ~/.dsh/agents/ (existing files are never overwritten).',
    qDisableHeader: 'Disable agents',
    qDisableQuestion: 'Check the agents to disable (unchecked = enabled).',
    qDisableDetail: 'Disabling only hides an agent from the use_agent roster and refuses calls by name; the agent file is never modified. Currently disabled names must STAY checked to remain disabled.',
    markDisabled: 'currently disabled — keep checked to stay disabled, uncheck to re-enable',
    markEnabled: 'currently enabled — check to disable',
    qOptInHeader: 'Opt-in agents',
    qOptInQuestion: 'Check the opt-in agents to install / keep enabled (both Experimental — disabled by default).',
    qOptInDetail: 'Experimental — disabled by default. Installing copies the template into the agents dir (an existing file is never overwritten; unchecking never deletes a copied file).',
    ptcBlurb: 'Experimental. Batch decision-work specialist; links ptcEnabled (the codemode toolchain).',
    minimalBlurb: 'Experimental. Minimal terminal-only executor (leaf); no config linkage.',
    stateInstalled: 'installed',
    stateMissing: 'not installed',
    ptcOnNow: 'codemode enabled',
    ptcOffNow: 'codemode disabled',
    noChanges: 'Nothing changed.',
    savedHeader: 'Subagent settings saved.',
    disabledLine: 'Disabled: {names}',
    enabledLine: 'Enabled: {names}',
    installedLine: 'Installed: {ids}',
    presentLine: 'Already present (not overwritten): {ids}',
    installFailedLine: 'Install failed: {id} ({error})',
    ptcEnabledLine: 'ptcEnabled → true: the codemode tool registers on the next plugin mount (dsh restart).',
    ptcDisabledLine: 'ptcEnabled → false: the codemode tool will not register (applied on the next mount); an installed ptc-subagent.md is kept but excluded from the roster.',
    rosterRefreshed: 'Tool roster refreshed.',
    rosterRefreshFailed: 'Roster refresh failed: {error} — it applies when the management page is reopened or on the next dispatch.',
    persistFailed: 'Config write failed: {error}',
    settingsUnavailable: 'Settings service unavailable; no config was written.',
};
/** Directory of this compiled module (`<package root>/lib/`). */
function moduleDir() {
    return fileURLToPath(new URL('.', import.meta.url));
}
/** Absolute packaged locale file path for one language. */
function localeFilePath(language) {
    return join(moduleDir(), '..', 'locale', `${language}.json`);
}
/**
 * Load the string table for one language from the packaged
 * `locale/<language>.json`. Any read/parse/shape failure falls back to the
 * English edition, then to the English constants (zh files keep the same key
 * set, so a missing zh section degrades to English rather than crash).
 */
export function loadSubagentsStrings(language) {
    for (const candidate of [language, 'en']) {
        try {
            const path = localeFilePath(candidate);
            if (!existsSync(path))
                continue;
            const parsed = JSON.parse(readFileSync(path, 'utf8'));
            const section = parsed.subagents;
            if (section === undefined || typeof section !== 'object')
                continue;
            // Keep only the known string keys (locale JSON may carry anything).
            const resolved = {};
            for (const key of Object.keys(EN_STRINGS)) {
                const value = section[key];
                if (typeof value === 'string' && value !== '')
                    resolved[key] = value;
            }
            return { ...EN_STRINGS, ...resolved };
        }
        catch {
            // Corrupt or unreadable file for one language: try the next fallback.
        }
    }
    return EN_STRINGS;
}
// ---------------------------------------------------------------------------
// settings.mutate writer (the dsh-tui preference-write spell, structural)
// ---------------------------------------------------------------------------
/** Whether the error is the settings service's optimistic-concurrency refusal. */
function isSettingsConflict(error) {
    return typeof error === 'object' && error !== null && error.code === 'SETTINGS_CONFLICT';
}
/**
 * Persist one batch of path ops into the plugin's entry config. Volatile-only
 * commits hot-swap the running references without remounting (disabledAgents);
 * a non-volatile change (ptcEnabled) remounts the plugin, which is exactly
 * the codemode register/unregister act. Best-effort: a deployment without the
 * settings service reports the failure; a conflict retries once against a
 * fresh revision.
 * @returns undefined on success, the failure message otherwise.
 */
export async function writeRegistryConfig(ctx, ops) {
    const settings = ctx.get?.('settings');
    if (settings === undefined)
        return 'Settings service is not available.';
    for (let attempt = 0;; attempt++) {
        const descriptor = settings.describe().find((d) => d.ns === SUBAGENTS_SETTINGS_NAMESPACE);
        try {
            await settings.mutate(SUBAGENTS_SETTINGS_NAMESPACE, ops, descriptor?.revision);
            return undefined;
        }
        catch (error) {
            if (attempt === 0 && isSettingsConflict(error))
                continue;
            return error instanceof Error ? error.message : String(error);
        }
    }
}
/**
 * Live `ptcEnabled` reader: the settings surface first (it reflects a write
 * even in the window before the loader remounts), the apply-time value as
 * the fallback.
 */
export function makePtcEnabledReader(ctx, applyTimeValue) {
    return () => {
        try {
            const settings = ctx.get?.('settings');
            const value = settings?.describe().find((d) => d.ns === SUBAGENTS_SETTINGS_NAMESPACE)?.value;
            if (value !== undefined && typeof value.ptcEnabled === 'boolean')
                return value.ptcEnabled;
        }
        catch {
            // describe() unavailable or shaped unexpectedly: use the apply-time value.
        }
        return applyTimeValue;
    };
}
/** Question id of the disable toggle (the answer echoes it back). */
export const DISABLE_QUESTION_ID = 'disable-agents';
/** Question id of the opt-in install (the answer echoes it back). */
export const OPT_IN_QUESTION_ID = 'opt-in-agents';
/** The host command name (satisfies the host's `/^[a-z][a-z0-9_-]*$/` rule). */
export const REGISTRY_CONFIG_COMMAND_NAME = 'registry-config';
/**
 * Register the `/registry-config` command on the host command registry. A
 * no-op on a host without the commands service (the dispatch surfaces degrade
 * to the manual config recipe documented in the README).
 *
 * Collision guard: the host keeps commands in per-scope `NamedEntries` tables
 * that THROW on a duplicate name (`command "X" is already registered …`), and
 * its listing API (`list` / `find`) is agent-scoped — it needs a receiving
 * agent this plugin does not have at mount time, so a pre-check is impossible.
 * The registration therefore runs inside a try/catch: a name already taken
 * (e.g. a host/tui twin registration) degrades to a `console.warn` and the
 * plugin keeps mounting — startup never explodes over a command name.
 */
export function registerSubagentsCommand(deps) {
    // Read defensively through ctx.get: a property access (`ctx.commands`)
    // throws on an undeclared inject in cordis, and 'commands' stays off this
    // plugin's inject on purpose — a host without the service must keep
    // mounting (the command then degrades to the manual config recipe).
    const commands = deps.ctx.get?.('commands');
    if (commands === undefined || typeof commands.register !== 'function')
        return;
    const strings = loadSubagentsStrings(deps.language);
    deps.ctx.effect(() => {
        // register() returns the disposer (same shape as ctx.tools.register) and
        // throws synchronously on a duplicate name. Wrap it: on any registration
        // refusal warn and skip (a stable no-op teardown) instead of failing the
        // effect — the host's duplicate throw must never take down TUI startup.
        let dispose;
        try {
            dispose = commands.register({
                name: REGISTRY_CONFIG_COMMAND_NAME,
                description: strings.commandDescription,
                handler: (invocation) => handleSubagentsCommand(deps, invocation),
            });
        }
        catch (error) {
            console.warn(`[dsh-subagent-registry] '/${REGISTRY_CONFIG_COMMAND_NAME}' command not registered: ` +
                `${error instanceof Error ? error.message : String(error)} — ` +
                'the name is likely taken by another plugin/host command; the wizard stays reachable via the manual config recipe (README).');
            return () => { };
        }
        return () => {
            if (typeof dispose === 'function')
                dispose();
        };
    }, 'dsh-subagent-registry:/registry-config');
}
/** Build the disable-toggle question (roster snapshot + current state marks). */
export function buildDisableQuestion(strings, agents, currentlyDisabled) {
    const disabled = new Set(currentlyDisabled);
    return {
        id: DISABLE_QUESTION_ID,
        header: strings.qDisableHeader,
        question: strings.qDisableQuestion,
        detail: strings.qDisableDetail,
        multiSelect: true,
        options: agents.map((agent) => ({
            label: agent.meta.name,
            description: disabled.has(agent.meta.name) ? strings.markDisabled : strings.markEnabled,
        })),
    };
}
/** Build the opt-in install question (installed/enabled state marks). */
export function buildOptInQuestion(strings, agentsDir, ptcEnabled) {
    const ptcInstalled = existsSync(join(agentsDir, 'ptc-subagent.md'));
    const minimalInstalled = existsSync(join(agentsDir, 'minimal-subagent.md'));
    return {
        id: OPT_IN_QUESTION_ID,
        header: strings.qOptInHeader,
        question: strings.qOptInQuestion,
        detail: strings.qOptInDetail,
        multiSelect: true,
        options: [
            {
                label: 'ptc-subagent',
                description: `${strings.ptcBlurb} [${ptcInstalled ? strings.stateInstalled : strings.stateMissing} · ${ptcEnabled ? strings.ptcOnNow : strings.ptcOffNow}]`,
            },
            {
                label: 'minimal-subagent',
                description: `${strings.minimalBlurb} [${minimalInstalled ? strings.stateInstalled : strings.stateMissing}]`,
            },
        ],
    };
}
/** The selected labels of one answered question; undefined when declined. */
function selectedOf(answers, id) {
    const item = answers?.find((candidate) => candidate.id === id);
    if (item === undefined)
        return undefined;
    return item.selected ?? [];
}
/** The wizard body: ask, resolve, install, persist, refresh, report. */
export async function handleSubagentsCommand(deps, invocation) {
    const strings = loadSubagentsStrings(deps.language);
    const ask = deps.ctx.get?.('userQuestions');
    if (ask === undefined || typeof ask.ask !== 'function') {
        return { kind: 'error', text: `${strings.askUnavailable}\n\n${strings.manualHint}` };
    }
    // Snapshot the roster + current toggle state for the questions.
    const { agents } = listAgentFiles(deps.agentsDir);
    const currentDisabled = [...currentDisabledAgents(deps.disabledAgents)];
    const questions = [];
    if (agents.length > 0) {
        questions.push(buildDisableQuestion(strings, agents, currentDisabled));
    }
    questions.push(buildOptInQuestion(strings, deps.agentsDir, deps.isPtcEnabled()));
    let answers;
    try {
        const reply = await ask.ask({
            questions,
            ...(invocation.agent !== undefined ? { agent: invocation.agent } : {}),
            signal: invocation.signal,
        });
        answers = reply.answers;
    }
    catch (error) {
        // NO_PROVIDER (headless, no answerer) or an aborted/failed ask: degrade to
        // the manual recipe instead of a raw error dump.
        const detail = error instanceof Error ? error.message : String(error);
        return { kind: 'error', text: `${format(strings.askFailed, { error: detail })}\n\n${strings.manualHint}` };
    }
    // A declined panel (no answer rows at all) changes nothing.
    const disableSelected = selectedOf(answers, DISABLE_QUESTION_ID);
    const optInSelected = selectedOf(answers, OPT_IN_QUESTION_ID);
    if (disableSelected === undefined && optInSelected === undefined) {
        return { kind: 'success', text: strings.noChanges };
    }
    // Resolve the desired state. Q1's checked set IS the new disabledAgents
    // list; Q2's ptc selection overrides the ptc-subagent entry (selected =
    // enabled, unselected = disabled-parked when the file exists).
    const desiredDisabled = new Set(disableSelected ?? currentDisabled);
    const ptcSelected = (optInSelected ?? []).includes('ptc-subagent');
    if (ptcSelected) {
        desiredDisabled.delete('ptc-subagent');
    }
    else if (optInSelected !== undefined && existsSync(join(deps.agentsDir, 'ptc-subagent.md'))) {
        desiredDisabled.add('ptc-subagent');
    }
    // Install the selected opt-in templates (never overwrite; never delete).
    const installed = [];
    const alreadyPresent = [];
    const installFailures = [];
    for (const raw of optInSelected ?? []) {
        if (!OPT_IN_AGENT_IDS.includes(raw))
            continue;
        const result = installOptInAgent(deps.agentsDir, raw, deps.language);
        if (result.kind === 'installed')
            installed.push(raw);
        else if (result.kind === 'already-present')
            alreadyPresent.push(raw);
        else
            installFailures.push(format(strings.installFailedLine, { id: raw, error: result.message }));
    }
    // Persist: one settings write carrying both keys (only the changed ones).
    const ops = [];
    const sameSet = (a, b) => {
        const left = [...a].sort();
        const right = [...b].sort();
        return left.length === right.length && left.every((v, i) => v === right[i]);
    };
    if (!sameSet(desiredDisabled, currentDisabled)) {
        // Stable order: keep the current list's order for surviving entries, then
        // append additions.
        const merged = [...currentDisabled.filter((name) => desiredDisabled.has(name))];
        for (const name of desiredDisabled) {
            if (!merged.includes(name))
                merged.push(name);
        }
        ops.push({ op: 'set', path: ['disabledAgents'], value: merged });
    }
    const desiredPtc = ptcSelected;
    // Only consult the switch when Q2 was actually answered — a declined
    // opt-in question never flips ptcEnabled.
    const ptcChanged = optInSelected !== undefined && desiredPtc !== deps.isPtcEnabled();
    if (ptcChanged) {
        ops.push({ op: 'set', path: ['ptcEnabled'], value: desiredPtc });
    }
    if (ops.length > 0) {
        const persistMessage = await writeRegistryConfig(deps.ctx, ops);
        if (persistMessage !== undefined) {
            return {
                kind: 'error',
                text: `${format(strings.persistFailed, { error: persistMessage })}\n\n${strings.manualHint}`,
            };
        }
    }
    // Report. The desired-vs-current diff drives the summary lines; an answer
    // that repeats the current state is a reported no-op (nothing was written,
    // so no refresh is triggered either).
    const newlyDisabled = [...desiredDisabled].filter((name) => !currentDisabled.includes(name)).sort();
    const newlyEnabled = currentDisabled.filter((name) => !desiredDisabled.has(name)).sort();
    const changed = ops.length > 0
        || newlyDisabled.length > 0
        || newlyEnabled.length > 0
        || installed.length > 0
        || alreadyPresent.length > 0
        || installFailures.length > 0
        || ptcChanged;
    if (!changed)
        return { kind: 'success', text: strings.noChanges };
    // Apply the hot toggle to the tool descriptions (the volatile write swapped
    // the value in place; the refresh just re-reads it). Best-effort.
    const notes = [strings.savedHeader];
    try {
        await deps.refreshRoster();
        notes.push(strings.rosterRefreshed);
    }
    catch (error) {
        notes.push(format(strings.rosterRefreshFailed, { error: error instanceof Error ? error.message : String(error) }));
    }
    if (newlyDisabled.length > 0)
        notes.push(format(strings.disabledLine, { names: newlyDisabled.join(', ') }));
    if (newlyEnabled.length > 0)
        notes.push(format(strings.enabledLine, { names: newlyEnabled.join(', ') }));
    if (installed.length > 0)
        notes.push(format(strings.installedLine, { ids: installed.join(', ') }));
    if (alreadyPresent.length > 0)
        notes.push(format(strings.presentLine, { ids: alreadyPresent.join(', ') }));
    notes.push(...installFailures);
    if (ptcChanged)
        notes.push(desiredPtc ? strings.ptcEnabledLine : strings.ptcDisabledLine);
    return { kind: 'success', text: notes.join('\n') };
}
//# sourceMappingURL=subagents-command.js.map