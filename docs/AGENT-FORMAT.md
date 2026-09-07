# Agent format & configuration reference

The full reference for dsh-subagent-registry: every frontmatter key the
parser recognizes, the exact validation and failure modes, the `deep` /
`thinking` semantics, resume mechanics, background dispatch and the
configuration surface. For a quick start, see the [README](../README.md).

## Agent definition format

An agent is `<agents-dir>/<name>.md` — a loose `key: value` frontmatter block
(delimited by `---` lines) followed by a markdown body that is used **verbatim**
as the child's persona (system prompt). The table below lists every key
this plugin recognizes:

| Key            | Type                              | Default                  | Validation / failure mode                                                                                                                                                                                       |
| -------------- | --------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | string                            | —                        | **Required.** Missing or empty → whole file dropped: `` missing required frontmatter key `name` ``.                                                                                                             |
| `deep`         | non-negative integer              | `1`                      | Missing → `1`. **Non-integer or negative drops the whole file**: `` invalid `deep`: expected a non-negative integer, got "<value>" ``. `0` = leaf (deny list, no `maxDepth`); `>= 1` = relative depth budget.        |
| `display_name` | string                            | absent                   | Optional UI label; this plugin stamps every child with the single label `display_name ?? name`, so `use_agent` resume and `ask_agent` follow-ups can both find a prior run (see *Resuming interrupted runs* below). |
| `description`  | string                            | absent                   | One-line roster subtitle; rendered under the agent name in the `use_agent` tool description.                                                                                                                     |
| `model`        | `provider/model` route            | absent (= inherit)       | Split at the first `/` into `agentOptions.{provider,model}`; a value with no slash is taken as a provider name with an inherited model. Absent → the child inherits the deployment's default model.                |
| `thinking`     | `off` / `low` / `medium` / `high` / `max` | absent (= inherit) | Case-sensitive. **Any other value drops the whole file** at parse time: `` invalid `thinking`: expected one of off/low/medium/high/max, got "<value>" ``. See *Adapter support* under `thinking` semantics below.     |
| `background`   | strict `true` / `false`           | absent (= foreground)    | Case-sensitive, no abbreviations. **Any other value drops the whole file**: `` invalid `background`: expected true or false, got "<value>" ``. When `true`, `use_agent` dispatches as a durable background conversation. |

The parser is deliberately tolerant: `key: value`, optional surrounding
quotes, CRLF or LF, no template substitution. **Unknown frontmatter keys are
silently ignored** — no warning, no error. In particular, the `extensions`
field from the pi-side fun-agent convention **is not supported here**:
writing `extensions: ["*", "workhorse-gate"]` parses cleanly, then does
nothing. Leave it out. The same is true for `tools`, `system_prompt`, `color`,
or any other field the parser doesn't read. Note the empty-value asymmetry: a
key line that parses to `''` (`name:` with nothing after the colon) drops the
file only for `name` and `deep` (they require a value); for `thinking`,
`background`, and the optional `display_name` / `description` / `model` keys,
an empty value is treated as if the key were absent and the file is kept.
Frontmatter lines that do not match `<key>: <value>` — leading whitespace,
comment-looking lines, etc. — are silently ignored.

Minimal working template:

```markdown
---
name: my-agent
display_name: 我的代理
description: "Short subtitle shown in the use_agent roster"
model: opencode-go/deepseek-v4-flash
thinking: high
deep: 0
---

You are my-agent. The markdown body is used verbatim as the system prompt.
```

## Configuration

