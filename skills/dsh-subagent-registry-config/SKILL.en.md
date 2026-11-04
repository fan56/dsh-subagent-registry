---
name: dsh-subagent-registry-config
description: "Guide to the dsh subagent registry plugin. Covers custom subagents, use_agent/ask_agent, /registry-config, the agents dir, agent .md, resume, plugin config: ~/.dsh/agents/*.md frontmatter keys, entry config keys (agentsDir…/language/disabledAgents/ptcEnabled/jev*), opt-in installs (ptc-subagent/minimal-subagent; experimental, default off), ask_user_question wizard, diagnostics. Triggers: subagent, agent, /registry-config, disable, disabledAgents, ptc, codemode, resume, debug, язык."
---

# dsh-subagent-registry guide (custom subagents / use_agent)

> dsh plugin: registers `~/.dsh/agents/*.md` as dispatchable custom subagents —
> `use_agent` dispatches by name, `ask_agent` asks a background run a follow-up
> question and waits for its reply, and an interrupted run automatically resumes
> when invoked again. Every subagent is a real dsh session (full session,
> persistence, continuable), running on dsh's built-in `spawn` provider; the
> plugin does not modify dsh itself.

## Dual-host support

The same plugin package has been verified against the actual released SDKs of DSH `0.2.0-rc.2` and `0.2.1-rc.2` (RC/stable lines; the alpha line is not supported). The dispatch method is selected automatically by public API (feature detection): on the old line, foreground `start` and background `startContinuable`; on the new line, `startActivation` with `caller` delivery for foreground and `parent` for background, with the persona and leaf tool restrictions installed on the subagent's own scope at the `subagent/start` edge. A failing interface call errors out immediately — dispatch is never retried through the other interface. Resume and follow-ups each read their own host's session format; no cross-version migration is provided. The host must mount session persistence and `sessionQuery`; the English role-delegation guidance keeps the same wording on both lines.

## Agent definition format (`<agentsDir>/<name>.md`)

One markdown file is one agent: the `---` frontmatter holds metadata, and the body is used **verbatim** as that subagent's persona (system prompt). All frontmatter keys:

| Key            | Required | Default            | Description and failure behavior                                                                       |
| -------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `name`         | yes      | —                  | agent id = file name (without .md). Missing or empty → **the whole file is dropped**.                  |
| `deep`         | no       | `1`                | Non-negative integer. `0` = leaf (can work but is barred from dispatching subagents); `≥1` = a relative depth budget that may dispatch again. Non-integer/negative → whole file dropped. |
| `display_name` | no       | absent             | Optional UI label; the subagent is labeled `display_name ?? name`, and resume/follow-ups find old runs by it. |
| `description`  | no       | absent             | One-line blurb shown in the `use_agent` tool description's roster, for the main model to pick an agent. |
| `model`        | no       | absent = inherit   | `provider/model` route; a value without a slash is treated as a provider name + that deployment's default model. |
| `thinking`     | no       | absent = inherit   | `off`/`low`/`medium`/`high`/`max`, **case-sensitive**; any other value → whole file dropped.            |
| `background`   | no       | absent = foreground | Strictly `true`/`false` (case-sensitive, no abbreviations); any other value → whole file dropped. `true` = dispatched to the background by default, can be followed up via ask_agent. |
| `maxRounds`    | no       | absent = global    | Positive integer, per-agent round cap (overrides the global `dsh-tui.maxRounds`); non-positive-integer → whole file dropped. Consumed by the host TUI's hard-stop ladder. |

Minimal template:

```markdown
---
name: my-agent
display_name: My Agent
description: "One-line blurb shown in the use_agent roster"
model: opencode-go/deepseek-v4-flash
thinking: high
deep: 0
---

You are my-agent. This markdown body is used verbatim as the system prompt.
```

Note: **unknown keys are silently ignored** — `extensions` / `tools` / `color` etc. have no effect (the fun-agent `extensions` convention is not supported here); keeping them only misleads later readers of the file.

## Interactive configuration wizard (ask_user_question)

When the user says "set up an XX subagent for me / add an agent", do not dump the docs on them — use `ask_user_question` to collect answers question by question, then **write the file for them**:

1. **Name + responsibility**: a kebab-case name (= file name), a one-sentence `description` (it goes into the use_agent roster; state clearly when to dispatch it).
2. **Model**: inherit the deployment default (recommended, leave empty) / specify a `provider/model` route.
3. **Thinking level**: unset (inherit default) / off / low / medium / high / max.
4. **Dispatch depth**: `deep: 0` (leaf, barred from spawning subagents) / `deep: 1` (default, may dispatch again).
5. **Foreground or background**: foreground one-shot (default) / `background: true` (continuable background session; the main conversation is not blocked and `ask_agent` can follow up).

