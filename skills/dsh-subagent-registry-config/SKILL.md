---
name: dsh-subagent-registry-config
description: "dsh 子代理注册表插件（@aiwayds/dsh-subagent-registry）使用与配置指南。凡涉及自定义子代理、use_agent/ask_agent、agents 目录、agent .md 编写、子代理续跑，或要调整本插件配置时先读本指南：~/.dsh/agents/*.md frontmatter 全键（name/deep/display_name/description/model/thinking/background/maxRounds）、entry config 六键（agentsDir/provider/toolName/askToolName/leafDenyTools/resume）、ask_user_question 代写 agent 文件向导、中断 run 续跑语义、接入与使用体检（插件装没装/挂没挂、模型用没用过）。触发词：子代理、agent、use_agent、ask_agent、agents 目录、续跑、resume、体检、调试、没调用。"
---

# dsh-subagent-registry 使用指南（自定义子代理 / use_agent）

> dsh 插件：把 `~/.dsh/agents/*.md` 注册成可派发的自定义子代理——`use_agent` 按名字
> 派发，`ask_agent` 对后台 run 追问并等回复，中断的 run 再次调用自动续跑。每个子代理
> 都是真正的 dsh 会话（完整会话、持久化、可继续），跑在 dsh 自带的 `spawn` provider
> 上，插件不改 dsh 本体。

## 双宿主支持

同一插件包已在 DSH `0.2.0-rc.2` 与 `0.2.1-rc.2` 的实际发布 SDK 上验证（RC/稳定线；alpha 线不支持）。按公开 API 自动选择（功能探测）：旧版前台 `start`、后台 `startContinuable`；新版 `startActivation`，前台 caller、后台 parent 投递，persona 与 leaf 工具限制在 `subagent/start` 边缘安装到子代理自身作用域。接口调用失败直接报错，不能换接口重复派发。续跑与追问分别读取各自宿主的会话格式，不提供跨版本迁移。宿主须挂载会话持久化及 `sessionQuery`；英文角色委派指导在两线保持相同文案。

## agent 定义格式（`<agentsDir>/<name>.md`）

一个 markdown 文件就是一个 agent：`---` frontmatter 写元数据，正文**原样**作为该子代理
的 persona（system prompt）。frontmatter 全键：

| 键             | 必填 | 默认               | 说明与失败行为                                                                                       |
| -------------- | ---- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `name`         | 是   | —                  | agent id = 文件名（去掉 .md）。缺失或空 → **整个文件丢弃**。                                          |
| `deep`         | 否   | `1`                | 非负整数。`0` = 叶子（能干活但禁止再派发子代理）；`≥1` = 可再派发的相对深度预算。非整数/负数 → 整文件丢弃。 |
| `display_name` | 否   | 缺省               | 可选 UI 标签；子代理按 `display_name ?? name` 打标签，续跑与追问靠它找到旧 run。                       |
| `description`  | 否   | 缺省               | 一行简介，显示在 `use_agent` 工具描述的名册里，供主模型选人。                                          |
| `model`        | 否   | 缺省 = 继承        | `provider/model` 路由；无斜杠的值视为 provider 名 + 继承该部署默认模型。                                |
| `thinking`     | 否   | 缺省 = 继承        | `off`/`low`/`medium`/`high`/`max`，**大小写敏感**；其他值 → 整文件丢弃。                                |
| `background`   | 否   | 缺省 = 前台        | 严格 `true`/`false`（大小写敏感、无缩写）；其他值 → 整文件丢弃。`true` = 默认后台派发，可用 ask_agent 追问。 |
| `maxRounds`    | 否   | 缺省 = 全局        | 正整数，per-agent 轮数上限（覆盖 `dsh-tui.maxRounds` 全局值）；非正整数 → 整文件丢弃。供 TUI 硬停梯消费。 |

最小模板：

```markdown
---
name: my-agent
display_name: 我的代理
description: "一行简介，显示在 use_agent 名册里"
model: opencode-go/deepseek-v4-flash
thinking: high
deep: 0
---

You are my-agent. 这段 markdown 正文会原样作为 system prompt。
```

注意：**未知键静默忽略**——`extensions` / `tools` / `color` 等写了没用（fun-agent 约定的
`extensions` 在这里不受支持），留着只会误导后来读文件的人。

## 交互式配置向导（ask_user_question）

用户说"帮我建一个 XX 子代理 / 加一个 agent"时，不要甩文档让对方自己读——用
`ask_user_question` 逐题收集，然后**代写文件**：

1. **名字 + 职责**：kebab-case 名字（= 文件名），一句话 `description`（会进
   use_agent 名册，写清什么时候该派它）。
2. **模型**：继承部署默认（推荐，留空）／指定 `provider/model` 路由。
3. **thinking 档位**：不设（继承默认）／off / low / medium / high / max。
4. **派发深度**：`deep: 0`（叶子，禁止再开子代理）／`deep: 1`（默认，可再派发）。
5. **前台还是后台**：前台一次性（缺省）／`background: true`（后台可持续会话，主对话
   不阻塞、可 `ask_agent` 追问）。

