// Match only the host's generated delegation section, not arbitrary persona text.
const HOST_GUIDANCE = /^Start independent delegations with (`[^`\r\n]+`(?: or `[^`\r\n]+`)*) together in one assistant message and continue useful work while they run\.$/;
/** Keep native delegation available while preferring the visible custom-agent roster. */
export function registerDelegationGuidance(ctx, dispatch, askToolName) {
    return ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        const assembly = await next();
        // PTC exposes only its reserved transport on the wire; scoped schemas retain SDK tools.
        const schemas = assembly.tools.some(tool => tool.name === 'run_code') ? ctx.tools.schemas(context.scope) : assembly.tools;
        const visible = new Set(schemas.map(tool => tool.name));
        if (!visible.has(dispatch.name) || ctx.tools.get(dispatch.name, context.scope) !== dispatch)
            return assembly;
        const originals = assembly.sections.filter(section => {
            const match = HOST_GUIDANCE.exec(section.text);
            return match !== null && section.name.startsWith('tool:')
                && [...match[1].matchAll(/`([^`]+)`/g)].some(item => section.name === `tool:${item[1]}`);
        });
        const nativeNames = [...new Set(originals.flatMap(section => [...section.text.matchAll(/`([^`]+)`/g)].map(match => match[1]).filter(name => visible.has(name))))];
        const text = [
            `When delegating a self-contained task, prefer \`${dispatch.name}\` if a custom agent in its roster matches the task; choose by the listed role and include the context it needs.`,
            ...(nativeNames.length > 0 ? [
                `If no custom role fits, use ${nativeNames.map(name => `\`${name}\``).join(' or ')} as appropriate for the task.`,
            ] : []),
            ...(nativeNames.includes('subagent_fork') ? [
                'When the child needs to inherit the current conversation, use `subagent_fork`; custom agents receive a self-contained prompt instead.',
            ] : []),
            `Start independent delegations together in one assistant message and continue useful work while they run. Use \`${dispatch.name}\` with background=true for independent custom-agent work; wait in the foreground only when your next action depends on its result.`,
            ...(visible.has(askToolName) ? [
                `Use \`${askToolName}\` to follow up with a background custom agent and wait for its reply.`,
            ] : []),
        ].join('\n');
        // Preserve every tool schema, runtime context and unrelated prompt section.
        let replaced = false;
        const sections = assembly.sections.map(section => {
            if (!originals.includes(section))
                return section;
            const replacement = { ...section, text: replaced ? '' : text };
            replaced = true;
            return replacement;
        });
        if (!replaced)
            sections.push({ name: `tool:${dispatch.name}:delegation`, text });
        return { ...assembly, sections };
    });
}
//# sourceMappingURL=delegation-guidance.js.map