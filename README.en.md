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
- **Role-aware delegation guidance** — Concise English guidance directs delegation to a matching custom role with a self-contained prompt and dispatches independent tasks as parallel top-level subagents in the background. It applies only where this plugin's dispatch tool is visible; unloading restores the host guidance. **No nested delegation**: children are stripped of every spawn tool and only complete their own task.
- **Background dispatch + two-way follow-ups** — `background: true` runs the
  agent as a durable background conversation while the parent keeps working;
  `ask_agent` sends a follow-up and waits for the reply.
- **Three personas out of the box** — `workhorse` / `oldfox` / `rubber-duck`
  are seeded on first start (see below).
- **The /registry-config management command** — wizard-based enable/disable for any
  roster agent (a `disabledAgents` config-key filter that never touches md
  files), opt-in agent installs, and the codemode toolchain switch (below).
- **Opt-in PTC capability** — 0.18.0 merges the entire `@aiwayds/dsh-ptc-subagent`:
  the `codemode` tool (jev decisions + session-scoped store) registers behind
  the `ptcEnabled` gate, fully off by default (below).
- **⚠️ Experimental — disabled by default** — the two opt-in agents
  (`ptc-subagent` / `minimal-subagent`) and the whole codemode (PTC) toolchain
  are an experimental product surface: the capability has migrated and merged,
  but everything ships off and only an explicit `/registry-config` check or the
  `ptcEnabled` config keys turn it on (below).
- **⚠️ Experimental — disabled by default: use Gemini plan quota through `agy`** —
  `agyEnabled` defaults to `false`; with it on, `agy` appears in the `use_agent`
  roster (not in `ask_agent`). It runs on the Google Gemini AI Pro plan quota:
  the registry ships its own ACP client that talks directly to `agy acp`, with
  no profile dependency and no DeepSeek quota, and agy usage does not enter
  dsh's usage accounting (see below).
- **Built on the official subagent machinery** — no reimplementation: every
  custom agent starts through dsh's stock `spawn` provider, so each child is a
  real dsh subagent (full session, persistence, continuable). New capabilities
  in the official subagent stack (bidirectional messaging with the parent, say)
  are inherited automatically, and the main conversation keeps the native
  `subagent` tool. The child tool surface drops every spawn tool — `subagent` /
  `subagent_fork` / `use_agent` included — so a child cannot spawn subagents;
  any nested dispatch attempt is refused.
- **Pure plugin** — supports only DSH `0.2.2-rc.5` (schemastery `3.19.x`, peer range `>=0.2.2-rc.5 <0.2.3-0`); older RCs and the alpha line are unsupported; uninstalls cleanly at any time.

