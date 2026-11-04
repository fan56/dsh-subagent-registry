/**
 * PTC storage paths — migrated from `@aiwayds/dsh-ptc-subagent` unchanged:
 * the usage sink keeps its historical `<dsh home>/storages/ptc-subagent`
 * location so an upgrade from the standalone plugin appends to the same
 * `usage.jsonl`.
 *
 * @module ptc/paths
 */
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
/** The PTC feature's storage directory name under the dsh home. Kept at the
 *  standalone plugin's value (`ptc-subagent`) — the usage log predates the
 *  merge and must not fork its on-disk location. */
export const PTC_SUBAGENT_STORAGE_DIRNAME = 'ptc-subagent';
/** The dsh home — `DSH_HOME` or `~/.dsh` (same resolution as the family). */
export function resolveDshHome() {
    return process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
        ? process.env.DSH_HOME
        : join(homedir(), '.dsh');
}
/** The usage-sink directory: the override, or `<dsh home>/storages/ptc-subagent`.
 *  Tolerates an absent/undefined override (a config built without the key). */
export function resolveUsageDir(configured) {
    const value = (configured ?? '').trim();
    return value === ''
        ? join(resolveDshHome(), 'storages', PTC_SUBAGENT_STORAGE_DIRNAME)
        : resolvePath(value);
}
//# sourceMappingURL=paths.js.map