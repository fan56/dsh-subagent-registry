/**
 * Postinstall linker: point every `node_modules/@deepseek-ai/*` entry at the
 * global dsh closure.
 *
 * Why this exists: dsh-subagent-registry is a plugin that runs *inside* the
 * installed dsh CLI, and its source imports the `@deepseek-ai/*` packages
 * (cordis, dsh-subagent, dsh-llm, schemastery, …). Typechecking must line up
 * with the exact copies the host bundles — not whatever a fresh npm install
 * would pull today — so the repo resolves them from the *global dsh closure* —
 * `$(realpath $(which dsh))/node_modules/@deepseek-ai` — via plain symlinks.
 *
 * The contract: ALL `@deepseek-ai/*` resolve to that single closure instance,
 * so there is exactly one `@deepseek-ai/cordis` in the type graph.
 *
 * Relationship to package.json: the `@deepseek-ai/*` entries there are
 * OPTIONAL peerDependencies — release semantics for consumers ("expect the
 * host's copies, >=0.2.0-rc.2 || >=0.2.1-alpha.2"), not install specs. Optional peers are
 * never auto-installed (pnpm's auto-install-peers and npm's peer auto-install
 * both skip them), so they cannot materialize a second local copy in `.pnpm`.
 * That second copy is exactly what a hard dependency used to create, breaking
 * the cordis `declare module` augmentation (`Property 'settings' does not
 * exist on type 'Context'`) — which is why these packages moved to optional
 * peers (3a7c245, then 085ca03 marked them optional). Keep them optional
 * peers for consumers: never add hard dependencies, and never drop
 * the `optional: true` — a non-optional peer gets auto-installed under
 * pnpm's auto-install-peers and the second-copy breakage returns.
 *
 * pnpm still treats the closure links as extraneous — and, as it prunes
 * entries it once managed, the links can disappear after an install. This
 * script re-creates them on every `pnpm install` (postinstall).
 *
 * It is a no-op (exit 0) when no global dsh install is found — a dev machine
 * without dsh simply cannot typecheck against dsh types.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
// Guard: this postinstall is a dev-machine convenience for THIS repo. The
// published tarball ships scripts/ (the hook must resolve), but the linker
// must never touch a consumer's node_modules there — it would delete their
// @deepseek-ai packages and replace them with symlinks into their global dsh
// closure. pnpm ≥10 blocks dependency lifecycle scripts by default, but npm
// would run this — exit silently outside the repo. The repo markers must be
// things the files allow-list never ships (checked against the 0.13.0
// tarball): tsconfig.json (dev typecheck input) and .git.
if (!existsSync(join(repoRoot, 'tsconfig.json')) || !existsSync(join(repoRoot, '.git'))) {
  process.exit(0)
}
const scopeDir = join(repoRoot, 'node_modules', '@deepseek-ai')

/** The global dsh package's own `node_modules/@deepseek-ai` closure dir. */
function findDshClosure() {
  // 0) Explicit override for dev/typecheck against an unreleased dsh line,
  //    e.g. a scratch closure from: npm i --prefix ~/tmp/dsh-alpha-closure @deepseek-ai/dsh@alpha
  //    DSH_CLOSURE_DIR=~/tmp/dsh-alpha-closure/node_modules/@deepseek-ai node scripts/link-dsh-closure.mjs
  const override = process.env.DSH_CLOSURE_DIR
  if (override !== undefined && override !== "") {
    const dir = realpathSync(override)
    if (existsSync(join(dir, "cordis"))) return dir
    console.warn(`[link-dsh-closure] DSH_CLOSURE_DIR=${override} lacks @deepseek-ai/cordis — ignoring override`)
  }
  // 1) Follow the `dsh` bin — the most faithful pointer to the installed CLI
  //    (`/opt/homebrew/bin/dsh` → …/lib/bin.js → pkg dir → its node_modules).
  try {
    const bin = execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim()
    if (bin !== '') {
      const real = realpathSync(bin)
      const closure = join(dirname(dirname(real)), 'node_modules', '@deepseek-ai')
      if (existsSync(join(closure, 'cordis'))) return closure
    }
  } catch { /* dsh not on PATH */ }
  // 2) Fall back to the global node_modules root — the dsh package's own
  //    nested closure (what current npm produces for a global install).
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    const nested = join(root, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai')
    if (existsSync(join(nested, 'cordis'))) return nested
    // 3) Last resort: npm's flat global layout, where dsh's @deepseek-ai/*
    //    deps are hoisted straight into <npm root -g>/@deepseek-ai next to
    //    the dsh package itself.
    const flat = join(root, '@deepseek-ai')
    if (existsSync(join(flat, 'cordis'))) return flat
  } catch { /* npm unavailable */ }
  return undefined
}

const closure = findDshClosure()
if (closure === undefined) {
  console.warn('[link-dsh-closure] global dsh not found — skipping @deepseek-ai links (dev without dsh)')
  process.exit(0)
}

mkdirSync(scopeDir, { recursive: true })
let linked = 0
for (const name of readdirSync(closure)) {
  const target = join(scopeDir, name)
  const source = join(closure, name)
  try {
    // Replace any existing entry (stale symlink, or a local .pnpm copy a
    // previous install created) with the closure link.
    rmSync(target, { recursive: true, force: true })
    symlinkSync(source, target, 'junction')
    linked++
  } catch (error) {
    console.warn(`[link-dsh-closure] failed to link ${name}: ${(error instanceof Error ? error.message : String(error))}`)
  }
}
console.log(`[link-dsh-closure] linked ${linked} @deepseek-ai/* packages from ${closure}`)
