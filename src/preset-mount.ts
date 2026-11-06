/**
 * Runtime mount of the agent-preset support rows (issue #9).
 *
 * Through 0.19.0 the bundle patch declared the two SERVICE rows statically:
 * `agent-preset-registry` (`default: native`) and
 * `subagent-model-selection-settings`. That breaks every profile that also
 * selects @deepseek-ai/dsh-web-app, which inserts rows with the SAME ids:
 * a same-id insert from a later patch layer silently REPLACES the earlier
 * row wholesale (cordis merges entries by id, last writer wins — verified
 * against the 0.2.2-rc.1 loader, `EntryGroup.update`'s id map). Two
 * consequences, both observed in the #9 web-profile incident:
 *
 * 1. the merged `agent-preset-registry` entry carries OUR `default: native`,
 *    flipping the web profile's default preset away from `standard`; and
 * 2. the plugin manager's `bundle-in-use` check matches any live entry whose
 *    id AND name appear in this bundle's patch file — the web-app's live
 *    preset service matches forever, so `dsh plugin remove` of this package
 *    can never succeed while the web-app is selected.
 *
 * No patch-level expression can fix this: `!!js` evaluates only `config`
 * values and the per-entry `disabled` flag (an insert is a raw list append),
 * and `disabled: true` on a colliding row would disable the SHARED entry —
 * taking the web profile's preset service down entirely. The rows therefore
 * leave the static patch and mount at runtime instead, on the include tree:
 *
 * - WHEN: at plugin apply, and only when the tree has no same-id entry. The
 *   check is race-free for the initial composition because the loader
 *   assigns every entry its `store` slot synchronously for the whole batch
 *   before any plugin `apply` runs (`Promise.all` over creates, each store
 *   write preceding its first `await`), so by the time this code executes
 *   the web-app's rows are already visible if they exist.
 * - WHERE: the include tree — the tree whose owning include entry mounts the
 *   profile's composed rows. The host's config editor and the settings UI
 *   only address entries of THAT tree (they filter on
 *   `entry.parent.tree.ctx.fiber.entry?.id === 'include'`), so mounting the
 *   rows in a `ctx.plugin` subtree instead would make the
 *   `agent-preset-registry` / `subagent-model-selection-settings` settings
 *   namespaces unwritable on tui/desktop.
 * - UNTIL: our fiber's dispose. The teardown removes only rows this mount
 *   still owns (options identity — a row a later patch layer has replaced
 *   belongs to that layer, not to us), so uninstall/update paths leave no
 *   zombie entries. The include persists runtime creates into the profile
 *   root config (`cordis.yml`) and the removal through the same journal, so
 *   the file tracks the mount's lifetime; the rows' module names resolve
 *   through the host closure regardless of whether this package stays
 *   installed, so even a crash-stranded row cannot break a later boot.
 *
 * Deliberately silent no-op when the tree is unreachable (bare `ctx.plugin`
 * mounting in unit tests and embedded hosts): those contexts have no include
 * tree and no settings surface, so there is nothing to mount.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The `agent-preset-registry` service row: default preset = native. */
export const AGENT_PRESET_REGISTRY_ROW = Object.freeze({
  id: 'agent-preset-registry',
  name: '@deepseek-ai/dsh-agent-preset-registry',
  config: Object.freeze({ default: 'native' }),
})

/** The host-scope service the official preset's `modelSelection: true` rows require. */
export const SUBAGENT_MODEL_SELECTION_ROW = Object.freeze({
  id: 'subagent-model-selection-settings',
  name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings',
})

/** Both rows, in mount order. Plain data — the loader imports the modules. */
export const PRESET_SUPPORT_ROWS = Object.freeze([AGENT_PRESET_REGISTRY_ROW, SUBAGENT_MODEL_SELECTION_ROW])

/** Structural view of the pieces of a loader tree entry this module touches. */
interface TreeEntryShadow {
  options: Record<string, unknown>
}

/**
 * Structural view of the include tree (cordis-plugin-include's `EntryTree`).
 * `create` inserts a root-level entry and returns its id; `remove` stops and
 * unlinks one; `store` indexes live entries by id. Typed structurally on
 * purpose: the host closure's types are not a dependency of this package
 * (see the type-import note in src/index.ts), and the access is guarded.
 */
