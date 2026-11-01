# dsh-subagent-registry

[中文](./README.md)

Register locally-defined custom agents (`~/.dsh/agents/*.md`) as callable
subagents in [dsh](https://github.com/deepseek-ai/deepseek-harness) — the main
conversation invokes them by name through `use_agent`, background runs take
follow-ups via `ask_agent`, and interrupted runs resume from their saved
partial work. No host patching, no code — a markdown file per agent.

## Why

- **One markdown file is one agent** — frontmatter carries the model/thinking
  settings, the body is the system prompt, changes take effect immediately.
- **Resumes interrupted runs** — after an error, cancellation, token limit or
  crash, the next call for the same agent continues from the saved partial
  work instead of starting over.
- **Role-aware delegation guidance** — Concise English guidance directs delegation to a matching custom role with a self-contained prompt, runs independent tasks in the background, and uses `subagent_fork` only when conversation inheritance is necessary. It applies only where this plugin's dispatch tool is visible; unloading restores the host guidance.
- **Background dispatch + two-way follow-ups** — `background: true` runs the
  agent as a durable background conversation while the parent keeps working;
  `ask_agent` sends a follow-up and waits for the reply.
- **Three personas out of the box** — `workhorse` / `oldfox` / `rubber-duck`
  are seeded on first start (see below).
- **Built on the official subagent machinery** — no reimplementation: every
  custom agent starts through dsh's stock `spawn` provider, so each child is a
  real dsh subagent (full session, persistence, continuable). New capabilities
  in the official subagent stack (bidirectional messaging, say) are inherited
  automatically; the native `subagent` tool keeps working alongside — the two
  coexist without interference.
- **Pure plugin** — supports the RC/stable line's public subagent machinery (compatibility validated through DSH `0.2.0-rc.2` and `0.2.1-rc.2`); uninstalls cleanly at any time. The alpha line is not supported.

Dispatch is selected by public API availability (feature detection, no version-number branches): the 0.2.1 line uses `startActivation` with `caller` / `parent` delivery for foreground/background work; the 0.2.0 line uses `start` / `startContinuable`. A selected call's failure is propagated without retrying through another dispatch API. On the 0.2.1 line the start request no longer carries a child persona or the leaf tool filter — the plugin installs the reserved persona section and leaf restriction on the child's own agent scope at the `subagent/start` edge (the same section and window the host's own composition uses), matching the 0.2.0-line request-field semantics. Foreground resume uses public `agents.resume` with current composition and caller cancellation, but is outside manager capacity and `interrupt_agent` control; resumed children cannot use stock `send_message` to contact the parent. Background follow-ups remain managed. Failure to inspect or resume a selected session is an error; use explicit `fresh: true` to restart.

## The three shipped agents

Seeded into `~/.dsh/agents/` on first start (only when the directory holds no
parsable agent — your edits are never overwritten). All three are ordinary
markdown files: edit them freely.

| Agent | Role | Example |
| ----- | ---- | ------- |
| **workhorse** (牛马狗) | The workhorse: writes code, investigates, tests, deploys — all the grunt work; default `deepseek-flash`, guarded against dangerous operations | "Use workhorse to turn the release checklist into a table" |
| **oldfox** (老法师) | The advisor who doesn't build: analysis, trouble shooting, review, audits — checks, never implements; `glm-5.3` | "Have oldfox review this design" |
| **rubber-duck** (小黄鸭) | Multimodal visual agent: reads screenshots / charts / handwriting, draws plotext / mermaid / matplotlib figures; runs on an image-capable model | "Use rubber-duck on this screenshot, extract the page text" |

## Usage

Install, restart dsh, then just ask in the conversation — the main model picks
the agent by name:

> Use workhorse to turn today's release checklist into a table

Under the hood that is `use_agent(agent: "workhorse", prompt: "…")`. For
background runs, follow up with `ask_agent(agent: "worker", message: "…")` —
it waits for the reply.

## Subagent preset manager

Select **子智能体** in the left sidebar navigation to open a full workspace page. It reads the configured `agentsDir` and supports creating, copying, editing, repairing complete source, and deleting presets. Broken files keep their diagnostics; reading or refreshing an empty directory does not seed files. Existing internal names are fixed. Display-name changes require confirmation because older runs may no longer be found by name.

Opening, refreshing, saving, or deleting refreshes the roster for subsequent model requests without stopping running calls or changing their personas. After manual file edits, reopen or refresh the page. CLI/TUI dispatch still reads each role at invocation; without the Web manager its static roster updates on remount.

Updates preserve unknown fields, comments and untouched body text, reject external revisions, and use full source editing when local changes cannot be preserved safely. Failed saves and cancelled discard confirmations retain the draft. Switching host pages retains the current client's draft; restarting or unloading the plugin does not. Deletion confirms the impact on profiles sharing the directory.

Build and install the client artifact; an existing process may need a restart to load this new plugin entry. Once loaded, preset CRUD needs no restart.

## Define your own

Drop a file into `~/.dsh/agents/`:

```markdown
---
name: my-agent
description: "One-line subtitle shown in the use_agent roster"
model: opencode-go/deepseek-flash
thinking: high
---

You are my-agent. This markdown body is used verbatim as the system prompt.
```

Frontmatter keys: `name` (required), `description`, `display_name`, `model`
(`provider/model`; absent = inherit), `thinking`
(`off/low/medium/high/max`; absent = inherit), `deep` (`0` = leaf, may not
spawn subagents; default `1`), `background` (`true` = dispatch in the
background by default). Unknown keys are silently ignored.

### Concurrency and round limits (since 0.1.7)

**Concurrency and nesting depth are owned by the official dsh-subagent
service** — this plugin keeps no concurrency counter or queue of its own (the
official ActivationManager schedules): `maxActiveSubagents` (live-children
cap, default `8`) and `maxDepth` (delegation-depth cap, default `1`). Both are
volatile fields, tunable without a restart — via a profile patch
`subagent: { maxActiveSubagents: N, maxDepth: M }` or at runtime with
`settings.update('subagent', …)`. The `use_agent` `deep` frontmatter only
tightens within that official depth budget (`deep: 0` leaves strip every
agent-spawning tool outright).

`maxRounds` (a per-agent turn budget) **stays**: the official subagent seam
has no round-budget capability, and the key is still consumed by the host
TUI's hard-stop ladder.

→ **Full reference**: [docs/AGENT-FORMAT.md](docs/AGENT-FORMAT.md) — every key's
validation and failure modes, `deep`/`thinking` semantics, resume mechanics,
background dispatch, configuration fields, known limitations.

## Bundled skill

The plugin ships a bundled skill named `dsh-subagent-registry-config`. Whenever the
conversation touches custom subagents, agent `.md` authoring, resume semantics,
or this plugin's configuration, dsh loads the bundled usage & configuration
guide, so the model can write agent files for you (collecting choices via
`ask_user_question`) and adjust the plugin config without digging through the
README. The skill is versioned and published with the package
(`skills/dsh-subagent-registry-config/SKILL.md`).

## Installation

**Requires dsh >= 0.2.0-rc.2** (the RC/stable line; the alpha line is not supported). Compatibility validated through `0.2.0-rc.2` and `0.2.1-rc.2`. The host must mount session persistence and `sessionQuery`. Resume and follow-ups use each host's own session format; cross-version migration is not provided.

Option A — mount a checkout into a dsh profile:

```sh
dsh plugin --profile tui add ~/github/dsh-subagent-registry
```

Option B — npm dependency: `npm i @aiwayds/dsh-subagent-registry`, then load
the plugin under the stable id `dsh-subagent-registry` in your profile's
config, or mount it through a bundle patch (see `cordis.patch.yml` in this
repo for the pattern).

## Uninstall

```sh
dsh plugin --profile <name> remove @aiwayds/dsh-subagent-registry
```

The host splices the plugin out of the profile; restart dsh and the
`use_agent` / `ask_agent` tools are gone. **Your agent files in
`~/.dsh/agents/` stay** — they are user-owned and never re-seeded or
overwritten. dsh-tui-pi degrades gracefully without this plugin (you just
lose custom-agent dispatch).

## Development

```sh
npm run check    # tsc --noEmit
npm run build    # tsc -> lib/
npm test         # unit regressions and real npm install in a temporary directory (no LLM)
npm run test:host # current SDK's real services/persistence/manager/spawn; scripted model, no network
npm run test:hosts # same compiled plugin, two published SDK closures with version checks
```

Prepare isolated SDKs from the plugin directory (reuse existing closures when available):

```sh
npm install --prefix ../../.tmp/dsh-type-closure-rc2 --ignore-scripts @deepseek-ai/dsh@0.2.0-rc.2 @deepseek-ai/dsh-session-query@0.2.0-rc.2
npm install --prefix ../../.tmp/dsh-type-closure --ignore-scripts @deepseek-ai/dsh@0.2.1-rc.2 @deepseek-ai/dsh-session-query@0.2.1-rc.2 @deepseek-ai/dsh-working-directory@0.2.1-rc.2
```

Override `DSH_TEST_RC2_CLOSURE_DIR` / `DSH_TEST_021_CLOSURE_DIR` with other isolated `node_modules` directories. Only model responses are scripted; host services and persistence use their actual published implementations.

### The `@deepseek-ai/*` dependency contract (why optional peers)

This repo declares the `@deepseek-ai/*` packages (`cordis`, `dsh-subagent`,
`dsh-llm`, `schemastery`, …) as **optional peerDependencies** in releases
(`>=0.2.0-rc.2 || >=0.2.1-rc.1`). That is a deliberate two-layer split:

- **Release semantics (for consumers)**: the declaration says "use the host's
  own copies, range `>=0.2.0-rc.2 || >=0.2.1-rc.1`". Optional peers are never auto-installed
  by pnpm or npm, so they cannot materialize a second copy in the profile's
  `node_modules` that shadows the host's bundled closure. What does break
  hosts is a hard dependency pinned to an old rc — that can render a 0.2.x
  host unbootable (a known community failure mode).
- **Dev typecheck (for this repo)**: devDependencies pin the newer SDK;
  `scripts/link-dsh-closure.mjs` (postinstall) symlinks
  `node_modules/@deepseek-ai/*` to `DSH_CLOSURE_DIR` or the global dsh install's closure, keeping
  exactly one `@deepseek-ai/cordis` in the type graph — a second copy breaks
  the cordis `declare module` augmentation (`Property 'settings' does not
  exist on type 'Context'`).

Maintenance rule: keep these entries as optional peers — never move them back
to dependencies/devDependencies, and never drop `optional: true` (a
non-optional peer is auto-installed under pnpm's `auto-install-peers` and the
second-copy breakage returns). Likewise never add a hard dependency on any of
them: a pinned second copy shadows the host's bundled closure just the same.

## Integration tests

`e2e/podman-install/` installs the **published** tarballs of this plugin, dsh-dcp, dsh-cron, dsh-llm-proxy, and dsh-profile-switch inside a container with a real dsh CLI, using a real npm client with dependency lifecycle scripts on — the exact intersection that let the packaged-`postinstall` breakage (#2) ship unnoticed. It asserts the install exits clean, the closure linker stands down in the consumer tree, the real host composes and boots each profile, and dcp's schema default + explicit-empty semantics survive the real config layer.

- Local (macOS, podman machine up): `e2e/podman-install/run.sh`
- The same assertions run bare on Linux (no podman needed) via the weekly scheduled `e2e install` workflow; `bash e2e/podman-install/entry.sh` works on any node 22+ machine with the global dsh CLI.

## License

MIT
