var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
/**
 * Host-generation bridge for the `list_agents` tool mount (fixes #8).
 *
 * The codemode preset's delegation group mounts the subagent discovery tool
 * next to the shared control plugin. Upstream moved that registration between
 * host generations:
 *
 * - `@deepseek-ai/dsh-tool-subagent-control` 0.2.0-rc.2 … 0.2.1-rc.x exports a
 *   separate `./list-agents` sub-entry and its main entry does NOT register
 *   discovery — the mount row is required there.
 * - 0.2.2+ removed the subpath from the package `exports` map (importing it
 *   throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, which failed the whole codemode
 *   preset with `never started`), and the main entry's `apply(ctx)` now calls
 *   `registerListAgents(ctx)` as its first statement — the row must NOT
 *   mount anything there, or `list_agents` would register twice.
 *
 * The patch row therefore mounts THIS module instead of the upstream subpath:
 * it decides by inspecting the installed control package's own `exports` map —
 * the exact artifact upstream changed — and only imports the legacy sub-entry
 * when the map still defines it. The decision is synchronous and capability
 * based (the same pattern as `host-compat.ts`): resolution goes through the
 * main entry, which every generation exports because the same delegation
 * group mounts it unconditionally, so no removed subpath is ever touched and
 * no module exception is caught — a profile that lacks the control package
 * fails loud, as it should.
 *
 * @module dsh-subagent-registry/legacy-subagent-list-agents
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** Cordis plugin name — kept identical to the legacy sub-entry's own name so loader logs stay recognizable. */
export const name = 'tool-subagent-list-agents';
/** Same service seam the legacy sub-entry declared (its `inject` export). */
export const inject = ['tools', 'subagents', 'agents'];
/** The control package whose exports map decides the mount behavior. */
const CONTROL_PACKAGE = '@deepseek-ai/dsh-tool-subagent-control';
/** The legacy subpath: exported on pre-0.2.2 hosts, absent from 0.2.2+. */
const LEGACY_SUBPATH = './list-agents';
/**
 * Read one control package manifest and report whether it still exports the
 * legacy `./list-agents` sub-entry. Pure manifest inspection: no import is
 * attempted, so a negative answer never reaches `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
export function controlPackageExportsListAgents(packageDir) {
    const manifestPath = join(packageDir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return manifest.exports?.[LEGACY_SUBPATH] !== undefined;
}
/**
 * Read the INSTALLED control package's manifest and report whether it still
 * exports the legacy `./list-agents` sub-entry. Resolution goes through the
 * `./package.json` export (defined on every generation this plugin supports:
 * 0.2.0-rc.2, 0.2.1-rc.x, 0.2.2-rc.1) as a JSON module import — the same
 * resolution root the legacy sub-entry import below will use, so probe and
 * import always answer for the same package. A missing or mis-exported
 * manifest fails loud; nothing is caught here.
 */
async function installedControlPackageExportsListAgents() {
    const specifier = `${CONTROL_PACKAGE}/package.json`;
    const manifestModule = await import(__rewriteRelativeImportExtension(specifier), { with: { type: 'json' } });
    const manifest = manifestModule.default;
    return manifest.exports?.[LEGACY_SUBPATH] !== undefined;
}
/**
 * Mount the legacy `./list-agents` sub-entry on hosts that still need it, and
 * mount nothing on hosts whose main entry registers discovery itself. Either
 * way `list_agents` registers exactly once: through the upstream sub-entry's
 * own `apply` (pre-0.2.2), or through the control plugin mounted one row up
 * (0.2.2+, where this bridge is a deliberate no-op).
 */
export async function apply(ctx) {
    if (!(await installedControlPackageExportsListAgents()))
        return;
    // Composed at runtime so TypeScript never resolves the subpath against the
    // pinned dev closure (0.2.2+, where the subpath is gone from the map).
    const specifier = `${CONTROL_PACKAGE}/list-agents`;
    const upstream = (await import(__rewriteRelativeImportExtension(specifier)));
    await upstream.apply(ctx);
}
//# sourceMappingURL=legacy-list-agents.js.map