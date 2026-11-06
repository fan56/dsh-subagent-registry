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
import type { Context } from '@deepseek-ai/cordis';
/** The `agent-preset-registry` service row: default preset = native. */
export declare const AGENT_PRESET_REGISTRY_ROW: Readonly<{
    id: "agent-preset-registry";
    name: "@deepseek-ai/dsh-agent-preset-registry";
    config: Readonly<{
        default: "native";
    }>;
}>;
/** The host-scope service the official preset's `modelSelection: true` rows require. */
export declare const SUBAGENT_MODEL_SELECTION_ROW: Readonly<{
    id: "subagent-model-selection-settings";
    name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings";
}>;
/** Both rows, in mount order. Plain data — the loader imports the modules. */
export declare const PRESET_SUPPORT_ROWS: readonly (Readonly<{
    id: "agent-preset-registry";
    name: "@deepseek-ai/dsh-agent-preset-registry";
    config: Readonly<{
        default: "native";
    }>;
}> | Readonly<{
    id: "subagent-model-selection-settings";
    name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings";
}>)[];
/**
 * Mount the two support rows on the include tree when it does not already
 * carry them. Registers one disposal effect: the teardown awaits the pending
 * creates and removes exactly the rows still carrying OUR options object, so
 * a row claimed meanwhile by a patch layer (reload introducing a same-id
 * insert) is left to its new owner. Failures to mount are logged and
 * swallowed — a support-layer gap must not take the plugin (and with it
 * `use_agent`) down.
 */
export declare function mountPresetSupportRows(ctx: Context): void;