| Config field  | Default              | Description                                                              |
| ------------- | -------------------- | ------------------------------------------------------------------------ |
| `agentsDir`   | `$DSH_HOME/agents` (falls back to `~/.dsh/agents`) | Directory holding `<name>.md` agent definitions. Only the schema default literal `~/.dsh/agents` is resolved against the dsh home (so `$DSH_HOME` is honored); any other value is used verbatim after `~` expansion, NOT re-anchored to the dsh home. |
| `provider`    | `spawn`              | Subagent provider the child runs through (reuses dsh-base's `spawn`).    |
| `toolName`    | `use_agent`          | Name of the dispatch tool.                                               |
| `askToolName` | `ask_agent`          | Name of the follow-up tool (send a message to a background run and wait for its reply). |
| `leafDenyTools` | `[]` (computed default) | Explicit tool-deny list installed on `deep: 0` (leaf) children. Empty = computed default (every agent-spawning tool in the dsh base distribution plus `toolName`). |
| `resume`      | `auto`               | When `use_agent` continues a prior interrupted run: `auto` resumes whenever one exists, `opt-in` only when the caller passes `resume: true`, `off` never (an explicit `resume: true` still overrides). |

## Resuming interrupted runs

Long subagent runs (>10 min) die for many reasons — API errors, cancellation,
a crashed dsh process, a token limit — and re-dispatching the same agent used
to mean redoing everything from zero. It doesn't anymore.

**Nothing extra is logged**: dsh already persists every in-process subagent
child as a full session under the deployment's session store
(`~/.dsh/sessions/...`), interrupted runs included. What was missing is the
recall layer, which this plugin now provides on top of the stock mechanisms:

1. On each `use_agent` call, the plugin enumerates the calling conversation's
   prior one-shot children (`ctx.subagents.listChildren`, which merges the
   live store with session persistence) and picks the newest inactive child
   whose creation label matches the requested agent.
2. The child's persisted event log is classified by its **last accounting
   `turn/end`**: anything other than `completed` (error, aborted, max-tokens,
   crash with no recorded turn result) marks the run as interrupted and
   resumable.
3. The child session is resumed (`ctx.agents.resume`) with the same
   composition a fresh dispatch applies — the current agent-file body as the
   persona, the frontmatter `model` route, and the leaf tool scoping for
   `deep: 0` agents — and driven for exactly one continuation turn with a
   "continue where you left off, don't redo finished work" instruction. The
   original task and all partial work are already in the child's replayed
   context.
4. The result flows back to the parent like any `use_agent` result, prefixed
   with a provenance line naming the resumed session. If the continuation
   fails again, the next call simply resumes it again — each retry keeps
   accumulating progress.

Tool-call parameters:

| Parameter  | Effect                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| `fresh: true`  | Force a clean start, ignoring any interrupted prior run.                 |
| `resume: true` | Require resuming; the call fails loudly if no interrupted run exists.    |

Lookups fail open silently: with no session persistence mounted, an unreadable
log, any enumeration error, or any other infrastructure snag in the lookup
chain, the resume candidate comes back as "none" and the tool starts fresh
— resume is an optimization, never a blocker. A resume that *starts* but
fails is different: when the host cannot actually resume the picked session
(e.g. a concurrent duplicate resume raced to the same id), the call falls
back to a fresh dispatch and the result's first line announces it
(`Resume of the interrupted prior run failed (…); started a fresh run
instead.`) — partial work from the continuation turn is preserved, never
silently thrown away. Note that only runs dispatched with a `label` are
discoverable; this plugin has always stamped `display_name ?? agent name` as
the label, so pre-existing failed runs are resumable too.

**Cross-host-version boundary**: dsh versions its subagent continuation
descriptors — the gate is the descriptor format version in
`@deepseek-ai/dsh-subagent` (`SUBAGENT_DESCRIPTOR_VERSION`; currently v3, see
that package for the authoritative value). A run produced under a different
descriptor version is not resumable: the host's parser returns `undefined`
and the candidate folds into the fail-open path above (fresh dispatch), with
an explicit `resume: true` reporting it honestly. Same descriptor version
→ resumable across host versions.

## Interactive subagents (background + follow-ups)

dsh ≥ 0.1.2-rc.1 made parent↔child conversations bidirectional: a parent and
its **continuable** children exchange follow-up messages via `send_message`,
and every continuable child keeps a durable session across residency epochs
(a finished child goes cold and is transparently resumed by the next
message). This plugin brings custom agents onto that machinery:

**Dispatch** — either declare it in the agent file or per call:

```markdown
---
name: worker
background: true
---
You are the worker …
```

```sh
use_agent(agent: "worker", prompt: "…", background: true)   # per call overrides frontmatter
# → started background agent "worker" (durable subagent id <id>)
```

The call returns the child's durable subagent id **immediately**; the parent
keeps working while the child runs, and the runtime delivers a settlement
notice when the run ends. `deep` semantics (leaf tool scoping / relative
`maxDepth`), `model`, and `thinking` apply to continuable children exactly as
they do to foreground ones. Background dispatch always opens the agent's
**new** conversation — it is mutually exclusive with `resume: true` and
ignores `fresh` (foreground calls keep resuming interrupted one-shot runs).

**Follow up** — the new `ask_agent` tool closes the loop:

```sh
ask_agent(agent: "worker", message: "how far did you get?")
```

It addresses the newest background run of that agent (or any run by
`agent_id`), and **waits for the reply**: a mid-turn child takes the message
at its nearest step boundary; a finished child's durable session resumes and
the message starts a new turn. Pass **exactly one** of `agent` (an agent
name) or `agent_id` (the durable id a background dispatch returned); passing
both or neither is rejected at validation. The tool result is the child's
reply text, with a status line when the turn ended abnormally
(`max-tokens`, error, …) and the partial output preserved. Optional
`timeout` (seconds) bounds the wait; passing `0` or a negative number is
treated as omitting it (the call waits until the conversation moves on).
For fire-and-forget steering without a reply, use dsh's base `send_message`
tool.

Notes:

- Background dispatch and follow-ups need the deployment's session
  persistence (every standard dsh profile mounts it); `startContinuable`
  fails loudly without it.
- `send_message` / `interrupt_agent` / `list_agents` (registered by dsh-base)
  stay visible to `deep: 0` leaf children: a leaf can proactively
  `send_message` its parent mid-task, and the reply arrives in the parent's
  conversation as an agent message.
- This plugin labels every child with `display_name ?? agent name`.
  `use_agent` resume looks for an exact match against that single label;
  `ask_agent` (when addressing by `agent`) tries the two candidates
  `[display_name ?? name, name]` and picks the newest match.

## `deep` semantics

`deep` is the agent's spawn-depth budget, declared in the frontmatter:

| `deep` | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| `0`    | **Leaf**: the agent runs normally but can never start a subagent. |
| `>= 1` | May start subagents. **Default when the key is absent: `1`.**   |

Implementation, at `use_agent` execute time:

- **`deep: 0`** — the start request carries `toolFilter: { deny: [...] }` and
  **no `maxDepth`**. The in-process `spawn` driver applies the filter as a
  scoped `tools.restrict()` in the child's creation window, so the named tools
  vanish from the child's tool prompt *and* refuse to execute — the child keeps
  its full non-spawn tool set but has zero spawn capability. Passing
  `maxDepth: 0` (the old behavior) would have rejected the child's own start,
  since the child's absolute depth is always ≥ 1. Default deny list:
  `subagent`, `subagent_fork`, `workflow`, `ralph`, plus this plugin's own
  tool name (`use_agent` by default; a customized `toolName` is denied
  automatically). `send_message` / `interrupt_agent` / `list_agents` only
  address already-running children and cannot spawn, so they stay visible.
  Override with `leafDenyTools` when your deployment's tool set differs.
- **`deep >= 1`** — no `toolFilter`; `maxDepth` is set to the child's absolute
  depth **plus** `deep` — a *relative* budget. Start can never be blocked by
  the depth check (`childDepth ≤ childDepth + deep` always holds), while the
  "deep = how many generations of subagents I may open" reading is preserved.
  Each subsequent delegation level enforces its own per-request caps (the
  native subagent tool defaults to `maxDepth: 3`), which acts as the outer
  recursion backstop.

## `thinking` semantics

The optional frontmatter `thinking` key sets the reasoning effort used for
the dispatched child's model calls:

| Value                        | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `off` / `low` / `medium` / `high` / `max` | Reasoning effort stamped onto every model call of the child.                   |
| *(key absent)*               | Nothing is injected — the child runs at the model's default effort.         |

Values outside this whitelist are **not** clamped: the agent file is marked
**broken** at parse time (`invalid \`thinking\`: expected one of
off/low/medium/high/max, got "…"`) and excluded from the roster until fixed.

Mechanically the effort travels natively: the declared level is stamped into
the start request's `agentOptions.reasoningEffort` — identically across the
fresh-dispatch and resume branches — and the host's subagent service hands it
to the provider when composing the child. It requires the provider's
`agentOptions` capability: the in-process `spawn` provider (this plugin's
default) declares it, and a provider without the capability is rejected
loudly at start rather than silently dropping the declared level.

Adapter support for `medium` depends on the route: `llm-deepseek` routing
advertises only `off` / `low` / `high` / `max`, so a declared `medium` fails
loudly with an unsupported reasoning-effort error before any network I/O;
pi-ai-style routes accept whatever efforts the model catalog advertises for
the selected model.

## Known limitations

- `deep` is a **per-agent** relative budget enforced at each `use_agent` call;
  it does not re-arm deeper descendants. Real recursion is additionally bounded
  by every spawning tool's own `maxDepth` (native subagent tools default to
  `maxDepth: 3`) as the outer backstop.
