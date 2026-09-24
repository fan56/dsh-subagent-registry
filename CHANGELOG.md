# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **dsh support floor raised to 0.1.7-rc.1** (peer floors `>=0.1.7-rc.1`, dev pins exact `0.1.7-rc.1`; `@deepseek-ai/cordis` → `~4.0.4`, `@deepseek-ai/schemastery` → `~3.18.4`; READMEs updated). The closure rides the 0.1.7 shapes.
- **Child discovery follows the 0.1.7 durable catalog** — `ctx.subagents.listChildren()` now returns `SubagentCatalogEntry[]` (`{ id, createdAt, mode, label? }`): the old `SubagentListEntry` fields are gone (every row is a child — no `kind` discriminator; `mode` gains `'unknown'`; liveness is no longer carried). The one-shot resume picker's `activity: 'inactive'` prefilter is replaced by a live agent registry check (`ctx.agents.get`) inside `findResumableRun`; the continuable picker is unchanged in behavior (resident and cold continuable children both stay addressable; `unknown`-mode rows qualify as neither).
- **The continuation notice declares its own message-source kind** — 0.1.7 removed the shared catch-all `plugin` source kind; the resume follow-up now carries `kind: 'dsh-subagent-registry'` (with the official `form: 'notice'` context shape) declared through the merge-extensible `MessageSourceMap` (`declare module '@deepseek-ai/dsh-llm'`), the same move the official `agent-message`/`subagent-settled` sources make.
- **Concurrency and depth limits are official-owned (R0 decision)** — this plugin keeps no concurrency counter or queue of its own; the official dsh-subagent volatile config (`maxActiveSubagents`, default 8; `maxDepth`, default 1; ActivationManager-enforced) is the single authority. Tune via a profile patch `subagent: { maxActiveSubagents: N, maxDepth: M }` or `settings.update('subagent', …)`. The per-agent `maxRounds` frontmatter key is retained (the official seam has no round budget; the host TUI hard-stop ladder still consumes it). README/README.en/AGENT-FORMAT/SKILL document the semantics and the patch recipe.
- `finalAssistantOutput`/`SubagentResult.output` became `readonly ContentBlock[]` in 0.1.7; the tool result contracts follow (`ChildReply`/`ResumedRunResult`/`settleForegroundRun`).
- `resolveChildDepth(parent, maxDepth?)` is signature-identical in 0.1.7 — the three call sites (`buildStartRequest`, the resume drive, `resolveChildAgentOptions` stamping) are verified unchanged.
- **Plugin Manager metadata.** Added `icon.svg` and `locale/{en,zh}.json` (`meta.title`/`meta.description` per the official `readPluginMeta` contract); `package.json` now declares the `icon` and ships both in the tarball.

### Unchanged by decision
- `session.snapshotEvents()` stays in use at the four read sites (wait-loop poll, reply window, resumed-turn result read, child error diagnostics): the 0.1.7 deprecation is soft (`@deprecated`, functional), the persistence-handle/projection replacements would add async failure modes to hot or sync-only paths. Marked with notes; revisit if the deprecation hardens.

## [0.11.0] - 2026-09-11

### Fixed
- **Stored-log reads go through `open('read')` handles** — dsh 0.1.5 removed the whole-log `inspect()` accessor the persistence seam still declared. The structural seam compiled and unit-tested fine (fakes implement the declared shape) but failed at runtime, silently degrading resume lookup, the child event boundary, and cold-child reply observation to their fail-open paths. `readStoredEvents()` now opens a read handle (never takes write ownership, works while another process drives the child), reads the requested suffix, and always closes the handle.

### Changed
- **dsh support floor raised to 0.1.5-rc.2** (peer floors, dev pins, locks; READMEs updated). The closure rides the 0.1.5-rc.2 shapes.
- Test fixtures follow the 0.1.5 shapes: `assistant/message` carries `stream: []`, the persona section is `deployment:persona-prefix`, and the publication-window regression splices through the durable `agent/inbox/spliced` append (the `Inbox` runtime class is gone).

## [0.10.0] - 2026-09-09