Once collected, generate `<agentsDir>/<name>.md` and write it into the agents dir (write the body as a persona system prompt from the user's description, **use it verbatim**, do not paraphrase), and tell the user when it takes effect:

- **A new file is callable by name immediately** — `use_agent` re-reads files from disk at execute time. Open "Subagents" in the web left navigation or refresh manually; the tool roster syncs in subsequent model requests with no restart needed; page save/delete also refreshes automatically. On pure CLI/TUI without the web management page, the roster updates at the plugin's next mount.
- **Changes to existing files** (body, frontmatter) take effect on the next `use_agent` call, no restart needed.

## The plugin's own configuration (entry config)

The plugin has no settings namespace; its configuration hangs on the **patch mount block that loads it** (the `config:` section of the bundle's cordis.patch.yml `insert` entry, i.e. the entry config). Nine registration keys plus six jev keys (the ptc capability, see below):

```yaml
- insert:
    - id: dsh-subagent-registry
      name: '@aiwayds/dsh-subagent-registry'
      config:
        agentsDir: ~/.dsh/agents   # agent file directory; only this default literal is resolved against $DSH_HOME, custom paths are used verbatim (~ expanded)
        provider: spawn            # which subagent provider the children run through (reuses dsh-base's spawn)
        toolName: use_agent        # dispatch tool name
        askToolName: ask_agent     # follow-up tool name
        # leafDenyTools: []        # tool deny list for deep:0 leaf children; empty = static default (dsh's built-in dispatch tools + toolName) intersected with the host's registered tools; non-empty passed through verbatim (no intersection)
        resume: auto               # auto | opt-in | off
        language: zh               # zh | en | ru (default zh), see "Switching the plugin language" below
        disabledAgents: []         # roster toggle: agent names to disable (hidden from the roster, calls refused; files untouched)
        ptcEnabled: false          # opt-in: the codemode (jev + store) toolchain switch; false registers no extra tool
        # jevEnabled: false        # jev master switch (default off: zero jev calls)
        # jevBackend: zen          # zen | native | openrouter
        # jevModel: ''             # pinned model id; empty = backend default at call time
        # jevTimeoutMs: 3000       # per-classify deadline; one signal, no retry
        # jevSecretFile: ''        # outbound secret-gate literal list (one per line)
        # storageDir: ''           # usage-sink directory; empty = <dsh home>/storages/ptc-subagent
```

| Key             | Default        | Description                                                                                        |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `agentsDir`     | `~/.dsh/agents` | Only the default literal is resolved against `$DSH_HOME` (i.e. `$DSH_HOME/agents`); a custom value is used **verbatim** after `~` expansion, not re-anchored to the dsh home. |
| `provider`      | `spawn`        | Subagent provider.                                                                                  |
| `toolName`      | `use_agent`    | Dispatch tool name; a custom name is followed automatically by the leaf deny list.                  |
| `askToolName`   | `ask_agent`    | Follow-up tool name.                                                                                |
| `leafDenyTools` | `[]`           | Empty = static default (`subagent`/`subagent_fork`/`workflow`/`ralph` + `toolName`) ∩ the host's currently registered tools (prevents stale names from tripping the host's fail-fast); non-empty is **passed through verbatim**, no intersection, stale entries are rejected by host validation. |
| `resume`        | `auto`         | Resume mode, see the next section.                                                                  |
| `language`      | `zh`           | UI/guide/shipped agent template language: `zh` / `en` / `ru`; restart dsh after changing, see the next section. |
| `disabledAgents` | `[]` (volatile) | The roster toggle: listed names vanish from the `use_agent`/`ask_agent` rosters; the execute path re-checks the live value and refuses hard-named calls. **Disable semantics live in this config key, not the frontmatter** — agent files are never modified. A volatile write hot-applies (with the roster refresh); the `/registry-config` command writes it for you. |
| `ptcEnabled`    | `false`        | The codemode toolchain gate: false registers nothing extra; true registers the `codemode` tool at standing scope on the next plugin mount (dsh restart). The six jev keys are volatile and read per call. |

## The /registry-config command (roster toggle + opt-in installs)

Type `/registry-config` in the session to open the management wizard (two multi-select questions through ask_user_question):

1. **Disable toggle**: check the agents to disable (the checked set BECOMES the new `disabledAgents` list; nothing checked = all enabled; currently disabled names must STAY checked to remain disabled — option descriptions mark the current state). Disabling only hides an agent from the roster and refuses calls by name — **agent files are never modified**.
2. **Opt-in installs**: check the opt-in agents to install — `ptc-subagent` (the batch decision-work specialist; links `ptcEnabled`) and `minimal-subagent` (the terminal-only executor; no config linkage). ⚠️ Both are **Experimental — disabled by default**: the capability has migrated and merged, but the product surface stays experimental until it graduates, and nothing enables until you explicitly check it or write the config keys. Installing copies `templates/opt-in-agents/<language>/<name>.md` from the package into the agents dir (an existing file is never overwritten; unchecking never deletes a copied file). Selecting `ptc-subagent` flips `ptcEnabled: true`; unselecting flips it back (writes false and parks ptc-subagent in `disabledAgents`, file kept).

Timing: `disabledAgents` is volatile — the write hot-applies and the command refreshes the roster at the end; a `ptcEnabled` change takes effect on the next plugin mount (dsh restart), which registers/unregisters the codemode tool. On a headless deployment (no ask surface — the ask rejects with NO_PROVIDER) the command degrades to an error message with the manual recipe (the `disabledAgents` / `ptcEnabled` keys plus the template copy path).

## The ptc capability (opt-in: the codemode tool)

Since 0.18.0 this package carries the entire former `@aiwayds/dsh-ptc-subagent`: the `codemode` tool (the jev decision binding + the session-scoped store binding over the public `ctx.ptcRuntime` seam) registers behind the `ptcEnabled` gate, and once registered is visible to the main agent AND every dispatched subagent (standing scope, as in the standalone plugin). Everything ships off by default (`jevEnabled: false` = zero jev calls). `jev.classify` answers a batched set of choice/score/noul questions in one call and resolves structured `{error}` results instead of rejecting; `store` is session-scoped key/value memory riding the durable session log (256KB per value / 1MB per branch). Every jev call (failures included) appends one row to `<dsh home>/storages/ptc-subagent/usage.jsonl` (metadata and token counts only). The bundle patch also carries the four agent-preset guard rows (agent-preset-registry / subagent-model-selection-settings / preset-native / preset-codemode) — a profile that already mounts an agent-preset layer must remove the duplicate id rows first, or the loader rejects the duplicated id.

### Concurrency and depth limits (dsh 0.1.7+, officially managed)

The number of concurrently active subagents and the nesting depth are managed by the **official dsh-subagent service** (the plugin keeps no concurrency counter/queue of its own): `maxActiveSubagents` (default `8`) and `maxDepth` (default `1`), both volatile fields, hot-tunable without a restart. When the user wants "several parallel subagents / deeper nesting", write `subagent: { maxActiveSubagents: N, maxDepth: M }` in a profile patch, or call `settings.update('subagent', …)` at runtime; an agent file's `deep` only tightens within this official budget (`deep: 0` leaves have the dispatch tools removed outright). `maxRounds` (per-agent round cap) remains a frontmatter key of this plugin — the official seam has no round-budget capability, it is still consumed by the host TUI's hard-stop ladder.

## Switching the plugin language (language)

The plugin ships three languages: `zh` (Chinese, the default), `en` (English) and `ru` (Russian), selected by the `language` key of the entry config.

- How to change it: set `language` to `zh` / `en` / `ru` in the plugin config (cordis.patch.yml or the web plugin settings), then restart dsh for it to take effect.
- Scope: the web management panel texts, this guide (the matching body and model-facing routing description), and the agent templates seeded on first install (`templates/agents/<language>/`).
- Existing agent files are never rewritten: to change the language of existing agents, edit `~/.dsh/agents/*.md` directly, or empty the agents dir and let seeding rebuild it in the new language.
- When the user asks how to switch to the English/Russian UI: explain the steps above, or edit the config for them and remind them to restart. Trigger words: language, UI language, switch language, язык.

## Resume and follow-ups

- **The three resume modes**: `auto` (default) = if this agent has an interrupted run in this conversation, resume it automatically; `opt-in` = resume only when the call explicitly passes `resume: true`; `off` = never resume automatically (a caller's explicit `resume: true` can still force a resume). `fresh: true` is the reverse — it forces a brand-new start. At the tool-parameter level, `resume` and `fresh`, and `background` and `resume`, are mutually exclusive.
- **Interrupted-run detection**: by the **last accounting `turn/end`** in the subagent's persisted event log — anything other than `completed` (error / aborted / max-tokens / crash with no record) means interrupted and resumable. A resume reuses the same persona/model/tool combination and advances exactly one continuation turn; failures can be resumed repeatedly and progress keeps accumulating. Resume depends on session persistence; failures to read, claim or restore an already-selected old run are reported as errors, a second task is never auto-created, and only an explicit `fresh: true` re-dispatches.
  New activation-line foreground runs use the `[fg] <display_name ?? name>` short prefix label (v0.14.0 used the long `[use_agent foreground] ` prefix, still recognized for compatibility); old-line foreground stays a plain-label one-shot. Background keeps the plain label; both foreground flavors are resumable.
  A later-cancelled pending input or an unclosed new turn also counts as resumable — do not look only at an earlier completed turn.
  The public APIs of both supported versions do not yet support managed cold resume with current composition and caller-only delivery; foreground resume is driven by `agents.resume`, can be stopped by cancelling the call, but does not occupy the manager's concurrency slots, is not managed by `interrupt_agent`, and cannot use stock `send_message` to reach the parent. New dispatches and background follow-ups are manager-managed.
- **`ask_agent` targets background runs**: asks the most recent background run a follow-up and **waits for its reply** (by `agent` name or the `agent_id` returned at dispatch time — pass exactly one of the two; optional `timeout` second cap, `≤0` treated as not passed). A foreground one-shot run cannot be followed up — its resume goes through `use_agent`'s resume mechanism.

## Install & usage diagnostics (debug)

Locate the problem in three steps — "installed → mounted → wired" — then check usage traces. Replace `<profile>` with the actual profile name (`tui` / `web` / `desktop` / `headless`…); each profile's plugins and mounts are independent.

### Step 1: installed? (is the package in the profile)

```sh
dsh plugin --profile <profile> list    # really just forwards the arguments to pnpm in the profile dir; @aiwayds/dsh-subagent-registry should appear
ls ~/.dsh/profiles/<profile>/node_modules/@aiwayds/   # equivalent check
```

### Step 2: mounted? (did the insert block reach the composition layer)

```sh
dsh dump-config --profile <profile>    # the insert entry with id: dsh-subagent-registry and its config should appear
grep dsh-subagent-registry ~/.dsh/profiles/<profile>/cordis.patch.yml
```

Note: dump-config shows the patch layer's **composition result**, not the runtime values materialized from the schema.

### Step 3: wired? (dir scan + tool registration + model visibility)

- `ls ~/.dsh/agents/`: on first startup (the dir was empty) the three preset agents workhorse / oldfox / rubber-duck are seeded — their presence means the agentsDir scan works.
- Ask the model in the session: "list your currently available tools" — `use_agent` / `ask_agent` should appear, and the `use_agent` description should carry the agent roster.
- While at it, verify skill routing: tell the model "help me set up a subagent" — the `dsh-subagent-registry-config` skill should come up.

### Has it been used? (usage traces)

- **Cards/replayer**: tui-pi's `/history` session replay, or the activity section of web/Feishu turn cards — a `🔧 use_agent · ✔` line is one dispatch.
- **Direct on-disk check (works for any profile)**: each session is
  `~/.dsh/sessions/<workspace dir>/<session id>/session.v3.jsonl.zstd`; count the calls directly:

  ```sh
  zstdcat ~/.dsh/sessions/<workspace dir>/<session id>/session.v3.jsonl.zstd | grep -c use_agent
  ```

  Greater than 0 means that session called it; the subagent itself is also an independent dsh session under the same sessions root.

### Symptom → breakpoint

| Symptom | Where it broke | How to fix |
| --- | --- | --- |
| The plugin is missing from `dsh plugin … list` | Install | `dsh plugin --profile <profile> add @aiwayds/dsh-subagent-registry`, restart dsh |
| No insert block in dump-config | Mount | Check the profile's cordis.patch.yml, remount and restart |
| Tool present, roster empty | agentsDir / file location / frontmatter | See "Troubleshooting" 1 and 2 below |
| Tool and roster present, the model just doesn't call | Model choice | Write the agent's `description` to say clearly "when to dispatch me"; on the TUI, tui-pi's registeredOnly can also help |
| Calls fail with `ctx.subagents.start is not a function` | Old plugin loaded or host outside the verified range | Verified for DSH `0.2.0-rc.2` and `0.2.1-rc.2` (RC/stable lines; the alpha line is not supported); confirm the actual plugin version, update and restart; do not assume compatibility with other host versions |

## Troubleshooting

1. **An agent file is dropped** → look for parse errors in the startup/loader logs: a missing `name`, a non-integer or negative `deep`, or an invalid `thinking`/`background` value all **drop the whole file** (no downgraded repair).
2. **An agent doesn't appear in the `use_agent` tool** → check in order: is agentsDir configured correctly (default `$DSH_HOME/agents`); is the file `<name>.md` placed directly at the top level of the dir (subdirectories are not recursed); is the frontmatter valid and does name match the file name (see the previous item). Opening or refreshing the web management page syncs the roster; on pure CLI/TUI the roster updates at the next mount, and new files are callable by name immediately.
3. **Preset agents lost/modified** → first startup seeds the three preset agents workhorse / oldfox / rubber-duck only when the dir is empty (the "three-piece seed"); ptc-subagent / minimal-subagent are the **two opt-ins** (Experimental — disabled by default), installed only through the `/registry-config` command or a manual copy — never auto-seeded. Existing files are never overwritten, and a deletion is a deletion. Uninstalling the plugin also never touches the files in `~/.dsh/agents/`. If an agent is missing from the roster, first check whether the `/registry-config` toggle (`disabledAgents`) disabled it — disabling only hides, never touches files.
