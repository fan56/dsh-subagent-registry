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
- **按角色优先委派** — 使用精简英文委派指导，要求选择名册中匹配的自定义角色并提供完整任务上下文；独立任务后台并行，仅在必须继承当前对话时使用 `subagent_fork`。指导只在当前作用域可见本插件工具时生效，卸载后恢复官方指导。
- **后台派发 + 双向追问** — `background: true` 把代理放到后台跑，主对话继续干活；
  `ask_agent` 发追问并等它的回复。
- **开箱即用三个人物** — 装好即自动植入 `workhorse` / `oldfox` / `rubber-duck`
  三个预置 agent（见下）。
- **/registry-config 管理命令** — 向导式停用/启用任意名册 agent（`disabledAgents`
  配置键过滤，永不碰 md 文件）、安装两个 opt-in agent、联动 codemode 工具链
  开关（见下）。
- **opt-in PTC 能力** — 0.18.0 并入 `@aiwayds/dsh-ptc-subagent` 全部代码：
  `codemode` 工具（jev 判定 + 会话级 store）按 `ptcEnabled` 门控注册，默认
  完全关闭（见下）。
- **⚠️ Experimental（试验性功能，默认关闭）** — `ptc-subagent` /
  `minimal-subagent` 两个 opt-in agent 与整条 codemode（PTC）工具链都属试验性
  产品面：能力已迁移合并，但默认一律关闭，仅经 `/registry-config` 显式勾选或
  `ptcEnabled` 等配置键显式开启后才生效（见下）。
- **站在官方 subagent 机制之上** — 不自建执行器：每个自定义 agent 都通过 dsh
  官方的 `spawn` provider 启动，子代理就是货真价实的 dsh subagent（完整会话、
  持久化、continuable）。官方 subagent 栈的新能力（如双向通信）本插件自动
  继承；官方原生 `subagent` 工具继续可用，两者并存、互不干扰。
- **纯插件** — 支持 DSH RC/稳定线的公开 subagent 机制（兼容性验证至 `0.2.0-rc.2` 与 `0.2.1-rc.2`），可随时干净卸载；alpha 线不再支持。

按宿主公开 API 自动选择派发方式（功能探测，无版本号分支）：0.2.1 线使用 `startActivation`，前台/后台分别以 `caller` / `parent` 投递；0.2.0 线使用 `start` / `startContinuable`。已选择的接口失败后直接报错，不尝试另一接口重复派发。0.2.1 线的启动请求不再携带 persona 与 leaf 工具限制——本插件在 `subagent/start` 边缘把预留的 persona 段与 leaf 工具限制安装到子代理自身作用域（宿主自身合成同一窗口的同一 section/restrict），语义与 0.2.0 线的请求字段一致。前台续跑使用公开 `agents.resume`，支持当前 persona/model/工具配置及调用取消，但不占用 manager 并发槽，也不能由 `interrupt_agent` 打断；续跑子代理不能使用 stock `send_message` 联系父级。后台追问继续由 manager 管理。已选中的旧会话若读取或恢复失败，会报错；显式 `fresh: true` 才重新派发。

## 三个预置 agent（三件套种子）+ 两个 opt-in

首次启动时植入 `~/.dsh/agents/`（仅当目录里还没有可解析的 agent 时；你的修改
永远不会被覆盖）。它们就是普通的 markdown 文件，随便改。

| Agent | 一句话 | 典型用法 |
| ----- | ------ | -------- |
| **workhorse**（牛马狗） | 干活的主力：写代码、调查、测试、部署，脏活累活全包；默认 `deepseek-flash`，受保护禁止危险操作 | 「用 workhorse 把发布清单整理成表格」 |
| **oldfox**（老法师） | 顾问不干活：分析、trouble shooting、review 挑刺，只把关不动手；`glm-5.3` | 「让 oldfox 审一下这个方案」 |
| **rubber-duck**（小黄鸭） | 多模态视觉 agent：看截图/图表/手写字，画 plotext/mermaid/matplotlib 图；跑在支持图像的模型上 | 「用 rubber-duck 看这个截图，提取页面文字」 |

