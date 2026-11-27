/**
 * The built-in `agy` roster member — defined with the package, never written
 * to the agents dir. It is Experimental (hidden unless `agyEnabled`) and only
 * appears when the command resolves and no user-owned `agy.md` shadows it.
 *
 * All lookups are injected so roster building stays synchronous and testable:
 * the caller supplies the executable resolver and the agent-file parser, and
 * this module only decides whether the built-in definition is visible.
 *
 * @module builtin-agy
 */
/** Stable id of the built-in member (also the user-file name it competes with). */
export const BUILTIN_AGY_ID = 'agy';
/** Command the ACP provider spawns — fixed, never taken from config. */
export const BUILTIN_AGY_COMMAND = ['agy', 'acp'];
const ZH = {
    name: BUILTIN_AGY_ID,
    displayName: 'Gemini 套餐 · 实验性',
    description: 'agy（Google Antigravity CLI，实验性）：经 ACP 派活，走 Google AI 套餐额度，不占 dsh 模型额度。适合要另一家模型视角的实现、排障、审查任务。每次派活冷启动约 20 秒才出首字；只支持前台一次性派活（不能后台、追问、续跑），提示词必须自包含；agy 在当前工作目录读写文件、执行命令，权限按本机 agy 设置；模型由 agy 自己的默认设置决定。琐碎任务不要派给它。',
    body: '你是 dsh 主代理派来的外部专员。任务说明是自包含的：直接完成，然后只汇报结果——做了什么、改了哪些文件、还需要主代理做什么。这是无人值守派活，没有人回答追问；做不到就明说卡在哪。',
    command: BUILTIN_AGY_COMMAND,
};
const EN = {
    name: BUILTIN_AGY_ID,
    displayName: 'Gemini plan · Experimental',
    description: 'agy (Google Antigravity CLI, Experimental): dispatched over ACP, billed to the Google AI plan, not the dsh model quota. Useful for implementation, debugging, or review from another model. Cold start takes about 20 seconds before the first token; foreground one-shot dispatch only (no background, follow-up, or resume), so the prompt must be self-contained. agy reads and writes files and runs commands in the working directory under the local agy permissions; the model comes from agy\'s own defaults. Do not send it trivial tasks.',
    body: 'You are an external specialist dispatched by the dsh main agent. The task brief is self-contained: finish it, then report only the result — what you did, which files you changed, and what the main agent still needs to do. This is unattended dispatch; nobody answers follow-ups. If you are blocked, say exactly where.',
    command: BUILTIN_AGY_COMMAND,
};
/** Edition for one language; ru / es fall back to en (no dedicated edition). */
export function builtinAgyEdition(language) {
    return language === 'zh' ? ZH : EN;
}
/** Whether the name is hidden by the roster toggle. */
function isDisabled(name, disabledAgents) {
    return disabledAgents?.includes(name) === true;
}
/**
 * Resolve the built-in member for the roster, or undefined when hidden.
 * A user-owned `agy.md` wins whether it parses or is broken — the built-in
 * must never mask a broken user file in the roster.
 */
export function resolveBuiltinAgy(input) {
    if (!input.enabled)
        return undefined;
    if (isDisabled(BUILTIN_AGY_ID, input.disabledAgents))
        return undefined;
    if (input.parseUserAgent(BUILTIN_AGY_ID) !== undefined)
        return undefined;
    if (input.resolveExecutable(BUILTIN_AGY_ID) === undefined)
        return undefined;
    return builtinAgyEdition(input.language);
}
/** Roster line, in the same `- name (display): description` shape as agent files. */
export function builtinAgyRosterLine(definition) {
    return `- ${definition.name} (${definition.displayName}): ${definition.description}`;
}
//# sourceMappingURL=builtin-agy.js.map