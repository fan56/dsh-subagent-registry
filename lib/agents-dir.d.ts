/**
 * Agent definitions as markdown files — one file per agent, mirroring the
 * dsh "one file per agent" convention.
 *
 * An agent is `<agents-dir>/<name>.md` with a `---` frontmatter block and a
 * markdown body that doubles as the agent's system prompt:
 *
 *   ---
 *   name: workhorse
 *   display_name: 牛马狗
 *   description: "牛马狗：干活的主力……"
 *   model: opencode-go/deepseek-v4-flash
 *   thinking: high
 *   deep: 1
 *   background: true
 *   ---
 *   You are 牛马狗 …
 *
 * Frontmatter keys are parsed loosely (`key: value`, optional surrounding
 * quotes); `name` is required, `description` feeds the tool roster, `model`
 * is a dsh `provider/model` route, `deep` is the spawn-depth budget (the
 * dsh-ui /agent manager uses it: default 1 = may start subagents, 0 = leaf
 * that runs but cannot spawn), `thinking` holds a reasoning effort id
 * from the THINKING_LEVELS whitelist (an unknown value marks the file broken),
 * and `background` opts the agent into continuable dispatch (a strict
 * `true`/`false`; anything else marks the file broken).
 * The body is kept verbatim and doubles as the child's persona.
 *
 * This module is a self-contained copy of the parsing helpers from the dsh
 * terminal UI's agent manager (dsh-tui-pi/src/agent-manager.ts) with no
 * dependency on that package.
 */
/** Valid frontmatter `thinking` values, in canonical order. */
export declare const THINKING_LEVELS: readonly ["off", "low", "medium", "high", "max"];
/** A reasoning effort id accepted in the `thinking` frontmatter key. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** One agent's frontmatter-derived metadata (the editable surface). */
export interface AgentMeta {
    /** File basename without `.md` — required, the stable agent id. */
    name: string;
    /** Optional display name, shown before `name` in a picker. */
    displayName?: string;
    /** Optional one-line summary used as the tool-roster subtitle. */
    description?: string;
    /** Optional 8-color label (red/blue/green/yellow/purple/orange/pink/cyan). */
    color?: string;
    /** dsh model route (`provider/model`); absent = inherit the default. */
    model?: string;
    /** Reasoning effort id (one of THINKING_LEVELS); absent = inherit. */
    thinking?: ThinkingLevel;
    /** Spawn-depth budget: default 1 (may start subagents), 0 = leaf (runs, no spawn). */
    deep: number;
    /**
     * Dispatch the agent as a durable continuable (background) child by default:
     * `use_agent` returns the child's id immediately and follow-ups go through
     * `ask_agent` / `send_message`. Absent = foreground one-shot.
     */
    background?: boolean;
}
/** A parsed agent file: metadata + the raw system-prompt body. */
export interface AgentFile {
    path: string;
    meta: AgentMeta;
    body: string;
}
/** One parse outcome: a usable agent, or a broken file with a reason. */
export type AgentParseResult = {
    ok: true;
    agent: AgentFile;
} | {
    ok: false;
    error: string;
};
/** Expand a leading `~` to the user's home directory. */
export declare function expandHome(dir: string): string;
/**
 * The dsh home directory: `$DSH_HOME` when set, `~/.dsh` otherwise — the
 * same resolution the dsh host and dsh-tui-pi use, so every dsh-owned file
 * (agents, model-profiles.json, sessions, …) lives under one root.
 */
export declare function dshHome(): string;
/** The dsh agents directory default (`$DSH_HOME/agents`, i.e. `~/.dsh/agents`). */
export declare function agentsDir(): string;
/**
 * Parse one agent markdown file. Tolerates CRLF, quotes, and non-key lines
 * inside the frontmatter; `name` is required, `deep` must be a non-negative
 * integer when present (absent defaults to 1). The body is kept verbatim.
 */
export declare function parseAgentMarkdown(text: string, path: string): AgentParseResult;
/** List agents under `dir` (top level only), broken files reported aside. */
export declare function listAgentFiles(dir: string): {
    agents: AgentFile[];
    broken: Array<{
        path: string;
        error: string;
    }>;
};
