# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Adapted to the dsh 0.2.2-rc.1 host wave; the 2026-11-04 incident pin is lifted.** Two breaking changes bit this source, both fixed against the new closure (typecheck + full unit suite + real-host boot smoke green):
  - `system-prompt/assemble` now carries the `PromptPresentation` only (sections/contexts/variables) — tool declarations are provider-owned and merged into the post-waterfall `PromptAssembly`. `src/delegation-guidance.ts` no longer reads `assembly.tools`; it resolves the tool universe from `ctx.tools.schemas(context.scope)` instead. Semantics preserved: in PTC mode that scoped view is exactly what the old code used (the wire exposes only the reserved transport while scoped schemas retain SDK tools); outside PTC it differs from the old assembled set only by conditional registrations not admitted this step, which the section-presence gating already absorbs (a native delegation section only exists when its tool was actually presented).
  - `CodeRunFailedError` moved out of `@deepseek-ai/dsh-tools` (it now ships in the new `@deepseek-ai/dsh-tool-executor-ptc`, a package absent from pre-0.2.2 hosts). `src/ptc/runner.ts` exports a canonical-shape local subclass of `HarnessError` (`@deepseek-ai/dsh-llm`, present on every host generation the peer floors promise): same `code: 'CODE_RUN_FAILED'`, same `name`, same `(message)` constructor. The execution pipeline recognizes thrown `HarnessError` instances by base class (`dsh-tools` pipeline `errorInfo`), so the structured isError contract is unchanged — and importing the moved class statically would have killed plugin load on the very hosts the floors cover.
- **devDependencies re-pointed to the 0.2.2-rc.1 wave** — all 31 `@deepseek-ai/dsh-*` exact-pinned to `0.2.2-rc.1`, `cordis` to `4.1.0`, `schemastery` to `3.19.0` (the versions the 0.2.2-rc.1 host closure ships; `pnpm-lock.yaml` regenerated in the same change). peerDependencies are untouched: every floor (`>=0.2.0-rc.2 || >=0.2.1-rc.1`, `schemastery ~3.18.4`) still matches the 0.2.2-rc.1 runtime under the host's includePrerelease compatibility check, and the two fixes above intentionally avoid new-host-only APIs, so no floor earns a raise.
- **CI rides the wave again** — ci.yml (both jobs) and e2e-install.yml restore the rolling newest-of(`latest`,`next`) dsh resolution with the prerelease-aware node compare (not `sort -V`, which ranks an rc above the same-version stable), resolving the newest complete wave at run time with the other dist-tag as install fallback. The 0.2.2-rc.1 wave is complete on the registry (`dsh-plan-mode@0.2.2-rc.1` included), so the daily/weekly schedules are the rolling early-warning again. release.yml has no dsh closure install step and needs no change.

