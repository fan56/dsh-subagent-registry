import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
export declare const PANEL_ID: MainPanelId;
export declare const PANEL_LABEL = "\u5B50\u667A\u80FD\u4F53";
export declare const AGY_PANEL_ID: MainPanelId;
export declare const AGY_PANEL_LABEL = "agy";
export declare const inject: string[];
export declare function SubagentIcon({ size }: {
    size?: number;
}): import("react").ReactSVGElement;
/** Distinct glyph so the agy panel is not visually confused with the presets panel. */
export declare function AgyIcon({ size }: {
    size?: number;
}): import("react").ReactSVGElement;
export declare function apply(ctx: Context & {
    readonly connection: ConnectionHandle;
}): void;