收集完生成 `<agentsDir>/<名字>.md` 写入 agents 目录（正文按用户描述写成人设
system prompt，**逐字使用**，不要二次改写），并告知生效时机：

- **新文件立即可按名调用**——`use_agent` 执行时会从磁盘重读文件。在 Web 左侧导航打开“子智能体”或手动刷新，工具名册在后续模型请求中同步更新，无需重启；页面保存/删除也自动刷新。纯 CLI/TUI 没有 Web 管理页时，名册在插件下次挂载时更新。
- **已有文件的修改**（正文、frontmatter）下次 `use_agent` 调用即生效，无需重启。

## 插件自身配置（entry config 六键）

本插件没有 settings 命名空间，配置挂在**加载它的 patch 挂载块**上（bundle 的
cordis.patch.yml `insert` 项的 `config:` 段，即 entry config）：

```yaml
- insert:
    - id: dsh-subagent-registry
      name: '@aiwayds/dsh-subagent-registry'
      config:
        agentsDir: ~/.dsh/agents   # agent 文件目录；仅这个默认字面量按 $DSH_HOME 解析，自定义路径按字面使用（~ 展开）
        provider: spawn            # 子代理跑过哪个 subagent provider（复用 dsh-base 的 spawn）
        toolName: use_agent        # 派发工具名
        askToolName: ask_agent     # 追问工具名
        # leafDenyTools: []        # deep:0 叶子子的禁用工具表；空 = 静态默认（dsh 自带派发工具 + toolName）再与宿主已注册工具取交集；非空原样透传（不交集）
        resume: auto               # auto | opt-in | off
```

| 键              | 默认           | 说明                                                                                             |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `agentsDir`     | `~/.dsh/agents` | 仅默认字面量按 `$DSH_HOME` 解析（即 `$DSH_HOME/agents`）；自定义值展开 `~` 后**原样**使用，不重锚到 dsh home。 |
| `provider`      | `spawn`        | 子代理 provider。                                                                                 |
| `toolName`      | `use_agent`    | 派发工具名；自定义后叶子 deny 列表会自动跟随。                                                     |
| `askToolName`   | `ask_agent`    | 追问工具名。                                                                                      |
| `leafDenyTools` | `[]`           | 空 = 静态默认（`subagent`/`subagent_fork`/`workflow`/`ralph` + `toolName`）∩ 宿主当前注册的工具（防陈旧名触发宿主 fail-fast）；非空**原样透传**、不交集，陈旧条目由宿主校验拒绝。 |
| `resume`        | `auto`         | 续跑档位，见下节。                                                                                |

### 并发与深度上限（dsh 0.1.7 起，官方托管）

同时活跃的子代理数与嵌套深度由**官方 dsh-subagent 服务**托管（本插件不自管并发
计数/排队）：`maxActiveSubagents`（默认 `8`）、`maxDepth`（默认 `1`），都是
volatile 字段、免重启热调。用户要"多开几个并行子代理 / 允许更深的嵌套"时，在
profile patch 写 `subagent: { maxActiveSubagents: N, maxDepth: M }`，或运行时
`settings.update('subagent', …)`；agent 文件的 `deep` 只是在这条官方预算内收紧
（`deep: 0` 叶子直接拔掉派发工具）。`maxRounds`（per-agent 轮数上限）仍是本插件
frontmatter 键，官方没有轮数预算能力，继续由宿主 TUI 硬停梯消费。

## 续跑与追问

- **resume 三档**：`auto`（默认）= 本对话里该 agent 有中断 run 就自动续跑；
  `opt-in` = 仅当调用显式传 `resume: true` 才续；`off` = 从不自动续（调用方显式
  `resume: true` 仍可强制续跑）。`fresh: true` 反向强制全新开始。工具参数层面
  `resume` 与 `fresh`、`background` 与 `resume` 互斥。
- **中断判定**：按子代理持久化事件日志**最后一条 accounting `turn/end`**——不是
  `completed`（error / aborted / max-tokens / 崩溃无记录）即为中断可续。续跑沿用同一
  persona/model/工具组合，只推进一个 continuation turn，失败可反复续，进度一直累积。
  续跑依赖会话持久化；已选中旧 run 后读取、占用或恢复失败会报错，不自动创建第二个任务，显式 `fresh: true` 才重新派发。
  新版 activation 前台 run 使用 `[fg] <display_name ?? name>` 短前缀标签（v0.14.0 曾用 `[use_agent foreground] ` 长前缀，仍兼容识别）；旧版前台仍为普通标签的 one-shot。后台保持普通标签，两种前台均可续跑。
  后续取消的 pending input 或未闭合新 turn 也算可续，不能只看较早的 completed。
  两个支持版本的公开 API 尚不支持带当前 composition、caller-only 投递的 managed cold resume；前台续跑由 `agents.resume` 驱动，调用取消可停止，但不受 manager 并发槽和 `interrupt_agent` 管理，也不能用 stock `send_message` 联系父级。新派发与后台追问由 manager 管理。
