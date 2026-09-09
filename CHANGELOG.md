# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