### Fixed
- **The Codemode preset instantiates again on the dsh 0.2.2-rc.1 host wave; codemode sessions survive their first prompt turn (fixes #8).** Two host-compat breaks sat in the preset's own patch rows:
  - The delegation group's `tool-subagent-list-agents` row mounted `@deepseek-ai/dsh-tool-subagent-control/list-agents`, a subpath the 0.2.2 control package removed from its `exports` map — importing it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, and the loader reports the whole preset `never started` (session creation refused). The row now mounts this package's own bridge subpath (`@aiwayds/dsh-subagent-registry/legacy-subagent-list-agents`): the bridge reads the installed control package's manifest through its `./package.json` export (defined on every supported generation) and imports the legacy sub-entry only where the exports map still defines it — pre-0.2.2 towers (0.2.0-rc.2 / 0.2.1-rc.x, whose main entry registers no discovery) keep the legacy mount, 0.2.2+ hosts mount nothing because the main entry's `apply(ctx)` now calls `registerListAgents` itself. The decision is synchronous manifest inspection: no removed subpath is ever imported on 0.2.2+, no module exception is caught, and a genuinely missing control package fails loud. Verified against published closures: 0.2.0-rc.2 and 0.2.1-rc.2 land exactly one `list_agents` registration through the real sub-entry; on 0.2.2-rc.1 the main entry owns the one registration and the bridge adds nothing.
  - The codemode persona suffix `Your working directory is {{cwd}}.` killed the first turn of every codemode session on every supported host generation: no generation registers a `cwd` prompt variable (the agent loop registers only `provider`/`model`, on 0.2.1-rc.x and 0.2.2+ alike) and strict prompt interpolation throws `unknown prompt variable` at assembly. The suffix is gone; the working directory still reaches the model through the `working-directory:current` runtime context (`dsh-working-directory`, `interpolate: false`) that the persona includes by default (`includeRuntimeContext: true`). No `{{cwd}}` reference remains in any patch value (guarded in `test/patch-ids.test.mjs`).
  - New guards: `test/patch-ids.test.mjs` rejects the removed upstream subpath mount and any `{{cwd}}` reference in patch values; `test/legacy-list-agents.test.mjs` pins the bridge contract (loader entry shape, probe outcomes against both published generations, the 0.2.2+ no-op path); `test/host-legacy-list-agents.test.mjs` rides the published-closure matrix (`npm run test:hosts -- host-legacy-list-agents`) proving the exactly-one `list_agents` registration on both pre-0.2.2 towers.

## [0.18.0] - 2026-11-04

### Added
- **`@aiwayds/dsh-ptc-subagent` and `@aiwayds/dsh-mini-subagent` merge into this registry** — the standalone ptc repo's entire source moves in under `src/ptc/` (the `codemode` runner tool, the jev decision binding, the session-scoped store binding, and the usage.jsonl accounting), and the mini repo ships as the `minimal-subagent` template. The retired packages keep their on-disk semantics: the usage sink stays `<dsh home>/storages/ptc-subagent`, the store event type stays `ptc-subagent/store-write`, and the four ptc test suites (jev-binding / runner / store-binding / usage-log, 34 tests) migrate verbatim with re-pointed imports.
- **The opt-in PTC capability behind `ptcEnabled`** (experimental, default off) — false registers nothing; true registers the `codemode` tool at standing scope (visible to the main agent and every dispatched subagent, as in the standalone plugin) on the next plugin mount. The key is deliberately non-volatile: flipping it remounts the plugin, which is exactly the register/unregister act. The six migrated jev keys (`jevEnabled` / `jevBackend` / `jevModel` / `jevTimeoutMs` / `jevSecretFile` / `storageDir`) are volatile and hot-reload per call, defaults unchanged from the ptc repo (jev OFF, zen backend, 3000 ms). The runner's missing-runtime guard stays at call time (no static `ptcRuntime` inject — a host without the PTC runtime line keeps mounting fine with the gate off). `@aiwayds/dsh-jev-core` ^0.1.5 rides `dependencies` (a plain npm library, not a host peer); `@deepseek-ai/dsh-ptc-runtime` joins the optional peer list with the same dual-rc range.
- **The `/registry-config` slash command** (the registry's first) — a management wizard over `ctx.commands.register` whose handler asks two multi-select questions through `ctx.userQuestions.ask` (scoped to the invocation's live agent, signal passed through): ① check the agents to disable (the checked set becomes the new `disabledAgents`; currently disabled names must stay checked), ② check the opt-in agents to install (both experimental, default off — marked as such in the wizard texts). Persisting goes through `settings.mutate` on the plugin's own entry config (`dsh-subagent-registry` namespace) using the dsh-tui describe → mutate(revision) → one-conflict-retry spell. On a headless deployment the ask rejects with NO_PROVIDER and the command degrades to a CommandResult error carrying the manual configuration recipe (the `disabledAgents` / `ptcEnabled` keys plus the template copy path). Command and wizard texts follow the configured `language` via the packaged `locale/{zh,en,ru}.json`.
- **The `disabledAgents` roster toggle** (volatile, default `[]`) — agent names excluded from the `use_agent` AND `ask_agent` rosters, covering the whole roster including user-defined agents. A pure configuration filter: **no agent file is ever touched**. Three filter points: the roster built into both tool descriptions, an execute-time re-check against the live value (a model hard-naming a disabled agent is refused with a pointer to `/registry-config`), and the follow-up tool's name list + execute guard. A volatile write hot-swaps, and the roster refresh (shared seam with the web panel) applies it to subsequent model requests immediately.
- **Opt-in agent templates** (both agents experimental, default off, marked in their `description`) — `templates/opt-in-agents/{en,zh,ru}/{ptc-subagent,minimal-subagent}.md`, kept separate from `templates/agents/` so the first-install seeding still plants only the trio (workhorse / oldfox / rubber-duck). Installing copies the template verbatim under its frontmatter name; an existing file is never overwritten and there is no delete path. Selecting `ptc-subagent` in the wizard links `ptcEnabled: true`; unselecting links the reverse (false + parked in `disabledAgents`, file kept).
- **Agent-preset guard rows migrate into this package's cordis.patch.yml** (`agent-preset-registry` with `default: native` / `subagent-model-selection-settings` / `preset-native` / `preset-codemode`, including the specialist persona and the inert `mode: ptc` presentation row) — with a duplicate-id audit confirming the merged file's top-level insert ids stay unique (`dsh-ptc-subagent` / `dsh-mini-subagent` mount rows do NOT come back; their payloads live inside this plugin now).
- **CONTEXT.md** — the merged repo's vocabulary: subagent, roster, opt-in agent, disabledAgents, ptcEnabled, the codemode runner/preset disambiguation, bindings, structured failure, usage sink, standing scope (adapted from the ptc repo's glossary).
- **README/README.en sections** for the /registry-config command, the opt-in agents, the ptc capability and the toggle semantics; the shipped-agents section now documents the "seed trio + two opt-ins" split; docs/AGENT-FORMAT.md gains the `disabledAgents` / `ptcEnabled` rows with the "disable semantics live in the config key, not the frontmatter" note; the bundled skill (SKILL.md / SKILL.en.md / SKILL.ru.md) gains the command, toggle and ptc sections with the routing descriptions moved byte-identically on both sides of the anti-drift contract.