另有**两个 opt-in agent**（默认不装）：
⚠️ **Experimental — disabled by default（试验性功能，默认关闭）**。
`ptc-subagent`（批量判定专员，联动 codemode 工具链）与 `minimal-subagent`
（极简终端执行器，叶子）——能力已迁移合并，但产品面仍属试验阶段，默认关闭，
仅经 `/registry-config` 命令显式勾选（或手工拷贝包内
`templates/opt-in-agents/<语言>/<名字>.md` 并写配置键）后启用；已有文件不
覆盖，取消勾选不删除。种子只撒三件套——opt-in 永不自动安装。

## 用法

装好、重启 dsh，然后在对话里直接说——主模型会按名字挑 agent：

> 用 workhorse 把今天的发布清单整理成表格

底层就是 `use_agent(agent: "workhorse", prompt: "…")`。后台代理用
`ask_agent(agent: "worker", message: "…")` 追问，会等它的回复。

## 子智能体预设管理

在 Web 左侧主导航栏选择 **子智能体**，进入主工作区的完整管理页。页面自动读取实际 `agentsDir`，支持新增、复制、编辑、原文修复和删除；错误文件保留诊断，不会因刷新空目录而补文件。内部名称创建后固定；显示名变更前确认历史按名续跑或追问的影响。

管理页成功保存、删除、打开或刷新后，后续模型请求的工具名册即时更新，正在运行的调用保持原有 persona。手工改文件后打开管理页或刷新即可同步名册；纯 CLI/TUI 仍按次读取角色，静态名册在下次挂载时更新。

保存检测外部修改并保留未知字段、注释及未编辑正文；不能安全局部更新的文件转原文编辑。取消自身放弃/刷新确认或保存失败时保留草稿。切到宿主其他页再回来仍可继续本客户端草稿，重启或卸载不保证恢复。目录可能被多个 profile 共享，删除需确认此影响。

本次客户端包需要重新构建和安装；已有进程若未重载插件需重启以加载新的客户端入口。加载入口后，预设 CRUD 本身不需要重启。

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

## 插件配置（entry config）

配置挂在加载本插件的 patch 挂载块上（cordis.patch.yml 的 `config:` 段）：

| 键              | 默认            | 说明                                                                                             |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `agentsDir`     | `~/.dsh/agents` | agent 文件目录；默认字面量按 `$DSH_HOME` 解析，自定义值展开 `~` 后原样使用。                       |
| `provider`      | `spawn`         | 子代理 provider（复用 dsh-base 的 spawn）。                                                       |
| `toolName`      | `use_agent`     | 派发工具名。                                                                                      |
| `askToolName`   | `ask_agent`     | 追问工具名。                                                                                      |
| `leafDenyTools` | `[]`            | `deep: 0` 叶子子的禁用工具表；空 = 静态默认再与宿主已注册工具取交集。                              |
| `resume`        | `auto`          | 续跑档位：`auto` / `opt-in` / `off`。                                                             |
| `language`      | `zh`            | 界面语言：`zh`（中文，默认）/ `en`（English）/ `ru`（Русский）。作用于 web 管理面板文案、内置技能正文与模型路由描述、首次播种的预置 agent 模板（`templates/agents/<language>/`）；改后重启 dsh 生效，已存在的 agent 文件不会被改写。 |
| `disabledAgents` | `[]`（volatile） | **名册开关**：名单里的 agent 从 `use_agent`/`ask_agent` 名册隐藏、按名调用被拒；**只过滤名册，永不改动 agent 文件**。volatile 写热生效；`/registry-config` 命令可代写，执行期还会按活值再查（模型硬调停用名会被拒绝）。 |
| `ptcEnabled`    | `false`         | **opt-in 门控**：false（默认）不注册任何额外工具；true 在插件下次挂载（重启 dsh）时按 standing scope 注册 `codemode` 工具（主代理与派发子代理都可见）。Experimental（试验性功能，默认关闭）。 |
| `jevEnabled` 等 六键 | 见 ptc 章节 | jev 能力的 volatile 配置：`jevEnabled`（默认 false = 零 jev 调用）/`jevBackend`（zen）/`jevModel`（'' = 后端默认）/`jevTimeoutMs`（3000）/`jevSecretFile`（''）/`storageDir`（'' = `<dsh home>/storages/ptc-subagent`）。 |

