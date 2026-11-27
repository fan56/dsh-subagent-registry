/**
 * The `registry-acp` provider: a one-shot, foreground-only dispatcher for the
 * built-in `agy` member. It advertises no start capabilities, owns a small
 * serialisation counter for agy's SQLite contention, and never reads the
 * working directory — the host manager already resolved `request.cwd`.
 *
 * @module acp/provider
 */
import { NO_START_CAPABILITIES, } from '@deepseek-ai/dsh-subagent';
import { assertTopLevelCaller } from "../caller-guard.js";
import { ACP_CODES, classifyAcpError } from "./errors.js";
import { startAgyRun } from "./run.js";
/**
 * Max concurrent agy processes. The host does not queue over-cap calls; this
 * counter follows the same rule so a parallel tool step cannot wedge behind a
 * chain of ten-minute tasks.
 */
export const DEFAULT_MAX_CONCURRENT = 1;
export class AgyAcpProvider {
    name = 'registry-acp';
    capabilities = NO_START_CAPABILITIES;
    inheritsParentContext = false;
    // Intentionally no `prepareContinuable`: the host routes this provider
    // through the external start path, which never reserves a childId/persona.
    active = 0;
    maxConcurrent;
    options;
    deps;
    constructor(options) {
        this.options = options;
        this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
        this.deps = options.log ?? {};
    }
    async start(request) {
        // Reuse the existing identity check verbatim; a nested caller (including a
        // native tool that somehow selects this provider) is refused before spawn.
        assertTopLevelCaller({ agent: request.parent });
        if (request.signal.aborted)
            throw classifyAcpError({ code: ACP_CODES.ABORTED }, 'process');
        if (this.active >= this.maxConcurrent) {
            throw classifyAcpError({ code: ACP_CODES.BUSY }, 'process');
        }
        this.active++;
        let run;
        try {
            run = await startAgyRun(request, {
                cwd: request.cwd,
                command: this.options.command,
                args: this.options.args,
                permission: this.options.permission,
                handshakeTimeoutMs: this.options.handshakeTimeoutMs,
                timeoutMs: this.options.timeoutMs,
                eofGraceMs: this.options.eofGraceMs,
                graceMs: this.options.graceMs,
                model: this.options.model,
                env: this.options.env,
                spawn: this.options.spawn,
                onError: this.options.onError,
            }, this.deps);
        }
        catch (error) {
            this.active--;
            throw error;
        }
        let released = false;
        const release = () => {
            if (released)
                return;
            released = true;
            this.active--;
        };
        const dispose = () => run.dispose().then(() => { }, 
        // The host's dispose() can reject during teardown; a delayed rejection
        // must not escape into an already-settled abort/settle path.
        (error) => {
            this.deps.warn?.(`[agy-acp] dispose failed: ${error instanceof Error ? error.message : String(error)}`);
        }).finally(() => {
            request.signal.removeEventListener('abort', onAbort);
            release();
        });
        const onAbort = () => {
            // The host forwards the caller's signal only during startup. After the
            // run is published nothing forwards it, so observe it here and dispose.
            // A rejected dispose must not become an unhandled rejection: release the
            // slot and finish the abort path regardless.
            void dispose().catch((error) => {
                this.deps.warn?.(`[agy-acp] dispose on abort failed: ${error instanceof Error ? error.message : String(error)}`);
            });
        };
        if (request.signal.aborted)
            onAbort();
        else
            request.signal.addEventListener('abort', onAbort, { once: true });
        return { id: run.id, result: run.result, dispose };
    }
}
//# sourceMappingURL=provider.js.map