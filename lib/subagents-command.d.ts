/**
 * The `/subagents` slash command — the plugin's management wizard over the
 * two configuration surfaces it owns:
 *
 * 1. **The roster toggle** (`disabledAgents`, volatile): a multi-select
 *    question listing every roster agent; the checked set BECOMES the new
 *    `disabledAgents` list (default = nothing checked = all enabled). The
 *    toggle is a pure roster filter — agent `.md` files are never touched.
 *    The volatile write hot-swaps in place, so the trailing
 *    `refreshRoster()` applies it to the tool descriptions immediately.
 * 2. **The opt-in agents** (`ptc-subagent` / `minimal-subagent`): a
 *    multi-select over the templates shipped under
 *    `templates/opt-in-agents/`. Checking one installs its template into the
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
import type { Context } from '@deepseek-ai/cordis';
import type { Language } from './preset-contract.ts';
import { type AgentFile } from './agents-dir.ts';
import { type DisabledAgentsInput } from './tool-run-agent.ts';
/** Structural ask question (mirrors AskUserQuestionItem's used fields). */
interface AskQuestionItem {
    id: string;
    question: string;
    detail?: string;
    header?: string;
    options?: AskOptionItem[];
    multiSelect?: boolean;
}
interface AskOptionItem {
    label: string;
    description?: string;
}
/** Structural command invocation (mirrors CommandInvocation's used fields). */
export interface SubagentsCommandInvocation {
    /** The live root agent the command ran against; scoped asks use it. */
    agent?: unknown;
    rawInput: string;
    signal: AbortSignal;
}
/** Structural CommandResult (the two shapes a handler may return). */
export type SubagentsCommandResult = {
    kind: 'success';
    text?: string;
} | {
    kind: 'error';
    text: string;
};
interface SettingsPathOpLike {
    op: 'set' | 'unset';
    path: readonly string[];
    value?: unknown;
}
/** The plugin's settings namespace = the profile patch entry id. */
export declare const SUBAGENTS_SETTINGS_NAMESPACE = "dsh-subagent-registry";
/** The wizard's string table (one entry per locale/<language>.json key). */
export interface SubagentsStrings {
    commandDescription: string;
    askUnavailable: string;
    askFailed: string;
    manualHint: string;
    qDisableHeader: string;
    qDisableQuestion: string;
    qDisableDetail: string;
    markDisabled: string;
    markEnabled: string;
    qOptInHeader: string;
    qOptInQuestion: string;
    qOptInDetail: string;
    ptcBlurb: string;
    minimalBlurb: string;
    stateInstalled: string;
    stateMissing: string;
    ptcOnNow: string;
    ptcOffNow: string;
    noChanges: string;
    savedHeader: string;
    disabledLine: string;
    enabledLine: string;
    installedLine: string;
    presentLine: string;
    installFailedLine: string;
    ptcEnabledLine: string;
    ptcDisabledLine: string;
    rosterRefreshed: string;
    rosterRefreshFailed: string;
    persistFailed: string;
    settingsUnavailable: string;
}
/**
 * Load the string table for one language from the packaged
 * `locale/<language>.json`. Any read/parse/shape failure falls back to the
 * English edition, then to the English constants (zh files keep the same key
 * set, so a missing zh section degrades to English rather than crash).
 */
export declare function loadSubagentsStrings(language: Language): SubagentsStrings;
/**
 * Persist one batch of path ops into the plugin's entry config. Volatile-only
 * commits hot-swap the running references without remounting (disabledAgents);
 * a non-volatile change (ptcEnabled) remounts the plugin, which is exactly
 * the codemode register/unregister act. Best-effort: a deployment without the
 * settings service reports the failure; a conflict retries once against a
 * fresh revision.
 * @returns undefined on success, the failure message otherwise.
 */
export declare function writeRegistryConfig(ctx: Context, ops: readonly SettingsPathOpLike[]): Promise<string | undefined>;
/**
 * Live `ptcEnabled` reader: the settings surface first (it reflects a write
 * even in the window before the loader remounts), the apply-time value as
 * the fallback.
 */
export declare function makePtcEnabledReader(ctx: Context, applyTimeValue: boolean): () => boolean;
/** Everything the command closes over; built once in `apply`. */
export interface SubagentsCommandDeps {
    ctx: Context;
    /** The resolved (absolute) agents dir. */
    agentsDir: string;
    language: Language;
    /** The live `disabledAgents` value (volatile ref or plain array). */
    disabledAgents: DisabledAgentsInput;
    /** The roster refresh the tool registration exposes. */
    refreshRoster: () => Promise<void>;
    /** Live codemode-switch reader (settings surface first, apply value fallback). */
    isPtcEnabled: () => boolean;
}
/** Question id of the disable toggle (the answer echoes it back). */
export declare const DISABLE_QUESTION_ID = "disable-agents";
/** Question id of the opt-in install (the answer echoes it back). */
export declare const OPT_IN_QUESTION_ID = "opt-in-agents";
/**
 * Register the `/subagents` command on the host command registry. A no-op on
 * a host without the commands service (the dispatch surfaces degrade to the
 * manual config recipe documented in the README).
 */
export declare function registerSubagentsCommand(deps: SubagentsCommandDeps): void;
/** Build the disable-toggle question (roster snapshot + current state marks). */
export declare function buildDisableQuestion(strings: SubagentsStrings, agents: readonly AgentFile[], currentlyDisabled: readonly string[]): AskQuestionItem;
/** Build the opt-in install question (installed/enabled state marks). */
export declare function buildOptInQuestion(strings: SubagentsStrings, agentsDir: string, ptcEnabled: boolean): AskQuestionItem;
/** The wizard body: ask, resolve, install, persist, refresh, report. */
export declare function handleSubagentsCommand(deps: SubagentsCommandDeps, invocation: SubagentsCommandInvocation): Promise<SubagentsCommandResult>;
export {};
