# dsh-subagent-registry

Register locally-defined custom agents (`~/.dsh/agents/*.md`) as callable
subagents in [dsh](https://github.com/deepseek-ai/dsh): the main conversation
can invoke any of them by name through the `use_agent` tool, and each runs as
a real dsh subagent with its own persona (system prompt). When a run is
interrupted (error, cancellation, crash, token limit), the next `use_agent`
call for the same agent **resumes it from its saved partial work** instead of
restarting from scratch.

**中文简介**：把 `~/.dsh/agents/*.md` 定义的自定义 agent（frontmatter 元数据 +
markdown 正文作为 persona）注册成 dsh 可按名调用的 subagent。主对话通过
`use_agent` 工具点名调用；每个自定义 agent 以独立 subagent 运行，拥有自己
的 system prompt，跑在 dsh 自带的 `spawn` provider 上，不需要 patch dsh 本体。

## How it works

- **One file per agent**: `<agents-dir>/<name>.md` — a loose `key: value`
  frontmatter block (`name`, `description`, `model`, `deep`, `display_name`,
  …) followed by a markdown body that is used **verbatim** as the child's
  persona (system prompt).
- **One tool**: at session startup the plugin registers `use_agent`
  (configurable `toolName`). The tool's static description carries the roster
  — every agent name plus its sanitized description — so the main model can
  pick an agent by name.
- **At call time** the target file is re-read and parsed; the body becomes the
  child's `persona`, the frontmatter `model` (`provider/model` route) is split
  into `agentOptions`, and the child is started through the already-assembled
  `spawn` subagent provider (the same single-instance realm dsh uses for its
  native subagent tool). The result is returned to the parent conversation.

## Installation

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
| `agentsDir`   | `~/.dsh/agents`      | Directory holding `<name>.md` agent definitions.                         |
| `provider`    | `spawn`              | Subagent provider the child runs through (reuses dsh-base's `spawn`).    |
| `toolName`    | `use_agent`          | Name of the registered tool.                                             |
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

## Default agent roster

The author's personal `~/.dsh/agents/` ships with three agents: `workhorse`
(牛马狗, the general workhorse), `oldfox` (老法师, the review/audit oracle),
and **`rubber-duck`** (小黄鸭). `rubber-duck` is the **multimodal visual
agent**: it reads screenshots / charts / OCR text and draws plotext / mermaid /
matplotlib figures, running on an image-capable model. It now occupies the role
formerly filled by the removed `ArtyDuck` (艺术鸭) in this setup.

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
- Continuable / background follow-up conversations with a custom agent
  (`send_message`-style resumption) are **v2**; today every `use_agent` run is
  one-shot (a resumed run is still one continuation turn on the old session).
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
npm test         # deep-semantics + display-name + resume (no LLM)
```

## License

MIT