## /registry-config 命令

会话里输入 `/registry-config` 打开管理向导（ask_user_question 两道多选题）：

1. **停用开关**：勾选要停用的 agent（勾选集合 = 新的 `disabledAgents`；不勾 =
   全部启用；已停用的名字要**保持勾选**才继续停用，选项描述标注当前状态）。
   开关作用域覆盖名册全部 agent（含你自己定义的），**永不碰任何 md 文件**。
2. **opt-in 安装**：勾选 `ptc-subagent` / `minimal-subagent` 安装可选 agent
   （⚠️ Experimental 试验性功能，默认关闭）。拷模板、已有不覆盖、取消勾选不
   删除；选 ptc 联动 `ptcEnabled: true` +
   拷 md；取消选联动反向（写 false + 把 ptc-subagent 停用进 `disabledAgents`，
   已拷 md 保留不删）。

生效时机：`disabledAgents` 是 volatile 键，命令收尾自动刷新名册、立即生效；
`ptcEnabled` 变更要等插件下次挂载（重启 dsh）。无头部署没有 ask 面板（ask 报
NO_PROVIDER）时，命令降级为错误文案，指引用手改配置键（`disabledAgents` /
`ptcEnabled` + 手工拷 `templates/opt-in-agents/<语言>/<名字>.md`）。

## ptc 能力（opt-in：codemode 工具）

> ⚠️ **Experimental — disabled by default（试验性功能，默认关闭）**：能力已
> 迁移合并，产品面仍属试验阶段；`ptcEnabled: false`（默认）不注册任何工具。

0.18.0 起本插件并入了原 `@aiwayds/dsh-ptc-subagent` 的全部代码：`codemode`
工具是一台插件自有的 PTC runner——异步 TypeScript 程序体跑在公开
`ctx.ptcRuntime` seam 上，带一对为批量工作造的绑定：**`jev`**（校准判定后端，
`classify` 一次往返判成批 choice/score/noul 问题，失败返回结构化 `{error}`
而绝不 reject；1:1 直通 `@aiwayds/dsh-jev-core`）与 **`store`**（会话级键值
记忆，挂在会话持久日志上——resume 后仍在、按 fork 隔离，配额 256KB/值、
1MB/分支）。失败的 run 以宿主自身的 `CODE_RUN_FAILED` 合同返回（失败类别 +
捕获日志），结果报告 `{value, logs, jevCalls, storeWrites}`。

- **默认完全关闭**：`ptcEnabled: false` 不注册工具；`jevEnabled: false` 零
  jev 调用。每次 jev 调用（含失败）在
  `<dsh home>/storages/ptc-subagent/usage.jsonl` 落一行（只记元数据与 token
  数，永记状态文本）。
- **配套**：`ptc-subagent` opt-in 模板是专职派发角色；bundle patch 迁入了
  agent-preset 四守卫行（`agent-preset-registry` / `subagent-model-selection-settings` /
  `preset-native` / `preset-codemode`）——profile 已挂 agent-preset 层的，先
  去掉重复 id 行再装，否则 loader 拒绝重复 id。
- **升级自独立 ptc 仓**：用法与配置键同名同义（entry id 换成
  `dsh-subagent-registry`），usage.jsonl 落盘路径不变，历史记录直接延续。

## 内置技能

插件随包注册一个名为 `dsh-subagent-registry-config` 的技能（bundled skill）。对话涉及自定义
子代理、agent `.md` 编写、子代理续跑或本插件配置时，dsh 会自动加载这份使用与配置指南，
主模型可以据此用 `ask_user_question` 代写 agent 文件、调整插件配置，无需翻 README。
技能与插件同版本发布，随 npm 包携带（`skills/dsh-subagent-registry-config/SKILL.md`，
另有英文版 `SKILL.en.md` 与俄文版 `SKILL.ru.md`，由 `language` 键选择，见上表）。

