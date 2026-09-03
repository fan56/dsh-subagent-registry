# dsh-subagent-registry

Register locally-defined custom agents (`~/.dsh/agents/*.md`) as callable
subagents in [dsh](https://github.com/deepseek-ai/dsh): the main conversation
can invoke any of them by name through the `use_agent` tool, and each runs as
a real dsh subagent with its own persona (system prompt). When a run is
interrupted (error, cancellation, crash, token limit), the next `use_agent`
call for the same agent **resumes it from its saved partial work** instead of
restarting from scratch. Since dsh **v0.1.2-alpha.4** (carried through the
0.1.2 RC line), agents can also be
dispatched as **durable background conversations** (`background: true`) and
followed up interactively through the `ask_agent` tool — the parent and the
child exchange messages in both directions.

**中文简介**：把 `~/.dsh/agents/*.md` 定义的自定义 agent（frontmatter 元数据 +
markdown 正文作为 persona）注册成 dsh 可按名调用的 subagent。主对话通过
`use_agent` 工具点名调用；每个自定义 agent 以独立 subagent 运行，拥有自己
的 system prompt，跑在 dsh 自带的 `spawn` provider 上，不需要 patch dsh 本体。
基于 dsh v0.1.2-alpha.4 起提供、并延续至 0.1.2 RC 线的父子代理双向通信（`send_message` / continuable
子代理），本插件支持**后台派发 + `ask_agent` 追问等回复**的交互式用法。

## How it works

- **One file per agent**: `<agents-dir>/<name>.md` — a loose `key: value`
  frontmatter block (`name`, `description`, `model`, `deep`, `thinking`,
  `display_name`, …) followed by a markdown body that is used **verbatim** as
  the child's persona (system prompt).
- **Two tools**: at session startup the plugin registers `use_agent`
  (configurable `toolName`) and the follow-up tool `ask_agent` (configurable
  `askToolName`). `use_agent`'s static description carries the roster — every
  agent name plus its sanitized description — so the main model can pick an
  agent by name; `ask_agent` sends follow-ups to background runs and waits
  for their replies.
- **At call time** the target file is re-read and parsed; the body becomes the
  child's `persona`, the frontmatter `model` (`provider/model` route) is split
  into `agentOptions`, and the child is started through the already-assembled
  `spawn` subagent provider (the same single-instance realm dsh uses for its
  native subagent tool) — foreground one-shot by default, or as a durable
  continuable conversation when `background` is set. The result is returned
  to the parent conversation.

## Installation

**Requires dsh >= 0.1.2-rc.1** — this plugin targets the dsh RC/stable line only (CI and releases resolve the newest of the `latest`/`next` dist-tags at runtime). **The alpha line is no longer supported.**

Option A — add this checkout as a dsh plugin (tui profile):

```sh
dsh plugin --profile tui add ~/github/dsh-subagent-registry
```

Option B — npm dependency: `npm i @aiwayds/dsh-subagent-registry`, then load
the plugin under the stable id `dsh-subagent-registry` in your profile's config, or mount
it through a bundle patch (see `cordis.patch.yml` in this repo for the pattern).

## Configuration

| Config field  | Default              | Description                                                              |
| ------------- | -------------------- | ------------------------------------------------------------------------ |
| `agentsDir`   | `$DSH_HOME/agents` (falls back to `~/.dsh/agents`) | Directory holding `<name>.md` agent definitions — resolved against the dsh home, the same root the model-profile store uses. |
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
2. The child's persisted event log is classified by its **last** `turn/end`:
   anything other than `completed` (error, aborted, max-tokens, crash with no
   recorded turn result) marks the run as interrupted and resumable.
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

Lookups (and the resume itself) fail open: with no session persistence
mounted, an unreadable log, any enumeration error, or a resume that cannot
even start (e.g. a concurrent duplicate resume raced to the session id), the
tool silently falls back to a fresh dispatch — resume is an optimization,
never a blocker. A continuation turn that runs and fails again is different:
its partial output is kept and surfaced as an error, never silently thrown
away. Note that only runs dispatched with a `label` are discoverable; this
plugin has always stamped `display_name ?? agent name` as the label, so
pre-existing failed runs are resumable too.

**Cross-host-version boundary**: dsh versions its subagent continuation
descriptors (v3 since v0.1.2-alpha, unchanged through 0.1.2-rc.1). A run
interrupted under an older host is
not resumable under a newer one — it folds into the fail-open path above
(fresh dispatch), and an explicit `resume: true` reports it honestly. Resume
covers runs produced within the same host version.

## Interactive subagents (background + follow-ups, dsh ≥ 0.1.2-rc.1)

dsh v0.1.2-alpha.4 (carried through the 0.1.2 RC line) made parent↔child
conversations bidirectional: a parent
and its **continuable** children exchange follow-up messages via
`send_message`, and every continuable child keeps a durable session across
residency epochs (a finished child goes cold and is transparently resumed by
the next message). This plugin brings custom agents onto that machinery:

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
the message starts a new turn. The tool result is the child's reply text,
with a status line when the turn ended abnormally (`max-tokens`, error, …)
and the partial output preserved. Optional `timeout` (seconds) bounds the
wait; without it the call waits until the conversation moves on. For
fire-and-forget steering without a reply, use dsh's base `send_message` tool.

Notes:

- Background dispatch and follow-ups need the deployment's session
  persistence (every standard dsh profile mounts it); `startContinuable`
  fails loudly without it.
- `send_message` / `interrupt_agent` / `list_agents` (registered by dsh-base)
  stay visible to `deep: 0` leaf children — a feature since alpha.4, carried
  through the RC line:
  a leaf can proactively `send_message` its parent mid-task, and the reply
  arrives in the parent's conversation as an agent message.
- `use_agent` / `ask_agent` labels match `display_name ?? agent name`.

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
**Upgrading note:** this whitelist check is fail-loud as of this version — an
invalid value (including a case mismatch such as `High`) drops the whole
agent file from the roster, so check your existing `.md` files before
upgrading.

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

Example:

```markdown
---
name: workhorse
display_name: 牛马狗
description: "牛马狗：干活的主力……"
model: opencode-go/deepseek-v4-flash
thinking: medium
deep: 0
---
You are 牛马狗，干活的主力。……（这里写完整的 system prompt）
```

## Default agent roster

Three default agents ship with this package in `templates/agents/`: `workhorse`
(牛马狗, the general workhorse), `oldfox` (老法师, the review/audit oracle),
and **`rubber-duck`** (小黄鸭). `rubber-duck` is the **multimodal visual
agent**: it reads screenshots / charts / OCR text and draws plotext / mermaid /
matplotlib figures, running on an image-capable model. It occupies the role
formerly filled by the removed `ArtyDuck` (艺术鸭) in this setup.

**Auto-install**: on startup the plugin seeds these three into
`~/.dsh/agents/` — exactly once, and only while that directory holds no
agents at all. Any existing file is user-owned and never overwritten, and a
default you delete stays deleted; to get the roster back, empty the directory
(or copy the templates over by hand).

## Usage example

A multimodal example — `~/.dsh/agents/rubber-duck.md`:

```markdown
---
name: rubber-duck
display_name: 小黄鸭
description: "小黄鸭：多模态视觉 agent，看图识别、OCR、画 plotext/mermaid 图……"
model: digitalvolvo/kimi-k2.7-code
thinking: max
extensions: ["*"]
---
你是「小黄鸭」——多模态视觉 agent。……（这里写完整的 system prompt）
```

Then ask in a conversation:

> 用 rubber-duck 看一下这个浏览器截图，描述页面状态并提取文字

The main model calls `use_agent(agent: "rubber-duck", prompt: "…")`, the child
runs with the file body as its persona and an image-capable model, reads the
screenshot, and its result comes back into the conversation.

A text-only example — `~/.dsh/agents/workhorse.md`:

```markdown
---
name: workhorse
display_name: 牛马狗
description: "牛马狗：干活的主力……"
model: opencode-go/deepseek-v4-flash
deep: 0
---
You are 牛马狗，干活的主力。……（这里写完整的 system prompt）
```

Then ask in a conversation:

> 用 workhorse 把今天的发布清单整理成表格

The main model calls `use_agent(agent: "workhorse", prompt: "…")`, the child
runs with the file body as its persona, and its result comes back into the
conversation.

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

## Publishing note (read before `npm publish`)

This plugin is a **dsh plugin**: its `@deepseek-ai/*` imports must resolve to
the single dsh closure instance the host provides. Never declare
`@deepseek-ai/*` in `dependencies` — pnpm would install a **second** copy of
the cordis/dsh-session closure, breaking module identity and surfacing as
bizarre runtime errors like
`Cannot read properties of undefined (reading 'prepare')` in
session-persistence. Keep them in `peerDependencies` (and `devDependencies`
for local typecheck/build), matching `@aiwayds/dsh-tui-pi`'s convention.

## Development

```sh
npm run check    # tsc --noEmit -p tsconfig.json
npm run build    # tsc -p tsconfig.json -> lib/
npm test         # deep-semantics + display-name + resume + interactive + apply-smoke + … (no LLM)
```

## License

MIT