### Changed
- Switch license from MIT to Apache-2.0

## [0.17.0] - 2026-11-01

### Added
- **`language` config key (`zh` / `en` / `ru`, default `zh`)** — switches the plugin's user-facing language across four surfaces at once: the web preset-management panel texts (delivered to the client in the `list` reply), the model-facing skill routing description, the bundled skill body (`SKILL.md` / `SKILL.en.md` / `SKILL.ru.md`), and the agent templates seeded on first install (`templates/agents/<language>/`). Existing agent files are never rewritten; the sidebar panel label stays on the compiled default.
- **English and Russian editions of the bundled skill and shipped agents** (Russian wording contributed by @pahuss1984, PR #7) — skill bodies and the three default agent templates (workhorse / oldfox / rubber-duck) now exist in all three languages, and the bundled skill gains a "switch the plugin language" section (in each language) documenting the key, its effect scope and how to migrate existing agent files.
- **Per-language drift tests** — each routing description must equal the frontmatter of its matching SKILL file byte-for-byte and stay within the 500-char budget; client tests cover language delivery through the `list` reply and Russian panel rendering.

## [0.16.0] - 2026-11-01

### Reverted
- **PR #7's wholesale default-language switch to Russian** — merging the translation changed the default web panel text, the bundled skill (including the model-facing routing description) and the shipped agent personas from Chinese to Russian for every user, which is not the intended product direction. The complete translation, including the maintainer review fix-ups (routing-description budget trim, chip-label test alignment, regenerated `lib/` artifacts), is preserved on the `i18n/ru` branch and may land behind an opt-in locale mechanism instead of a default swap.

## [0.14.1] - 2026-10-19

### Changed
- **Foreground namespace label shortened to `[fg] `** — the managed-foreground prefix written into the child's durable label drops from `[use_agent foreground] ` to `[fg] `, so the running-agent line on every surface (tui-pi, web) stops spending 18 columns on an internal marker. Resume matching (`pickLatestLabeledChild`) and the `maxRounds` label resolution still recognize the v0.14.0 long form, so pre-upgrade interrupted children remain resumable with their per-agent caps.

## [0.14.0] - 2026-10-18

### Added
- **Dual-host dispatch across the two supported RC lines** (contributed by @caiqy, PR #6) — one compiled package dispatches through public APIs on both DSH `0.2.0-rc.2` (`start` / `startContinuable`) and the `0.2.1` line (`startActivation` with `caller` / `parent` delivery), selected by feature detection with no version-number branches; a failed accepted call never retries through the other API. On the 0.2.1 line the start request no longer carries `persona`/`toolFilter` (upstream moved child composition to presets), so the plugin reserves the child's durable id, parks the composition, and installs it on the child's own agent scope at the `subagent/start` edge — the same window, persona section name and leaf restriction the host's own composition uses — matching the 0.2.0-line request-field semantics (maintainer review-fixup: the original contribution targeted `0.2.1-alpha.2` request shapes; re-based onto `0.2.1-rc.2`, the ecosystem wave line). Foreground resume stays fail-loud: a selected session that fails to inspect or resume errors out, and only an explicit `fresh: true` restarts.
- **Role-aware delegation guidance** (contributed by @caiqy, PR #6) — when this plugin's dispatch tool is visible in the assembling scope, a concise English guidance block replaces the host's generated delegation paragraph: pick a matching roster role with a self-contained prompt, batch independent calls, keep foreground waits for dependent steps, and use `subagent_fork` only when inheriting the conversation is necessary. Unloading (or hiding/shadowing the tool) restores the host's stock text; scoped-tool and shadowed-definition edges are covered by tests.
- **Web subagent preset management panel** (contributed by @caiqy, PR #6) — a left-sidebar workspace page over the configured `agentsDir`: create, copy, edit, complete-source repair and delete agent presets with atomic file operations (synced temp file + exclusive replacement), external-revision rejection, draft retention across failed saves and discard confirmations, and live roster refresh that never disturbs running children. The bundled client entry (`dsh.client` manifest, esbuild-built factory) mounts through the host ModuleLoader with the host's UI singletons kept as `require()` edges.
- **Real-host regression matrix** (contributed by @caiqy, PR #6; closure legs re-targeted to the RC line by the maintainer) — `pnpm test:hosts` loads the same compiled plugin into two published SDK closures (`0.2.0-rc.2` and `0.2.1-rc.2`, per-package versions asserted) and exercises activation dispatch, lifecycle joins and descendant drains, guidance replacement, presets over a real web server and connection, and fail-loud resume end-to-end with only the model scripted.

### Changed
- **Optional peer ranges re-expressed on the RC line** — every `@deepseek-ai/dsh-*` peer is now `>=0.2.0-rc.2 || >=0.2.1-rc.1` (the original PR's `>=0.2.1-alpha.2` OR-clause did not constitute a support promise; alpha is not a supported line); `@deepseek-ai/schemastery` stays `~3.18.4`. devDependencies pin the `0.2.1-rc.2` closure (`cordis` `~4.0.5`), and build/check run against it (maintainer review-fixup).
- **`pnpm-lock.yaml` regenerated in sync with `package.json`** — the original PR shipped a stale lockfile and could not pass `pnpm install --frozen-lockfile` (maintainer review-fixup).
- **`package.json` version field reverted to the pre-PR value** — releases stamp the version at publish time (the changelog leads); the field had been bumped to an already-published number (maintainer review-fixup).
- **CI restores the rolling newest-of(latest,next) closure selection** — the 2026-10-17 pin to `latest` (set when the 0.2.1-rc.1 wave dropped `start`/`startContinuable` from the runtime types) is reverted as part of this migration; both jobs resolve the rolling RC/stable line at runtime again, comparing dist-tags with a prerelease-aware node comparison (never `sort -V`, which ranks `0.2.1-rc.2` above `0.2.1`).
- **Support policy wording returns to the repo's original stance** across READMEs, AGENT-FORMAT and the bundled skill: the RC/stable line is supported and the alpha line is not, with compatibility validated through `0.2.0-rc.2` and `0.2.1-rc.2` (maintainer review-fixup).

## [0.13.2] - 2026-10-14

### Added
- **Podman install-integration e2e suite** (`e2e/podman-install/`, plus the weekly `e2e-install.yml` cron) — inside a container (Ubuntu 24.04 + Node 22 + a real dsh CLI), installs the **published** tarballs of this plugin, dsh-dcp, dsh-cron, dsh-llm-proxy, and dsh-profile-switch through a real npm client with dependency lifecycle scripts on — the exact intersection that let the packaged-`postinstall` breakage (#2) ship unnoticed — then asserts the closure linker stands down in the consumer tree, the real host composes and boots each profile, and dcp's schema-default + explicit-empty semantics survive the real config layer. Versions resolve from the official registry at run time (never hardcoded), with prerelease-aware host-version comparison. Test infrastructure only; no product changes.

### Docs
- **SKILL gains an integration & usage debug section** — a three-step health check grounded in real seams: installed (`dsh plugin --profile <name> list`, the CLI forwards verbatim to pnpm in the profile directory), mounted (`dsh dump-config --profile <name>` or grepping the profile's `cordis.patch.yml` for the insert block), wired (preset agents seeded into `~/.dsh/agents/`, `use_agent`/`ask_agent` in the model's tool list with the roster, the bundled skill routable), plus usage evidence (`/history` round cards, or counting `use_agent` in a session's `session.v3.jsonl.zstd` via `zstdcat`) and a symptom→breakpoint table that includes the alpha-line `ctx.subagents.start is not a function` failure (host floor stays RC/stable ≥0.2.0-rc.2; alpha unsupported). The `leafDenyTools` rows now describe the shipped semantics — the empty default is the static enumeration intersected with the host's registered tools, an explicit list passes through verbatim (the wording had lagged 534e74e). Routing description extended with the debug triggers; the SKILL.md frontmatter and the hardcoded `SKILL_DESCRIPTION` moved byte-identically, still within the 500-char budget.

## [0.13.1] - 2026-10-12

### Fixed
- **The published tarball is npm-installable again** — `postinstall` runs `node scripts/link-dsh-closure.mjs`, but the `files` allow-list never shipped `scripts/`, so every non-link install of 0.12.0+ (plugin manager, plain `npm install`) died in the lifecycle step with `MODULE_NOT_FOUND` (fan56/dsh-subagent-registry#2). `scripts/` now ships. The linker's stand-down guard was also swapped from "no `src/`" — a marker the tarball actually *does* ship, so the old check would have let the linker run in a consumer tree — to two markers the `files` list never carries (`tsconfig.json`, `.git`). New `test/packaged-install.test.mjs` runs the reported failing step end-to-end: pack, inspect the tarball, `npm install` the tarball with lifecycle scripts on, and assert the linker stood down in the consumer tree. The boot smoke's scratch-profile install also moved from pnpm to npm — pnpm ≥10's default dependency-lifecycle block is exactly how this breakage stayed invisible to the previous gate, so the real-host gate now exercises the same consumer path (with a new assertion that the linker stood down there too).

### Docs
- **The `@deepseek-ai/*` optional-peer contract is now written down** — the `link-dsh-closure.mjs` header said the closure packages "must stay *undeclared*", which contradicts the optional peerDependencies actually present in `package.json` and confused a consumer (fan56/dsh-subagent-registry#1). Replaced with the actual two-layer contract: optional peers = release semantics for consumers (never auto-installed, so they cannot shadow the host's bundled closure — the hard-dependency hard-pin is the failure mode that does); the closure symlink = dev typecheck (one `@deepseek-ai/cordis` in the type graph, keeping the cordis `declare module` augmentation intact). Also fixed a `dsh-tui-pi` copy-over in the same header and a stale "not resolvable from npm" claim. README/README.en gained a dev-section note with the maintenance rule: keep the entries optional peers, never move them to dependencies/devDependencies, never drop `optional: true` (a non-optional peer auto-installs under pnpm's `auto-install-peers` and the second-copy breakage returns).

## [0.13.0] - 2026-09-29

### Fixed
- **Leaf deny list is now intersected with the host's registered global tools** — the stock default names are a static enumeration over a distribution that moves: dsh 0.1.7-rc.1 stopped registering `dsh-tool-ralph` while `tools.restrict()` became fail-fast on unknown names, so every leaf (`deep: 0`) dispatch aborted before the child even started (`Error: tools.restrict() names unknown global tool "ralph"`). The default list is now filtered through `ctx.tools.view().restrictableNames` at tool-registration time (read defensively; an unavailable view degrades to the pre-0.1.7 verbatim pass). An explicit `leafDenyTools` override is NOT intersected — the caller owns that list and the host's strict validation is the right feedback. Surfaced by the dsh-tui-pi podman e2e hard-stop ladder (zero `hs-loop` mock phases).

### Changed
- **raise dsh host floor to 0.2.0-rc.2** — dev pins exact `0.2.0-rc.2`, peer floors `>=0.2.0-rc.2` (READMEs follow). No code changes: the `dsh-subagent` type surface is unchanged in 0.2.0 (test chain 11/11 files green — 113 assertion PASS + 4 node:test, fail 0; `tsc --noEmit` and a fresh `tsc -p` build show zero drift against the 0.2.0-rc.2 closure).

## [0.12.0] - 2026-09-24

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
