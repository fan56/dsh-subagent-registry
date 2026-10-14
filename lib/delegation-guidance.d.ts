import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
/** Keep native delegation available while preferring the visible custom-agent roster. */
export declare function registerDelegationGuidance(ctx: Context, dispatch: ToolDefinition, askToolName: string): () => void;
