---
name: dsh-subagent-registry-config
description: "dsh 子代理注册表插件（@aiwayds/dsh-subagent-registry）使用与配置指南。凡涉及自定义子代理、use_agent/ask_agent、agents 目录、agent .md 编写、子代理续跑，或要调整本插件配置时先读本指南：~/.dsh/agents/*.md frontmatter 全键（name/deep/display_name/description/model/thinking/background）、entry config 六键（agentsDir/provider/toolName/askToolName/leafDenyTools/resume）、ask_user_question 代写 agent 文件向导、中断 run 续跑语义。触发词：子代理、agent、use_agent、ask_agent、agents 目录、续跑、resume。"
---

# dsh-subagent-registry 使用指南（自定义子代理 / use_agent）

> dsh 插件：把 `~/.dsh/agents/*.md` 注册成可派发的自定义子代理——`use_agent` 按名字
> 派发，`ask_agent` 对后台 run 追问并等回复，中断的 run 再次调用自动续跑。每个子代理
> 都是真正的 dsh 会话（完整会话、持久化、可继续），跑在 dsh 自带的 `spawn` provider
> 上，插件不改 dsh 本体。

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

- **新文件立即可按名调用**——`use_agent` 执行时会从磁盘重读文件；但工具描述里的
  **名册是插件装载时静态构建的，新 agent 要重启 dsh 后才会出现在名册里**，在那之前
  直接点名调用即可。
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
        # leafDenyTools: []        # deep:0 叶子子的禁用工具表；空 = 计算默认（dsh 自带派发工具 + toolName），非空则整体替换
        resume: auto               # auto | opt-in | off
```

| 键              | 默认           | 说明                                                                                             |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `agentsDir`     | `~/.dsh/agents` | 仅默认字面量按 `$DSH_HOME` 解析（即 `$DSH_HOME/agents`）；自定义值展开 `~` 后**原样**使用，不重锚到 dsh home。 |
| `provider`      | `spawn`        | 子代理 provider。                                                                                 |
| `toolName`      | `use_agent`    | 派发工具名；自定义后叶子 deny 列表会自动跟随。                                                     |
| `askToolName`   | `ask_agent`    | 追问工具名。                                                                                      |
| `leafDenyTools` | `[]`           | 空 = 计算默认（`subagent`/`subagent_fork`/`workflow`/`ralph` + `toolName`）；非空整体替换默认。     |
| `resume`        | `auto`         | 续跑档位，见下节。                                                                                |

## 续跑与追问

- **resume 三档**：`auto`（默认）= 本对话里该 agent 有中断 run 就自动续跑；
  `opt-in` = 仅当调用显式传 `resume: true` 才续；`off` = 从不自动续（调用方显式
  `resume: true` 仍可强制续跑）。`fresh: true` 反向强制全新开始。工具参数层面
  `resume` 与 `fresh`、`background` 与 `resume` 互斥。
- **中断判定**：按子代理持久化事件日志**最后一条 accounting `turn/end`**——不是
  `completed`（error / aborted / max-tokens / 崩溃无记录）即为中断可续。续跑沿用同一
  persona/model/工具组合，只推进一个 continuation turn，失败可反复续，进度一直累积。
  续跑依赖部署的会话持久化；没有持久化时静默改走全新派发。
- **`ask_agent` 面向 background run**：对最近的后台 run 追问并**等回复**（按
  `agent` 名或派发时返回的 `agent_id`，二者传且仅传一个；可选 `timeout` 秒数上限，
  `≤0` 视为未传）。前台一次性 run 不能追问——它的续跑走 `use_agent` 的 resume 机制。

## 排障

1. **agent 文件被丢弃** → 看启动/loader 日志的解析错误：缺 `name`、`deep` 非整数或
   负数、`thinking`/`background` 非法值，都会**整文件丢弃**（不是降级修复）。
2. **agent 没出现在 `use_agent` 工具里** → 依次查：agentsDir 配得对不对（默认
   `$DSH_HOME/agents`）；文件是不是 `<名字>.md` 直接放在目录顶层（不递归子目录）；
   frontmatter 是否合法（见上一条）。新写的文件要重启 dsh 才进名册，但可立即按名调用。
3. **预置 agent 丢了/被改** → 首次启动只在目录为空时植入 workhorse / oldfox /
   rubber-duck 三个预置 agent；已有文件永远不会被覆盖，删掉就是删掉。卸载插件也
   不会动 `~/.dsh/agents/` 里的文件。
