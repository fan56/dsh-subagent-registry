/**
 * Opt-in agent templates: the two agent definitions shipped OUTSIDE the
 * seed roster (`templates/opt-in-agents/<language>/`, separate from
 * `templates/agents/` which only the first-install seeding scans).
 *
 * These are never seeded automatically — a fresh install still starts with
 * exactly workhorse / oldfox / rubber-duck. The `/subagents` command (or a
 * manual copy) installs one into the configured agents dir:
 *
 * - `ptc-subagent` — the batch decision-work specialist; selecting it in the
 *   wizard also flips `ptcEnabled: true` so the codemode tool registers.
 * - `minimal-subagent` — the terminal-only executor; no config linkage.
 *
 * Installation is a one-time copy per agent: an existing `<agentsDir>/<name>.md`
 * is NEVER overwritten, and uninstalling/downgrading never deletes one —
 * once copied, the file belongs to the user (the same ownership rule the
 * seed roster follows).
 *
 * @module opt-in-agents
 */
import type { Language } from './preset-contract.ts';
/** The opt-in agent ids shipped under templates/opt-in-agents/. */
export declare const OPT_IN_AGENT_IDS: readonly ["ptc-subagent", "minimal-subagent"];
export type OptInAgentId = (typeof OPT_IN_AGENT_IDS)[number];
/**
 * The package-shipped opt-in template dir for one language
 * (`<package root>/templates/opt-in-agents/<language>`), resolved relative to
 * the compiled file so it works from any cwd. The `templates` directory ships
 * in the npm `files` list, so the opt-in subdirectory rides every install.
 */
export declare function optInTemplatesDir(language?: Language): string;
/**
 * Absolute template path for one opt-in agent, falling back to the English
 * edition when the configured language has no file for it (a translation may
 * lag a release; the agent itself is language-neutral).
 */
export declare function optInTemplatePath(id: OptInAgentId, language?: Language): string;
/** Outcome of one install attempt. */
export type OptInInstallResult = {
    kind: 'installed';
    path: string;
} | {
    kind: 'already-present';
    path: string;
} | {
    kind: 'error';
    path: string;
    message: string;
};
/**
 * Install one opt-in agent into `targetDir` (under the template's frontmatter
 * `name`, keeping the bytes verbatim). Idempotent and user-owning: an
 * existing `<targetDir>/<name>.md` is never overwritten — the function
 * reports `already-present` and leaves the user's file alone. A broken or
 * missing template is an `error` result, never a thrown exception (the
 * command keeps installing the rest and reports the failures).
 */
export declare function installOptInAgent(targetDir: string, id: OptInAgentId, language?: Language): OptInInstallResult;