interface IncludeTreeShadow {
  store: Record<string, TreeEntryShadow | undefined>
  create(options: Record<string, unknown>): Promise<string>
  remove(id: string): void
  /** The tree's root entry group — the parent of rows `create` inserts at root level. */
  root: unknown
  /** Journal a tree change (no-op on trees without root-config persistence). */
  commit(change: { id: string; group: unknown; legacy: Record<string, unknown> }): void
  /** Await the persisted state; present only on trees that journal into the root config. */
  flush?(): Promise<void>
}

/**
 * Walk from the running plugin's context to its owning include tree:
 * `ctx.fiber.entry` is this plugin's loader entry, `entry.parent` the root
 * group it was mounted in, `group.tree` the tree that owns both. Undefined
 * whenever the plugin did not mount as a tree entry (bare `ctx.plugin`,
 * embedded hosts) — the caller treats that as "nothing to do".
 */
function includeTreeOf(ctx: Context): IncludeTreeShadow | undefined {
  type FiberWithEntry = { entry?: { parent?: { tree?: unknown } } }
  const fiber = ctx.fiber as FiberWithEntry | undefined
  const tree = fiber?.entry?.parent?.tree as IncludeTreeShadow | undefined
  if (!tree || typeof tree.create !== 'function' || typeof tree.remove !== 'function' || !tree.store) return undefined
  return tree
}

/**
 * Mount the two support rows on the include tree when it does not already
 * carry them. Registers one disposal effect: the teardown awaits the pending
 * creates and removes exactly the rows still carrying OUR options object, so
 * a row claimed meanwhile by a patch layer (reload introducing a same-id
 * insert) is left to its new owner. Failures to mount are logged and
 * swallowed — a support-layer gap must not take the plugin (and with it
 * `use_agent`) down.
 */
export function mountPresetSupportRows(ctx: Context): void {
  const tree = includeTreeOf(ctx)
  if (!tree) return
  const pending: Map<string, Promise<Record<string, unknown> | undefined>> = new Map()
  for (const row of PRESET_SUPPORT_ROWS) {
    if (tree.store[row.id] !== undefined) continue
    const options = structuredClone(row) as Record<string, unknown>
    pending.set(
      row.id,
      tree.create(options).then(() => options).catch((error: unknown) => {
        ctx.logger.warn(`dsh-subagent-registry: failed to mount preset support row ${row.id}: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }),
    )
  }
  if (pending.size === 0) return
  // The creates run detached from apply (apply itself stays synchronous); the
  // effect only registers the teardown. Cordis runs each disposer at most
  // once, so consuming `pending` here needs no extra idempotence guard.
  //
  // Disposal races the include's own stop() — the fiber's disposables run
  // CONCURRENTLY (cordis `Promise.all`s them), and the include's stop() both
  // flushes the journal and unlinks every remaining entry (store first, so a
  // late `remove` finds nothing). Two consequences this teardown must cover:
  // an entry already unlinked by the host still needs its persisted create
  // cancelled (journal a remove through `tree.commit`), and the journal's
  // writes are asynchronous while process shutdown force-exits as soon as the
  // disposers settle — the final `flush` is what makes the removals land in
  // the root config before that exit.
  ctx.effect(() => async () => {
    for (const [id, promise] of pending) {
      const options = await promise
      if (options === undefined) continue // create failed — nothing was mounted
      const entry = tree.store[id]
      if (entry && entry.options !== options) continue // claimed by another layer — leave it
      try {
        if (entry) {
          tree.remove(id)
        } else {
          // the host's root.stop() already unlinked the entry; still cancel
          // the journaled create so the row does not persist in the root config
          tree.commit({ id, group: tree.root, legacy: options })
        }
      } catch (error) {
        ctx.logger.warn(`dsh-subagent-registry: failed to unmount preset support row ${id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    try {
      await tree.flush?.()
    } catch (error) {
      ctx.logger.warn(`dsh-subagent-registry: failed to persist preset-support teardown: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, 'dsh-subagent-registry:preset-support')
}