- **`ask_agent` 面向 background run**：对最近的后台 run 追问并**等回复**（按
  `agent` 名或派发时返回的 `agent_id`，二者传且仅传一个；可选 `timeout` 秒数上限，
  `≤0` 视为未传）。前台一次性 run 不能追问——它的续跑走 `use_agent` 的 resume 机制。

## 接入与使用体检（debug）

按三步定位"装没装 → 挂没挂 → 通没通"，再查使用痕迹。`<profile>` 换成实际 profile 名
（`tui` / `web` / `desktop` / `headless`…），每个 profile 的插件与挂载互相独立。

### 第 1 步：装了吗（包在不在 profile 里）

```sh
dsh plugin --profile <profile> list    # 实为把参数原样转发给 profile 目录里的 pnpm；应看到 @aiwayds/dsh-subagent-registry
ls ~/.dsh/profiles/<profile>/node_modules/@aiwayds/   # 等价查法
```

### 第 2 步：挂了吗（insert 块进了组合层没）

```sh
dsh dump-config --profile <profile>    # 应看到 id: dsh-subagent-registry 的 insert 项及其 config
grep dsh-subagent-registry ~/.dsh/profiles/<profile>/cordis.patch.yml
```

注意 dump-config 显示的是 patch 层的**组合结果**，不含 schema 物化后的运行时值。

### 第 3 步：通了吗（目录扫描 + 工具注册 + 模型可见）

- `ls ~/.dsh/agents/`：首次启动（目录原本为空）会植入 workhorse / oldfox / rubber-duck
  三个预置 agent——它们在，说明 agentsDir 扫描通了。
- 会话里直接问模型："列出你当前可用的工具"——应见 `use_agent` / `ask_agent`，且
  `use_agent` 的描述里带 agent 名册。
- 顺手验证 skill 路由：跟模型聊"帮我配个子代理"，应能调出 `dsh-subagent-registry-config` 技能。

### 用没用过（使用痕迹）

- **看卡片/回看器**：tui-pi 的 `/history` 回看会话，或 web/飞书回合卡的活动段——
  `🔧 use_agent · ✔` 一行就是一次派发。
- **落盘直查（任何 profile 通用）**：每个会话是
  `~/.dsh/sessions/<工作区目录>/<会话id>/session.v3.jsonl.zstd`，直接数调用：

  ```sh
  zstdcat ~/.dsh/sessions/<工作区目录>/<会话id>/session.v3.jsonl.zstd | grep -c use_agent
  ```

  大于 0 即该会话调用过；子代理本身也是独立 dsh 会话，落在同一个 sessions 根目录。

### 症状 → 断点

| 症状 | 断在哪 | 去哪修 |
| --- | --- | --- |
| `dsh plugin … list` 里没有本插件 | 安装 | `dsh plugin --profile <profile> add @aiwayds/dsh-subagent-registry`，重启 dsh |
| dump-config 里没有 insert 块 | 挂载 | 检查 profile 的 cordis.patch.yml，重新挂载后重启 |
| 工具在、名册空 | agentsDir / 文件位置 / frontmatter | 见下方"排障" 1、2 |
| 工具、名册都在，模型就是不调 | 模型选择 | 把 agent 的 `description` 写清"何时该派我"；TUI 面还可配合 tui-pi 的 registeredOnly |
| 一调用就报 `ctx.subagents.start is not a function` | 加载了旧插件或宿主不在已验证范围 | 已验证 DSH `0.2.0-rc.2` 与 `0.2.1-rc.2`（RC/稳定线；alpha 线不支持）；确认实际插件版本，更新后重启；不推断其他宿主版本兼容 |

## 排障

1. **agent 文件被丢弃** → 看启动/loader 日志的解析错误：缺 `name`、`deep` 非整数或
   负数、`thinking`/`background` 非法值，都会**整文件丢弃**（不是降级修复）。
2. **agent 没出现在 `use_agent` 工具里** → 依次查：agentsDir 配得对不对（默认
   `$DSH_HOME/agents`）；文件是不是 `<名字>.md` 直接放在目录顶层（不递归子目录）；
   frontmatter 是否合法且 name 与文件名一致（见上一条）。Web 管理页打开或刷新会同步名册；纯 CLI/TUI 下次挂载更新名册，新文件均可立即按名调用。
3. **预置 agent 丢了/被改** → 首次启动只在目录为空时植入 workhorse / oldfox /
   rubber-duck 三个预置 agent；已有文件永远不会被覆盖，删掉就是删掉。卸载插件也
   不会动 `~/.dsh/agents/` 里的文件。
