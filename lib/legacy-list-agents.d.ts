import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name — kept identical to the legacy sub-entry's own name so loader logs stay recognizable. */
export declare const name = "tool-subagent-list-agents";
/** Same service seam the legacy sub-entry declared (its `inject` export). */
export declare const inject: string[];
/**
 * Read one control package manifest and report whether it still exports the
 * legacy `./list-agents` sub-entry. Pure manifest inspection: no import is
 * attempted, so a negative answer never reaches `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
export declare function controlPackageExportsListAgents(packageDir: string): boolean;
/**
 * Mount the legacy `./list-agents` sub-entry on hosts that still need it, and
 * mount nothing on hosts whose main entry registers discovery itself. Either
 * way `list_agents` registers exactly once: through the upstream sub-entry's
 * own `apply` (pre-0.2.2), or through the control plugin mounted one row up
 * (0.2.2+, where this bridge is a deliberate no-op).
 */
export declare function apply(ctx: Context): Promise<void>;
