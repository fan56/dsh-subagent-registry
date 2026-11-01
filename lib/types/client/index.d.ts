import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
export declare const PANEL_ID: MainPanelId;
export declare const PANEL_LABEL = "\u0421\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u044B";
export declare const inject: string[];
export declare function SubagentIcon({ size }: {
    size?: number;
}): import("react").ReactSVGElement;
export declare function apply(ctx: Context & {
    readonly connection: ConnectionHandle;
}): void;
