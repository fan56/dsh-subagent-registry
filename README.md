# dsh-subagent-registry

[English](./README.en.md)

把 `~/.dsh/agents/*.md` 定义的自定义 agent（frontmatter 元数据 + markdown
正文作为 persona/system prompt）注册成 [dsh](https://github.com/deepseek-ai/deepseek-harness)
可按名调用的 subagent：主对话通过 `use_agent` 点名调用，`ask_agent` 对后台
代理追问并等回复。跑在 dsh 自带的 `spawn` provider 上，纯插件、不改 dsh 本体。

## 特点

- **一个 markdown 文件就是一个 agent** — frontmatter 写模型/思考强度，正文就是
  system prompt，改完即生效。
- **断点续跑** — 长任务中断（报错/取消/限额/崩溃）后再次调用，自动从已保存的
  中间进度继续，不从头重来。
- **按角色优先委派** — 使用英文委派指导，让模型优先选择名册中匹配的自定义角色；独立任务可后台派发，需要继承对话时仍用原生 `subagent_fork`。指导只在当前作用域可见本插件工具时生效，卸载后恢复官方指导。
- **后台派发 + 双向追问** — `background: true` 把代理放到后台跑，主对话继续干活；
  `ask_agent` 发追问并等它的回复。
- **开箱即用三个人物** — 装好即自动植入 `workhorse` / `oldfox` / `rubber-duck`
  三个预置 agent（见下）。
- **站在官方 subagent 机制之上** — 不自建执行器：每个自定义 agent 都通过 dsh
  官方的 `spawn` provider 启动，子代理就是货真价实的 dsh subagent（完整会话、
  持久化、continuable）。官方 subagent 栈的新能力（如双向通信）本插件自动
  继承；官方原生 `subagent` 工具继续可用，两者并存、互不干扰。
- **纯插件** — 只依赖 dsh ≥ 0.2.1-alpha.2 的公开 subagent 机制，可随时干净卸载。

前台/后台新派发使用 `startActivation`，分别以 `caller` / `parent` 投递结果。前台续跑使用公开 `agents.resume`，支持当前 persona/model/工具配置及调用取消，但不占用 manager 并发槽，也不能由 `interrupt_agent` 打断；续跑子代理不能使用 stock `send_message` 联系父级。后台追问继续由 manager 管理。已选中的旧会话若读取或恢复失败，会报错；显式 `fresh: true` 才重新派发。

## 三个预置 agent

首次启动时植入 `~/.dsh/agents/`（仅当目录里还没有可解析的 agent 时；你的修改
永远不会被覆盖）。它们就是普通的 markdown 文件，随便改。

| Agent | 一句话 | 典型用法 |
| ----- | ------ | -------- |
| **workhorse**（牛马狗） | 干活的主力：写代码、调查、测试、部署，脏活累活全包；默认 `deepseek-flash`，受保护禁止危险操作 | 「用 workhorse 把发布清单整理成表格」 |
| **oldfox**（老法师） | 顾问不干活：分析、trouble shooting、review 挑刺，只把关不动手；`glm-5.3` | 「让 oldfox 审一下这个方案」 |
| **rubber-duck**（小黄鸭） | 多模态视觉 agent：看截图/图表/手写字，画 plotext/mermaid/matplotlib 图；跑在支持图像的模型上 | 「用 rubber-duck 看这个截图，提取页面文字」 |

## 用法

装好、重启 dsh，然后在对话里直接说——主模型会按名字挑 agent：

> 用 workhorse 把今天的发布清单整理成表格

底层就是 `use_agent(agent: "workhorse", prompt: "…")`。后台代理用
`ask_agent(agent: "worker", message: "…")` 追问，会等它的回复。

## 定义自己的 agent

往 `~/.dsh/agents/` 丢一个文件：

```markdown
---
name: my-agent
description: "一行简介，显示在 use_agent 名册里"
model: opencode-go/deepseek-flash
thinking: high
---

You are my-agent. 这段 markdown 正文会原样作为 system prompt。
```

Frontmatter 字段：`name`（必填）、`description`、`display_name`、`model`
（`provider/model`，缺省继承）、`thinking`（`off/low/medium/high/max`，缺省继承）、
`deep`（`0` = 叶子不许再开子代理，缺省 `1`）、`background`（`true` = 默认后台跑）、`maxRounds`（正整数，per-agent 轮数上限，覆盖 `dsh-tui.maxRounds` 全局值；宿主 TUI 的硬停梯消费）。
未知字段静默忽略。

### 并发与轮数上限（0.1.7 起）

**并发数与嵌套深度由官方 dsh-subagent 托管**，本插件不自管并发计数与排队
（官方 ActivationManager 统一调度）：`maxActiveSubagents`（同时活跃子代理上限，
默认 `8`）与 `maxDepth`（委托嵌套深度上限，默认 `1`）。两者都是 volatile 字段，
免重启热调——在 profile patch 里写 `subagent: { maxActiveSubagents: N, maxDepth: M }`，
或运行时 `settings.update('subagent', …)`。`use_agent` 的 `deep` frontmatter
只是在这条官方深度预算内再收紧（`deep: 0` 叶子直接拔掉所有开代理的工具）。

`maxRounds`（per-agent 轮数上限）**本插件继续保留**：官方 subagent seam 没有轮数
预算能力，该键仍由宿主 TUI 的硬停梯消费。

→ **完整参考**：[docs/AGENT-FORMAT.md](./docs/AGENT-FORMAT.md)（英文）——每个字段
的校验与失败行为、`deep`/`thinking` 语义、续跑机制、后台派发、配置项、已知边界。

## 内置技能

插件随包注册一个名为 `dsh-subagent-registry-config` 的技能（bundled skill）。对话涉及自定义
子代理、agent `.md` 编写、子代理续跑或本插件配置时，dsh 会自动加载这份使用与配置指南，
主模型可以据此用 `ask_user_question` 代写 agent 文件、调整插件配置，无需翻 README。
技能与插件同版本发布，随 npm 包携带（`skills/dsh-subagent-registry-config/SKILL.md`）。

## 安装

**要求 dsh >= 0.2.1-alpha.2**（已针对此客户端验证）。

方式 A — 把本地 checkout 挂进 dsh profile：

```sh
dsh plugin --profile tui add ~/github/dsh-subagent-registry
```

方式 B — npm 依赖：`npm i @aiwayds/dsh-subagent-registry`，然后在 profile
配置里以稳定 id `dsh-subagent-registry` 加载，或通过 bundle patch 挂载
（挂法见本仓 `cordis.patch.yml`）。

## 卸载

```sh
dsh plugin --profile <name> remove @aiwayds/dsh-subagent-registry
```

宿主会把插件从 profile 里摘除；重启 dsh 后 `use_agent` / `ask_agent` 工具
消失。**`~/.dsh/agents/` 里的 agent 文件会保留**——它们归你所有，不会被
重新植入或覆盖。没有本插件时 dsh-tui-pi 会优雅降级（只是失去自定义 agent
派发能力）。

## 开发

```sh
npm run check    # tsc --noEmit
npm run build    # tsc -> lib/
npm test         # 全部单元测试（无 LLM、无网络）
npm run test:host # 真实宿主服务/持久化/manager/spawn；脚本化模型，无网络
```

### `@deepseek-ai/*` 依赖契约（为什么是 optional peer）

本仓对 `@deepseek-ai/*`（`cordis`、`dsh-subagent`、`dsh-llm`、`schemastery` 等）
只声明 **optional peerDependencies**（`>=0.2.1-alpha.2`）。这是有意的两层分工：

- **发布语义（给消费者）**：声明表达「使用宿主自带的同名包、版本下限
  `>=0.2.1-alpha.2`」。optional peer 不会被 pnpm / npm 自动安装，因此不会在
  profile 的 `node_modules` 里生成第二份拷贝去遮蔽（shadow）宿主 bundled 的
  闭包。会出事的是硬 dependency 精确钉旧 rc 版——那会把宿主 0.2.x 弄到无法
  boot（已知社区事故模式）。
- **开发 typecheck（给本仓）**：peer 不被安装，`scripts/link-dsh-closure.mjs`
  （postinstall）把 `node_modules/@deepseek-ai/*` 软链到全局 dsh 安装的闭包，
  保证类型图里只有一份 `@deepseek-ai/cordis`——出现第二份会打断 cordis 的
  `declare module` 类型增强（`Property 'settings' does not exist on type
  'Context'`）。

维护守则：这些包永远保持 optional peer 形态——不要移回 dependencies /
devDependencies，也不要去掉 `optional: true`（非 optional peer 在
`auto-install-peers` 开启的 pnpm 下会被自动安装，第二副本问题即复发）。

## License

MIT
