// Match only the host's generated delegation section, not arbitrary persona text.
const HOST_GUIDANCE = /^Start independent (?:delegations with (`[^`\r\n]+`(?: or `[^`\r\n]+`)*)|([^`\s]+) delegations) together in one assistant message and continue useful work while they run\.$/;
function hostDelegationNames(text) {
    const match = HOST_GUIDANCE.exec(text);
    if (match === null)
        return [];
    return match[2] === undefined ? [...match[1].matchAll(/`([^`]+)`/g)].map(item => item[1]) : [match[2]];
}
/** Keep native delegation available while preferring the visible custom-agent roster. */
export function registerDelegationGuidance(ctx, dispatch, askToolName) {
    return ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        const assembly = await next();
        // 0.2.2-rc.1: the assemble waterfall carries the PromptPresentation only —
        // tool declarations are provider-owned and merged into PromptAssembly after
        // the waterfall, so `assembly.tools` no longer exists here. The scoped
        // schema view is the presentation-independent source for both branches the
        // old code distinguished: PTC mode exposes only its reserved transport on
        // the wire while scoped schemas retain SDK tools (the old PTC branch called
        // exactly this), and outside PTC the scoped view differs from the assembled
        // set only by conditional registrations not admitted this step — the
        // section-presence gating below already absorbs that (a native delegation
        // section only exists when its tool was actually presented).
        const schemas = ctx.tools.schemas(context.scope);
        const visible = new Set(schemas.map(tool => tool.name));
        if (!visible.has(dispatch.name) || ctx.tools.get(dispatch.name, context.scope) !== dispatch)
            return assembly;
        const originals = assembly.sections.filter(section => hostDelegationNames(section.text).some(name => section.name === `tool:${name}`));
        const nativeNames = [...new Set(originals.flatMap(section => hostDelegationNames(section.text).filter(name => visible.has(name))))];
        const text = [
            `When delegating, use a matching role from the \`${dispatch.name}\` roster with a self-contained prompt.${nativeNames.includes('subagent_fork') ? ' Use `subagent_fork` only when inheriting the current conversation is necessary.' : ''}`,
            'Start independent calls together; use `background=true` for custom agents and continue useful work. Wait in the foreground only when your next step depends on the result.',
            ...(visible.has(askToolName) ? [
                `Use \`${askToolName}\` to follow up with a background custom agent and wait for its reply.`,
            ] : []),
        ].join('\n\n');
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