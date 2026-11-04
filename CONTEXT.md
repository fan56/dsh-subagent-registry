# dsh-subagent-registry

The shared language for the merged subagent registry: locally-defined agent
files become callable subagents, the `/subagents` command manages them, and
the opt-in codemode toolchain runs batch decision programs. Created in 0.18.0
when `@aiwayds/dsh-ptc-subagent` and `@aiwayds/dsh-mini-subagent` merged into
this package.

## Language

**Subagent**:
A real dsh subagent (full session, persistence, continuable) started through
the stock `spawn` provider, carrying an agent file's body as its persona.
_Avoid_: worker, child process, bot

**Agent file**:
One `<agentsDir>/<name>.md` — a loose frontmatter block plus a markdown body
used verbatim as the persona. The only user-owned artifact of this package:
every feature filters, copies or reads it, none rewrites it.
_Avoid_: preset (ambiguous with the host's agent presets), config

**Roster**:
The agent-name list rendered into the `use_agent`/`ask_agent` tool
descriptions, rebuilt from the agents dir at definition time and refreshed on
file changes, language changes and toggle writes.
_Avoid_: registry (the package name), catalog (the host's durable subagent catalog)

**Opt-in agent**:
One of the two agent definitions shipped under `templates/opt-in-agents/`
(`ptc-subagent`, `minimal-subagent`) that are NEVER seeded — the first-install
seed plants only the trio (workhorse / oldfox / rubber-duck). Installation is
a one-time verbatim copy: an existing file is never overwritten, and nothing
ever deletes one.
_Avoid_: preset agent, default agent, bundled agent (the trio is the bundled set)

**disabledAgents**:
The volatile config key holding the roster toggle: agent names excluded from
both tool rosters, with an execute-time re-check refusing hard-named calls.
A pure roster filter — disable semantics live in this config key, never in
frontmatter, and the files stay untouched. The `/subagents` wizard writes it;
a volatile write hot-applies through the roster refresh.
_Avoid_: blocklist (implies more than roster visibility), enable flag (the list IS the toggle)

**ptcEnabled**:
The non-volatile gate for the codemode tool: false (default) registers
nothing; true registers the tool at standing scope on the next plugin mount —
the remount IS the register/unregister act, which is why the key is not
volatile.
_Avoid_: codemode switch (that reads as the jev master switch), ptc mode

**Codemode (tool)**:
The plugin's runner tool: executes one model-written async TypeScript program
against the jev and store bindings over the host's PTC runtime seam.
_Avoid_: code mode (the host's `mode: 'code'` collapse), run_code (the host's own transport), PTC runner (unqualified)

**Codemode (preset)**:
The agent preset composing the specialist persona, the official PTC preset
rows, and PTC-mode presentation; the future vehicle for a full-PTC-face
agent, inert until upstream fixes preset-scoped `presentAs`. The tool itself
is NOT gated on it — only on `ptcEnabled`.
_Avoid_: ptc preset (ambiguous with the official one), subagent preset

**Binding**:
One host-side async function group the runtime injects into a program's
namespace; the unit the runtime bridges across its serialization boundary.
_Avoid_: plugin API, tool (tools are the registry's separate face)

**jev (binding)**:
The decision backend binding: `classify` (one batched call, N atomic
questions) and `isConfigured`; a 1:1 passthrough to `@aiwayds/dsh-jev-core`
with structured failures instead of rejections.
_Avoid_: classifier (the backend is the judger, the binding is the seam), decision API

**Question (jev)**:
One atomic judgment inside a classify call, typed choice, score, or noul; the
batch is the wire unit, so programs pack every question about a state into
one call.
_Avoid_: prompt, query

**store (binding)**:
The session-scoped key/value binding: `store(key, value)` / `load(key)`,
backed by session-log events, quota-guarded.
_Avoid_: memory, cache, KV

**Branch state**:
The store's replay of the session log: a branch's log is its path, so fork
children see pre-fork history and never sibling writes; the reason the store
needs no storage domain.
_Avoid_: branch view, per-branch copy

**Structured failure**:
The binding contract of resolving `{error, message}` results instead of
rejecting, so a failed decision or write is data the program can branch on
and self-correct from.
_Avoid_: soft failure, fail-open (that is the disabled/no-key policy, not the shape)

**Usage sink**:
The whitelisted `usage.jsonl` telemetry for every jev call, including
failures; metadata and token counts only. Kept at
`<dsh home>/storages/ptc-subagent` through the merge, so the standalone
plugin's history carries over.
_Avoid_: decision log (the family name for a richer two-layer log this plugin does not need), audit log

**Specialist persona**:
The codemode preset's prefix prompt (and the `ptc-subagent` opt-in template's
body) that scopes the agent to batch work — fan-out patterns, question
shapes, quotas, self-correction — instead of general coding.
_Avoid_: system prompt (the deployment-wide one), instructions

**Main agent**:
The root session agent on its native face; discovers batch scenarios and
either runs small ones directly or dispatches a specialist — it never becomes
a PTC face itself.
_Avoid_: root agent, orchestrator

**ptc-subagent (dispatched)**:
The registry-dispatched specialist (`templates/opt-in-agents/*/ptc-subagent.md`):
joins the session composition, sees the codemode tool, runs the batch in its
own session, returns only the aggregate.
_Avoid_: codemode preset (that is the session-level artifact), worker

**Standing scope**:
The profile's ambient composition every agent shares; where the plugin mounts
so main and dispatched agents both see the codemode tool once `ptcEnabled`
registers it.
_Avoid_: global scope, default preset
