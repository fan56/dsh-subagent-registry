import { createElement } from 'react';
import { PRESETS_CHANNEL, PRESETS_ENDPOINT_PREFIX } from "../preset-contract.js";
import { PresetsPage } from "./PresetsPage.js";
import { PresetsController } from "./presets-state.js";
export const PANEL_ID = 'subagent-presets';
export const PANEL_LABEL = '子智能体';
export const inject = ['slots', 'layout', 'connection', 'remote', 'remote.session'];
export function SubagentIcon({ size }) {
    const edge = typeof size === 'number' && size > 0 ? size : 16;
    return createElement('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
    }, createElement('circle', { cx: 6.5, cy: 5, r: 2 }), createElement('path', { d: 'M6.5 7v12' }), createElement('path', { d: 'M6.5 11c3.5 0 3.5-4.5 7-4.5' }), createElement('path', { d: 'M6.5 11c3.5 0 3.5 4.5 7 4.5' }), createElement('circle', { cx: 16.5, cy: 6.5, r: 2 }), createElement('circle', { cx: 16.5, cy: 15.5, r: 2 }));
}
export function apply(ctx) {
    const client = {
        async call(endpoint, payload) {
            const result = await ctx.connection.rpc.call(PRESETS_CHANNEL, `${PRESETS_ENDPOINT_PREFIX}${endpoint}`, payload);
            if (!result.ok)
                throw new Error(result.error.message);
            return result.value;
        },
        async models() {
            const result = await ctx.remote.session.modelCatalog();
            if (!result.ok)
                throw new Error(result.error.message);
            return result.value;
        },
    };
    const controller = new PresetsController(client);
    ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.plugin = '@aiwayds/dsh-subagent-registry';
        style.textContent = __PRESETS_CSS__;
        document.head.append(style);
        return () => { style.remove(); controller.dispose(); };
    }, 'subagent-presets: style and controller');
    ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, inject: () => ({ controller }),
    }, PresetsPage));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, label: PANEL_LABEL, order: 50,
    }, SubagentIcon));
}
//# sourceMappingURL=index.js.map