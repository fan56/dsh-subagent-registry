import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
export declare const PANEL_ID: MainPanelId;
export declare const PANEL_LABEL = "\u5B50\u667A\u80FD\u4F53";
export declare const inject: string[];
export declare function SubagentIcon({ size }: {
    size?: number;
}): import("react").ReactSVGElement;
export declare function apply(ctx: Context & {
    readonly connection: ConnectionHandle;
}): void;
