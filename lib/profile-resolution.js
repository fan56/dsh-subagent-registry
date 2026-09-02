/**
 * Profile-aware runtime synthesis for custom agents (the read side of the
 * model-profile feature, shared with dsh-tui-pi).
 *
 * Model profiles let a workspace pin itself to a named profile via a
 * `.dsh-profile` dot file (nearest one walking up from the start dir wins),
 * and a profile records per-agent model/thinking overrides in
 * `$DSH_HOME/model-profiles.json` (or `~/.dsh/model-profiles.json` when
 * `$DSH_HOME` is unset) — see dsh-tui-pi/src/model-profiles.ts for the write
 * side. The global `~/.dsh/agents/*.md` frontmatter stays the BASELINE; the
 * effective runtime values for one spawn are composed at use time as:
 *
 *   effective = profile override ⊕ baseline
 *     (nearest pin → named profile's per-agent override, else the
 *      agent file's frontmatter model/thinking)
 *
 * Everything here is defensive by design: a missing/corrupt
 * `model-profiles.json`, an unreadable/blank pin file, an unknown profile or
 * an unlisted agent all degrade to the baseline — never a throw.
 *
 * @module dsh-subagent-registry/profile-resolution
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dshHome, THINKING_LEVELS } from "./agents-dir.js";
/** The workspace pin file name — same convention as dsh-tui-pi (`.nvmrc` style). */
export const PROFILE_PIN_FILE = '.dsh-profile';
/** `$DSH_HOME/model-profiles.json` (or `~/.dsh/...` when `$DSH_HOME` is unset). */
export function modelProfilesPath(home = dshHome()) {
    return join(home, 'model-profiles.json');
}
/**
 * Parse the text of one `.dsh-profile` file: blank lines and `#` comments
 * are skipped; the first remaining line, trimmed, is the profile name.
 * Returns `undefined` when the file names no profile (blank/comment-only).
 */
function parsePinName(text) {
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('#'))
            continue;
        return line;
    }
    return undefined;
}
/**
 * Find the nearest `.dsh-profile` pin walking up from `startDir` (default
 * `process.cwd()`) to the filesystem root. Mirrors dsh-tui-pi's pin
 * semantics: the nearest file that NAMES a profile wins; a pin file at a
 * nearer level that is blank/comment-only or unreadable is skipped and the
 * walk continues upward. Returns the trimmed profile name, or `null` when
 * nothing is found. Never throws.
 */
export function workspaceProfileName(startDir) {
    let current = resolve(startDir ?? process.cwd());
    // Bounded by the directory depth; `/`'s parent is itself.
    while (true) {
        const candidate = join(current, PROFILE_PIN_FILE);
        try {
            if (existsSync(candidate)) {
                const name = parsePinName(readFileSync(candidate, 'utf8'));
                if (name !== undefined)
                    return name;
            }
        }
        catch {
            // An unreadable pin file is treated as absent — never block resolution.
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
/**
 * Defensively read the whole `$DSH_HOME/model-profiles.json` document (or
 * `~/.dsh/model-profiles.json` when `$DSH_HOME` is unset). Any failure —
 * missing file, unreadable, invalid JSON — resolves `null`, never throws.
 * The value is returned raw (parsed JSON); consumers narrow what they need.
 */
export function readModelProfilesDoc() {
    try {
        return JSON.parse(readFileSync(modelProfilesPath(), 'utf8'));
    }
    catch {
        return null;
    }
}
/** Narrow a non-null, non-array object value. */
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** A recorded override survives only as a non-empty string. */
function stringField(record, key) {
    const value = record[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
}
/** Only THINKING_LEVELS values are valid reasoning efforts. */
function isThinkingLevel(value) {
    return THINKING_LEVELS.includes(value);
}
/** The baseline fallback: non-empty base values only, nulls omitted. */
function baselineFrom(base) {
    const result = {};
    if (typeof base.model === 'string' && base.model !== '')
        result.model = base.model;
    if (typeof base.thinking === 'string' && isThinkingLevel(base.thinking))
        result.thinking = base.thinking;
    return result;
}
/**
 * Compose the effective model/thinking for one agent spawn:
 *
 *   effective = profile override ⊕ baseline
 *
 * - Find the nearest `.dsh-profile` pin starting at `opts.startDir` (default
 *   `process.cwd()`); no pin → the baseline.
 * - Look the pinned profile name up (case-insensitive) in
 *   `$DSH_HOME/model-profiles.json`; a missing/corrupt store or an unknown
 *   profile → the baseline.
 * - Per field: a recorded non-empty override wins; an absent/empty value
 *   falls back to `base` (an empty recorded entry is "explicit inherit").
 *   `thinking` is whitelisted against THINKING_LEVELS — an unlisted value is
 *   treated as absent too, so a hand-edited store can never ship a
 *   host-rejected effort id.
 * - `base` keys are emitted as-is when non-empty; null/empty base values are
 *   omitted, the same way an absent frontmatter key means "inherit".
 *
 * Agent-name lookup is exact (agent keys are file basenames), matching the
 * write side's per-agent map. Never throws; every read failure degrades to
 * the baseline.
 */
export function composeAgentRuntime(agentName, base, opts) {
    const effective = baselineFrom(base);
    const pinName = workspaceProfileName(opts?.startDir);
    if (pinName === null)
        return effective;
    const doc = readModelProfilesDoc();
    if (!isRecord(doc))
        return effective;
    if (!Array.isArray(doc.profiles))
        return effective;
    const needle = pinName.trim().toLowerCase();
    const profile = doc.profiles.find((candidate) => isRecord(candidate) &&
        typeof candidate.name === 'string' &&
        candidate.name.trim().toLowerCase() === needle);
    if (profile === undefined)
        return effective;
    if (!isRecord(profile.agents))
        return effective;
    const entry = profile.agents[agentName];
    if (!isRecord(entry))
        return effective;
    const model = stringField(entry, 'model');
    if (model !== undefined)
        effective.model = model;
    const thinking = stringField(entry, 'thinking');
    if (thinking !== undefined && isThinkingLevel(thinking))
        effective.thinking = thinking;
    return effective;
}
//# sourceMappingURL=profile-resolution.js.map