Dispatch goes through the `0.2.2-rc.5` host's public `startActivation`, with `caller` delivery for foreground work; the persona and leaf tool filter are installed on the child's own agent scope at the `subagent/start` edge (the same section and window the host's own composition uses) instead of riding the request. A selected call's failure is propagated without retrying through another dispatch API. Foreground resume uses public `agents.resume` with current composition and caller cancellation, but is outside manager capacity and `interrupt_agent` control; resumed children cannot use stock `send_message` to contact the parent. Background follow-ups remain managed. Failure to inspect or resume a selected session is an error; use explicit `fresh: true` to restart.

### Top-level delegation only, no nesting (`0.2.2-rc.5`, breaking)

- **No nested delegation** — the child tool surface drops every tool that can spawn an agent — `subagent` / `subagent_fork` / `use_agent` included; a child that tries to delegate again (including a caller whose identity cannot be verified) is refused with the stable code `DSH_REGISTRY_NESTED_DELEGATION_UNSUPPORTED`. The child only completes its own task and derives no descendants.
- **The plugin guard covers only this plugin's start/resume tools** — `use_agent` / `ask_agent` and every dispatch or resume entry point re-check top-level caller identity before any host call. The host's native `subagent` / `subagent_fork` tools are host-managed: nesting through them is outside this plugin's control, and no promise is made to block it.
- **Non-agent CLI/API callers do not call the registry dispatch tools directly** — `use_agent` / `ask_agent` are for model callers with a verifiable top-level agent identity; a direct CLI/API call without one is refused by the same guard with the same error code. Start from the main conversation or use host-native mechanisms instead. Calls made by a top-level agent inside a CLI/TUI session are unaffected (the roster is still re-read per invocation; see "Subagent preset manager").
- **No descendant join, aggregation or lineage cancel** — the registry no longer waits for or summarizes descendants, and there is no lineage-wide cancellation; a foreground `use_agent` returns only that child's own result.
- **The main agent orchestrates multi-step work** — when several steps are needed, run them sequentially in the main agent or dispatch several top-level subagents in parallel; do not push the delegation chain down into a child.
- **`deep` and `maxDepth` are deprecated and ignored at runtime** — the `deep` frontmatter and the host `maxDepth` config are retained for compatibility only; they no longer tighten depth or enable nested orchestration. Do not configure them for nested orchestration.

## The three shipped agents (the seed trio) + two opt-ins

Seeded into `~/.dsh/agents/` on first start (only when the directory holds no
parsable agent — your edits are never overwritten). All three are ordinary
markdown files: edit them freely.

| Agent | Role | Example |
| ----- | ---- | ------- |
| **workhorse** (牛马狗) | The workhorse: writes code, investigates, tests, deploys — all the grunt work; default `deepseek-flash`, guarded against dangerous operations | "Use workhorse to turn the release checklist into a table" |
| **oldfox** (老法师) | The advisor who doesn't build: analysis, trouble shooting, review, audits — checks, never implements; `glm-5.3` | "Have oldfox review this design" |
| **rubber-duck** (小黄鸭) | Multimodal visual agent: reads screenshots / charts / handwriting, draws plotext / mermaid / matplotlib figures; runs on an image-capable model | "Use rubber-duck on this screenshot, extract the page text" |

Two **opt-in agents** ship alongside (not installed by default):
⚠️ **Experimental — disabled by default**. `ptc-subagent` (the batch
decision-work specialist; linked to the codemode toolchain) and
`minimal-subagent` (the terminal-only executor, a leaf) — the capability has
migrated and merged, but the product surface stays experimental until it
graduates: nothing is installed or enabled until you explicitly check them in
the `/registry-config` command (or copy
`templates/opt-in-agents/<language>/<name>.md` from the package by hand and
write the config keys); existing files are never overwritten, unchecking never
deletes. The seed is the trio only — opt-ins are never installed automatically.

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
(`off/low/medium/high/max`; absent = inherit), `deep` (deprecated, retained
for compatibility but ignored at runtime — every child is a leaf and may not
spawn subagents), `background` (`true` = dispatch in the background by default).
Unknown keys are silently ignored.

### Concurrency and round limits (since 0.1.7)

**Concurrency is owned by the official dsh-subagent service** — this plugin
keeps no concurrency counter or queue of its own (the official
ActivationManager schedules): `maxActiveSubagents` (live-children cap,
default `8`) is a volatile field, tunable without a restart — via a profile
patch `subagent: { maxActiveSubagents: N }` or at runtime with
`settings.update('subagent', …)`.

**Do not configure `maxDepth` / `deep` for nested orchestration (both are
deprecated)**: the `maxDepth` (delegation-depth cap) host key and the `deep`
frontmatter are retained for compatibility and ignored at runtime; nested
delegation is not supported and a child cannot derive descendants.

`maxRounds` (a per-agent turn budget) **stays**: the official subagent seam
has no round-budget capability, and the key is still consumed by the host
TUI's hard-stop ladder.

→ **Full reference**: [docs/AGENT-FORMAT.md](docs/AGENT-FORMAT.md) — every key's
validation and failure modes, `thinking` semantics, resume mechanics,
background dispatch, configuration fields, known limitations.

## Plugin config (entry config)

The config hangs on the patch mount block that loads the plugin (the `config:`
section of the cordis.patch.yml `insert` entry):

| Key             | Default         | Description                                                                                       |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `agentsDir`     | `~/.dsh/agents` | Agent file directory; the default literal is resolved against `$DSH_HOME`, custom values are used verbatim after `~` expansion. |
| `provider`      | `spawn`         | Subagent provider (reuses dsh-base's `spawn`).                                                    |
| `toolName`      | `use_agent`     | Dispatch tool name.                                                                               |
| `askToolName`   | `ask_agent`     | Follow-up tool name.                                                                              |
| `leafDenyTools` | `[]`            | Tool deny list for children (every child is a leaf; no nesting); empty = static default intersected with the host's registered tools. |
| `resume`        | `auto`          | Resume mode: `auto` / `opt-in` / `off`.                                                           |
| `language`      | `zh`            | UI language: `zh` (Chinese, the default) / `en` (English) / `ru` (Русский) / `es` (Español). Affects the web management panel texts, the bundled skill body and its model-facing routing description, and the agent templates seeded on first install (`templates/agents/<language>/`); restart dsh after changing. Existing agent files are never rewritten. |
| `disabledAgents` | `[]` (volatile) | **The roster toggle**: listed agent names vanish from the `use_agent`/`ask_agent` rosters and calls by name are refused; **a pure roster filter that never touches agent files**. Volatile writes hot-apply; the `/registry-config` command writes it for you, and the execute path re-checks the live value (a model hard-naming a disabled agent is refused). |
| `ptcEnabled`    | `false`         | **The opt-in gate**: false (default) registers nothing extra; true registers the `codemode` tool at standing scope (visible to the main agent and every dispatched subagent) on the next plugin mount (dsh restart). Experimental — disabled by default. |
| six jev keys    | see the ptc section | The volatile jev configuration: `jevEnabled` (default false = zero jev calls) / `jevBackend` (zen) / `jevModel` ('' = backend default) / `jevTimeoutMs` (3000) / `jevSecretFile` ('') / `storageDir` ('' = `<dsh home>/storages/ptc-subagent`). |
| five `agy*` keys | see the next section | Experimental agy member config (disabled by default): `agyEnabled` (default false, non-volatile) / `agyPermission` (reject) / `agyTimeoutMs` (600000) / `agyHandshakeTimeoutMs` (20000) / `agyMaxConcurrent` (1); the last four are volatile. |

## The /registry-config command

Type `/registry-config` in the session to open the management wizard (two
multi-select questions through ask_user_question):

1. **The disable toggle**: check the agents to disable (the checked set
   becomes the new `disabledAgents`; nothing checked = all enabled; currently
   disabled names must STAY checked to remain disabled — option descriptions
   mark the current state). The scope covers every roster agent (including
   your own), and **no md file is ever touched**.
2. **Opt-in installs**: check `ptc-subagent` / `minimal-subagent` to install
   (⚠️ Experimental — disabled by default). Template copy; existing files
   never overwritten; unchecking never deletes. Selecting ptc links
   `ptcEnabled: true` and copies the md;
   unselecting links the reverse (writes false and parks ptc-subagent in
   `disabledAgents`, the copied md is kept).

Timing: `disabledAgents` is volatile — the command refreshes the roster at the
end, so it applies immediately; a `ptcEnabled` change waits for the next plugin
mount (dsh restart). On a headless deployment without an ask surface (the ask
rejects with NO_PROVIDER) the command degrades to an error message with the
manual recipe (the `disabledAgents` / `ptcEnabled` keys plus copying
`templates/opt-in-agents/<language>/<name>.md` by hand).

## The ptc capability (opt-in: the codemode tool)

> ⚠️ **Experimental — disabled by default**: the capability has migrated and
> merged, the product surface stays experimental; `ptcEnabled: false` (the
> default) registers no tool.

Since 0.18.0 this package carries the entire former `@aiwayds/dsh-ptc-subagent`:
the `codemode` tool is a plugin-owned PTC runner — async TypeScript program
bodies over the public `ctx.ptcRuntime` seam, with a binding pair purpose-built
for batch work: **`jev`** (one calibrated decision backend; `classify` answers
a batched set of choice/score/noul questions in one round trip and resolves
structured `{error}` results instead of rejecting; a 1:1 passthrough to
`@aiwayds/dsh-jev-core`) and **`store`** (session-scoped key/value memory on
the durable session log — survives resume, fork-separated; 256KB per value,
1MB per branch). A failed run returns through the host's own `CODE_RUN_FAILED`
contract (failure kind + captured logs); the result reports
`{value, logs, jevCalls, storeWrites}`.

- **Everything ships off**: `ptcEnabled: false` registers no tool;
  `jevEnabled: false` makes zero jev calls. Every jev call (failures included)
  appends one row to `<dsh home>/storages/ptc-subagent/usage.jsonl` (metadata
  and token counts only, never state text).
- **What comes with it**: the `ptc-subagent` opt-in template is the dedicated
  dispatch role; since 0.19.1 the bundle patch carries only the two guarded
  preset rows (`preset-native` / `preset-codemode`, disabled on profiles that
  select `@deepseek-ai/dsh-web-app`) — the two service rows
  (`agent-preset-registry` / `subagent-model-selection-settings`) mount at
  runtime on the include tree instead, only where no same-id entry exists, so
  a profile that already mounts an agent-preset layer needs no manual
  de-duplication (issue #9, see docs/TROUBLESHOOTING-PRESET-ROWS.md).
- **Upgrading from the standalone ptc repo**: usage and config keys keep their
  names and meanings (the entry id becomes `dsh-subagent-registry`), the
  usage.jsonl path is unchanged, and existing records carry over.

## Experimental: Gemini plan quota through `agy` (disabled by default)

> ⚠️ **Experimental — disabled by default**: this section applies only when
> `agyEnabled: true`; with the default off, nothing changes for existing users.

**What it is.** `agy` is the Antigravity CLI. With the switch on, the registry
uses its own bundled ACP client to talk directly to the local `agy acp` and runs
on your **Google Gemini AI Pro plan quota** — no profile dependency, no DeepSeek
quota, and agy usage does **not** enter dsh's usage accounting. `agy` appears in
the `use_agent` roster, **not in `ask_agent`** (follow-ups there address
background dsh subagents; agy is a one-shot foreground dispatch). If a local
`~/.dsh/agents/agy.md` exists, the roster lists that ordinary dsh member file
instead of the built-in agy.

**How to turn it on.** In the session, type `/registry-config` and check
`agy (Gemini plan · experimental)` in the opt-in question (checking writes
`agyEnabled: true`, unchecking writes `false`; the flip takes effect on the next
plugin mount / dsh restart). Once on, you can still check `agy` in the disable
question to drop it from the roster (`disabledAgents`, hot-applies, touches no
files). When the wizard cannot open (no ask surface), edit the `config:` of the
registry row in `~/.dsh/profiles/<profile>/cordis.patch.yml` by hand: add
`agyEnabled: true`, then restart dsh.

Config keys (all on the registry row's `config:` section, also shown as comments
in the default `cordis.patch.yml`):

| Key | Default | Description |
| --- | --- | --- |
| `agyEnabled` | `false` | Experimental master switch (non-volatile): `true` registers the ACP provider and puts `agy` in the `use_agent` roster; flipping it needs a dsh restart. |
| `agyPermission` | `reject` | How the registry answers agy's ACP permission requests: `reject` = do not answer on the user's behalf (actual permissions are decided by the local agy's own settings); `allow` = answer with allow. Volatile, read per call. |
| `agyTimeoutMs` | `600000` | Per-task deadline after handshake (ms, 10 min); a timeout returns partial output. Volatile. |
| `agyHandshakeTimeoutMs` | `20000` | `initialize` + `session/new` handshake deadline (ms). Volatile. |
| `agyMaxConcurrent` | `1` | Concurrent agy runs per dsh process; the second call fails immediately with `ACP_BUSY` (no queue). Volatile. |

**Limitations (as they are, not TODOs or defects).**

- **Foreground only, no resume**: `background: true` / `resume` / `fresh` all fail
  with `ACP_FOREGROUND_ONLY`; re-dispatch after a failure rather than resuming.
- **Concurrency 1**: only one agy run per dsh process at a time; the second call
  fails immediately with `ACP_BUSY` (no queue) — dispatch one at a time.
- **Each call returns only after the agy process exits**: task time plus exit
  grace, up to ~9 s; the first call takes ~20–30 s (cold start ~20 s).
- **Not in the subagent panel and not individually interruptible from it**: agy
  is an external process with no local dsh Session; press Esc to cancel the
  current tool call.
- **Requires a locally installed and logged-in `agy`**: absent or not logged in
  means no `agy` in the roster, or an `ACP_AUTH_REQUIRED` diagnostic.
- **Platform**: macOS / Linux; Windows is unverified.

**Security.** agy's actual permissions are decided by the **local agy's own
settings** (the machine may be `always-proceed`, in which case agy sends no
permission request at all and everything proceeds). The registry only forwards
ACP permission requests and answers them per `agyPermission`; it **does not
restrict what agy can do** — dispatching it into a directory means it reads and
writes files and runs commands there, and that directory's hooks run; treat
review-only scenarios as high risk.

## Bundled skill

The plugin ships a bundled skill named `dsh-subagent-registry-config`. Whenever the
conversation touches custom subagents, agent `.md` authoring, resume semantics,
or this plugin's configuration, dsh loads the bundled usage & configuration
guide, so the model can write agent files for you (collecting choices via
`ask_user_question`) and adjust the plugin config without digging through the
README. The skill is versioned and published with the package
(`skills/dsh-subagent-registry-config/SKILL.md`, plus an English `SKILL.en.md`,
a Russian `SKILL.ru.md` and a Spanish `SKILL.es.md` selected by the `language`
key — see the table above).

## Installation

**Requires DSH `0.2.2-rc.5` only** (schemastery `3.19.x`; peer range `>=0.2.2-rc.5 <0.2.3-0`). Older RCs and the alpha line are unsupported, and cross-version migration is not provided. The host must mount session persistence and `sessionQuery`.

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
npm run test:hosts # same compiled plugin against the published 0.2.2-rc.5 closure, with version checks
npm run probe:npm # real npm consumer install probe under default peer resolution; needs network (same as CI's npm-install-probe job)
```

Prepare isolated SDKs from the plugin directory (reuse existing closures when available):

```sh
npm install --prefix ../../.tmp/dsh-type-closure-022rc5 --ignore-scripts @deepseek-ai/dsh@0.2.2-rc.5 @deepseek-ai/dsh-session-query@0.2.2-rc.5
```

Override `DSH_TEST_022RC5_CLOSURE_DIR` with another isolated `node_modules` directory. Only model responses are scripted; host services and persistence use the actual `0.2.2-rc.5` implementations.

### The `@deepseek-ai/*` dependency contract (why optional peers)

This repo declares the `@deepseek-ai/*` packages (`cordis`, `dsh-subagent`,
`dsh-llm`, `schemastery`, …) as **optional peerDependencies** in releases
(`>=0.2.2-rc.5 <0.2.3-0`; `schemastery` at `~3.19.0`). That is a deliberate two-layer split:

- **Release semantics (for consumers)**: the declaration says "use the host's
  own copies, range `>=0.2.2-rc.5 <0.2.3-0`". Optional peers are never auto-installed
  by pnpm or npm, so they cannot materialize a second copy in the profile's
  `node_modules` that shadows the host's bundled closure. What does break
  hosts is a hard dependency pinned to an old rc — that can render the
  supported `0.2.2-rc.5` host unbootable (a known community failure mode).
- **Dev typecheck (for this repo)**: devDependencies pin the `0.2.2-rc.5` closure;
  `scripts/link-dsh-closure.mjs` (the root `prepare` install hook; also
  runnable as `npm run link-closure`) symlinks
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

Apache-2.0
