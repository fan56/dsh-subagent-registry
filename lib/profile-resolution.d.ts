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
/** The workspace pin file name — same convention as dsh-tui-pi (`.nvmrc` style). */
export declare const PROFILE_PIN_FILE = ".dsh-profile";
/** `$DSH_HOME/model-profiles.json` (or `~/.dsh/...` when `$DSH_HOME` is unset). */
export declare function modelProfilesPath(home?: string): string;
/**
 * Find the nearest `.dsh-profile` pin walking up from `startDir` (default
 * `process.cwd()`) to the filesystem root. Mirrors dsh-tui-pi's pin
 * semantics: the nearest file that NAMES a profile wins; a pin file at a
 * nearer level that is blank/comment-only or unreadable is skipped and the
 * walk continues upward. Returns the trimmed profile name, or `null` when
 * nothing is found. Never throws.
 */
export declare function workspaceProfileName(startDir?: string): string | null;
/**
 * Defensively read the whole `$DSH_HOME/model-profiles.json` document (or
 * `~/.dsh/model-profiles.json` when `$DSH_HOME` is unset). Any failure —
 * missing file, unreadable, invalid JSON — resolves `null`, never throws.
 * The value is returned raw (parsed JSON); consumers narrow what they need.
 */
export declare function readModelProfilesDoc(): unknown | null;
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
export declare function composeAgentRuntime(agentName: string, base: {
    model?: string | null;
    thinking?: string | null;
}, opts?: {
    startDir?: string;
}): {
    model?: string;
    thinking?: string;
};
