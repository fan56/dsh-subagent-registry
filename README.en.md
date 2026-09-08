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
- **Background dispatch + two-way follow-ups** — `background: true` runs the
  agent as a durable background conversation while the parent keeps working;
  `ask_agent` sends a follow-up and waits for the reply.
- **Three personas out of the box** — `workhorse` / `oldfox` / `rubber-duck`
  are seeded on first start (see below).
- **Built on the official subagent machinery** — no reimplementation: every
  custom agent starts through dsh's stock `spawn` provider, so each child is a
  real dsh subagent (full session, persistence, continuable). New capabilities
  in the official subagent stack (bidirectional messaging, say) are inherited
  automatically; the native `subagent` tool keeps working alongside — the two
  coexist without interference.
- **Pure plugin** — only relies on dsh ≥ 0.1.2-rc.1's public subagent
  machinery; uninstalls cleanly at any time.

## The three shipped agents

Seeded into `~/.dsh/agents/` on first start (only when the directory holds no
parsable agent — your edits are never overwritten). All three are ordinary
markdown files: edit them freely.

| Agent | Role | Example |
| ----- | ---- | ------- |
| **workhorse** (牛马狗) | The workhorse: writes code, investigates, tests, deploys — all the grunt work; default `deepseek-v4-flash`, guarded against dangerous operations | "Use workhorse to turn the release checklist into a table" |
| **oldfox** (老法师) | The advisor who doesn't build: analysis, trouble shooting, review, audits — checks, never implements; `glm-5.3` | "Have oldfox review this design" |
| **rubber-duck** (小黄鸭) | Multimodal visual agent: reads screenshots / charts / handwriting, draws plotext / mermaid / matplotlib figures; runs on an image-capable model | "Use rubber-duck on this screenshot, extract the page text" |

## Usage

Install, restart dsh, then just ask in the conversation — the main model picks
the agent by name:

> Use workhorse to turn today's release checklist into a table

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

Frontmatter keys: `name` (required), `description`, `display_name`, `model`
(`provider/model`; absent = inherit), `thinking`
(`off/low/medium/high/max`; absent = inherit), `deep` (`0` = leaf, may not
spawn subagents; default `1`), `background` (`true` = dispatch in the
background by default). Unknown keys are silently ignored.

→ **Full reference**: [docs/AGENT-FORMAT.md](docs/AGENT-FORMAT.md) — every key's
validation and failure modes, `deep`/`thinking` semantics, resume mechanics,
background dispatch, configuration fields, known limitations.

## Bundled skill

The plugin ships a bundled skill named `dsh-subagent-registry`. Whenever the
conversation touches custom subagents, agent `.md` authoring, resume semantics,
or this plugin's configuration, dsh loads the bundled usage & configuration
guide, so the model can write agent files for you (collecting choices via
`ask_user_question`) and adjust the plugin config without digging through the
README. The skill is versioned and published with the package
(`skills/dsh-subagent-registry/SKILL.md`).

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