## 安装

**要求 dsh >= 0.2.0-rc.2**（RC/稳定线；alpha 线不再支持）。兼容性验证至 `0.2.0-rc.2` 与 `0.2.1-rc.2`。宿主须挂载会话持久化及 `sessionQuery` 服务；续跑与追问使用各版本自身的会话格式，不提供跨版本迁移。

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
npm test         # 单元回归及临时目录中的真实 npm 安装检查（无 LLM）
npm run test:host # 当前 SDK 的真实服务/持久化/manager/spawn；脚本化模型，无网络
npm run test:hosts # 同一编译插件分别加载两套实际发布 SDK，并核实版本
```

从插件目录初始化隔离 SDK（已有环境无需重复安装）：

```sh
npm install --prefix ../../.tmp/dsh-type-closure-rc2 --ignore-scripts @deepseek-ai/dsh@0.2.0-rc.2 @deepseek-ai/dsh-session-query@0.2.0-rc.2
npm install --prefix ../../.tmp/dsh-type-closure --ignore-scripts @deepseek-ai/dsh@0.2.1-rc.2 @deepseek-ai/dsh-session-query@0.2.1-rc.2 @deepseek-ai/dsh-working-directory@0.2.1-rc.2
```

可用 `DSH_TEST_RC2_CLOSURE_DIR` / `DSH_TEST_021_CLOSURE_DIR` 指向其他隔离环境的 `node_modules`；测试只将模型脚本化，服务与持久化使用对应版本的真实实现。

### `@deepseek-ai/*` 依赖契约（为什么是 optional peer）

本仓对 `@deepseek-ai/*`（`cordis`、`dsh-subagent`、`dsh-llm`、`schemastery` 等）
在发布包中声明 **optional peerDependencies**（`>=0.2.0-rc.2 || >=0.2.1-rc.1`）。这是有意的两层分工：

- **发布语义（给消费者）**：声明表达「使用宿主自带的同名包、版本下限
  `>=0.2.0-rc.2 || >=0.2.1-rc.1`」。optional peer 不会被 pnpm / npm 自动安装，因此不会在
  profile 的 `node_modules` 里生成第二份拷贝去遮蔽（shadow）宿主 bundled 的
  闭包。会出事的是硬 dependency 精确钉旧 rc 版——那会把宿主 0.2.x 弄到无法
  boot（已知社区事故模式）。
- **开发 typecheck（给本仓）**：devDependencies 钉住新版 SDK，`scripts/link-dsh-closure.mjs`
  （postinstall）把 `node_modules/@deepseek-ai/*` 软链到 `DSH_CLOSURE_DIR` 指定或全局 dsh 安装的闭包，
  保证类型图里只有一份 `@deepseek-ai/cordis`——出现第二份会打断 cordis 的
  `declare module` 类型增强（`Property 'settings' does not exist on type
  'Context'`）。

维护守则：这些包永远保持 optional peer 形态——不要移回 dependencies /
devDependencies，也不要去掉 `optional: true`（非 optional peer 在
`auto-install-peers` 开启的 pnpm 下会被自动安装，第二副本问题即复发）；同样不要新增任何硬 dependencies——钉死的第二份拷贝会以同样方式遮蔽宿主闭包。

## Integration tests

`e2e/podman-install/` installs the **published** tarballs of this plugin, dsh-dcp, dsh-cron, dsh-llm-proxy, and dsh-profile-switch inside a container with a real dsh CLI, using a real npm client with dependency lifecycle scripts on — the exact intersection that let the packaged-`postinstall` breakage (#2) ship unnoticed. It asserts the install exits clean, the closure linker stands down in the consumer tree, the real host composes and boots each profile, and dcp's schema default + explicit-empty semantics survive the real config layer.

- Local (macOS, podman machine up): `e2e/podman-install/run.sh`
- The same assertions run bare on Linux (no podman needed) via the weekly scheduled `e2e install` workflow; `bash e2e/podman-install/entry.sh` works on any node 22+ machine with the global dsh CLI.

## License

Apache-2.0
