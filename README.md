# dsh-subagent-registry

Define your own subagents as plain markdown files (`~/.dsh/agents/*.md`) and
call them by name in [dsh](https://github.com/deepseek-ai/deepseek-harness) —
no host patching, no code.

**中文简介**：把 `~/.dsh/agents/*.md` 定义的自定义 agent（frontmatter 元数据 +
markdown 正文作为 persona/system prompt）注册成 dsh 可按名调用的 subagent。
主对话通过 `use_agent` 点名调用，`ask_agent` 对后台代理追问等回复。跑在 dsh
自带的 `spawn` provider 上，纯插件、不改 dsh 本体。

## Why

- **一个 markdown 文件就是一个 agent** — frontmatter 写模型/思考强度，正文就是
  system prompt，改完即生效。
- **断点续跑** — 长任务中断（报错/取消/限额/崩溃）后再次调用，自动从已保存的
  中间进度继续，不从头重来。
- **后台派发 + 双向追问** — `background: true` 把代理放到后台跑，主对话继续干活；
  `ask_agent` 发追问并等它的回复。
- **开箱即用三个人物** — 装好即自动植入 `workhorse` / `oldfox` / `rubber-duck`
  三个预置 agent（见下）。
- **纯插件** — 只依赖 dsh ≥ 0.1.2-rc.1 的公开 subagent 机制，可随时干净卸载。

## The three shipped agents

Seeded into `~/.dsh/agents/` on first start (only when the directory holds no
parsable agent — your edits are never overwritten). All three are ordinary
markdown files: edit them freely.

| Agent | 一句话 | 典型用法 |
| ----- | ------ | -------- |
| **workhorse**（牛马狗） | 干活的主力：写代码、调查、测试、部署，脏活累活全包；默认 `deepseek-v4-flash`，受保护禁止危险操作 | 「用 workhorse 把发布清单整理成表格」 |
| **oldfox**（老法师） | 顾问不干活：分析、trouble shooting、review 挑刺，只把关不动手；`glm-5.3` | 「让 oldfox 审一下这个方案」 |
| **rubber-duck**（小黄鸭） | 多模态视觉 agent：看截图/图表/手写字，画 plotext/mermaid/matplotlib 图；跑在支持图像的模型上 | 「用 rubber-duck 看这个截图，提取页面文字」 |

## Usage

Install, restart dsh, then just ask in the conversation — the main model picks
the agent by name:

> 用 workhorse 把今天的发布清单整理成表格

Under the hood that is `use_agent(agent: "workhorse", prompt: "…")`. For
background runs, follow up with `ask_agent(agent: "worker", message: "…")` —
it waits for the reply.

## Define your own

Drop a file into `~/.dsh/agents/`:

```markdown
---
name: my-agent
description: "One-line subtitle shown in the use_agent roster"
model: opencode-go/deepseek-v4-flash
thinking: high
---

You are my-agent. This markdown body is used verbatim as the system prompt.
```

Frontmatter keys: `name`（必填）、`description`、`display_name`、`model`
（`provider/model`，缺省继承）、`thinking`（`off/low/medium/high/max`，缺省继承）、
`deep`（`0` = 叶子不许再开子代理，缺省 `1`）、`background`（`true` = 默认后台跑）。
Unknown keys are silently ignored.

→ **Full reference**: [docs/AGENT-FORMAT.md](docs/AGENT-FORMAT.md) — every key's
validation and failure modes, `deep`/`thinking` semantics, resume mechanics,
background dispatch, configuration fields, known limitations.

## Installation

**Requires dsh >= 0.1.2-rc.1** (the RC/stable line; the alpha line is not
supported).

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
npm test         # all unit tests (no LLM, no network)
```

## License

MIT