### Added
- **Per-agent round cap** — agent `.md` frontmatter gains a `maxRounds` key (positive integer; anything else marks the file broken, same fail-loud policy as `thinking`/`background`), the per-agent tier of the host TUI's subagent round policy: children dispatched under an agent whose file declares `maxRounds` are capped at that value instead of the deployment's global `dsh-tui.maxRounds`. Absent = the global cap applies.
- **`readAgentMaxRounds(label, dir)` export** — the label→cap lookup host UIs consume: an exact agent-name hit wins, then a unique `display_name` hit; an ambiguous display name, an unknown label, or an unreadable dir all resolve to `undefined` (fail-closed — a lookup failure can only narrow the resolution to the global cap, never widen it). Re-reads the dir per call: the roster is user-owned and editable at runtime. Consumed through dsh-tui-pi's dynamic probe as an optional contract member, so registries older than this release degrade cleanly to the global cap.
- The bundled skill's frontmatter key table, routing description, and README enumerate the new key.

## [0.9.1] - 2026-09-09

### Changed
- The bundled skill is renamed `dsh-subagent-registry` → `dsh-subagent-registry-config` (ecosystem-wide convention: config/usage-guide skills end with `-config`). Bundled skills are registered in-process with zero on-disk footprint, so the upgrade migrates itself: update the package and restart dsh — the new name takes effect and the old `/dsh-subagent-registry` slash invocation stops resolving. README skill paths updated.

## [0.9.0] - 2026-09-08

### Added

- **Bundled usage & configuration skill** — the package now ships `skills/dsh-subagent-registry/SKILL.md`, registered through `ctx.skills.registerProvider` (the dsh-llm-proxy / dsh-vault mechanism): a Chinese guide covering the agent-file frontmatter (all seven keys and their exact drop-file failure modes), the six entry-config keys, resume / `ask_agent` semantics, and an interactive `ask_user_question` wizard that writes agent files on the user's behalf — including the verified effectiveness timing (a new agent is dispatchable by name immediately; the `use_agent` roster picks it up after a restart). `inject` gains the `skills` seam, `@deepseek-ai/dsh-skill` joins the peer/dev closure, and an anti-drift test (`test/skill.test.mjs`) keeps the hardcoded routing description byte-identical to the packaged frontmatter.

## [0.8.5] - 2026-09-07

### Documentation

- The Why section of both READMEs now states the relationship to the official subagent machinery explicitly: custom agents start through dsh's stock `spawn` provider (a child **is** a real dsh subagent — session, persistence, continuable), host-side subagent capabilities are inherited automatically, and the native `subagent` tool keeps working alongside.

## [0.8.4] - 2026-09-07

### Changed

- **README is now Chinese-first with a separate English edition** — the quick-start README was a Chinese/English mix; `README.md` is now fully Chinese with a `[English](./README.en.md)` link at the top, and the English edition lives in `README.en.md` (linking back). Both carry identical content; the full reference stays in `docs/AGENT-FORMAT.md`.

## [0.8.3] - 2026-09-07

### Changed

- **README rewritten for clarity** — 460 lines shrink to a quick start: the why, the three shipped agents (workhorse / oldfox / rubber-duck), a minimal agent example, install/uninstall. Every deep detail — the frontmatter key reference, `deep` / `thinking` semantics, resume mechanics, background dispatch and `ask_agent`, the configuration surface, known limitations, the maintainer publishing note — moves to the new `docs/AGENT-FORMAT.md` (also shipped in the npm tarball so the README link resolves there too).

### Removed

- **the dead `color` frontmatter key** — the parser read it into `AgentMeta` but nothing ever consumed it (no UI, no tool surface, no passthrough); the key now falls into the existing "unknown keys are silently ignored" bucket, which is observationally identical. The `oldfox` template drops its `color: red` line.

## [0.8.2] - 2026-09-07

### Fixed

- `agent_id` tool description now matches the XOR validation ("mutually exclusive", no more "takes precedence" contradiction)

### Documentation

- README aligned with current source — full frontmatter reference (8 supported keys), corrected seeding semantics, ask_agent XOR/timeout notes, descriptor-version gating wording; removed unsupported `extensions` key from examples and bundled templates

## [0.8.1] - 2026-09-05

### Changed

- Clean-uninstall story, documented and tested: the README gains an Uninstall section (the removal command, what stays on disk — the seeded `~/.dsh/agents/*.md` personas and any user-written agents — the dsh-tui-pi graceful-degradation note, and how continuable children behave after removal), and the boot smoke gains an uninstall leg: after the boot proof it runs `dsh plugin --profile smoke remove @aiwayds/dsh-subagent-registry` against the scratch profile and asserts the second `--dump-config` no longer contains the plugin entry — removal must reconcile the composed tree back to stock.