- Concurrent `ask_agent` calls to the **same** background run race on the
  same reply boundary: the first-delivered message's reply is observed by
  both waiters. Sequential follow-ups (the common case) are exact.
- `ask_agent`'s reply wait observes the child's session on a poll (the
  subagent seam exposes no reply subscription); a reply turn is recognised by
  its accounting `turn/end`, so a steer that rides an in-flight turn returns
  that turn's combined output rather than a message-isolated answer.
- Resume matches by agent label within the same parent conversation: if you
  re-dispatch the same agent for a *different* task after an interruption,
  pass `fresh: true` (or the resumed agent will continue the old task).
- Resume requires the deployment's session persistence (the JSONL/SQLite
  session store every standard dsh profile mounts); without it the tool
  silently dispatches fresh.
- Resume candidates are matched by creation label within the parent
  conversation. This plugin labels its children `display_name ?? agent name`;
  a one-shot child started by another tool (e.g. the native `subagent` tool)
  with the same label in the same conversation is indistinguishable and would
  be resumed under this plugin's persona.
- `tools.restrict()` validates the deny list against globally registered tool
  names and throws on unknown names — the default list only names tools the
  stock dsh base distribution always registers; non-stock deployments should
  tune `leafDenyTools`.

## Publishing note (maintainers)

This plugin is a **dsh plugin**: its `@deepseek-ai/*` imports must resolve to
the single dsh closure instance the host provides. Never declare
`@deepseek-ai/*` in `dependencies` — pnpm would install a **second** copy of
the cordis/dsh-session closure, breaking module identity and surfacing as
bizarre runtime errors like
`Cannot read properties of undefined (reading 'prepare')` in
session-persistence. Keep them in `peerDependencies` (and `devDependencies`
for local typecheck/build), matching `@aiwayds/dsh-tui-pi`'s convention.
