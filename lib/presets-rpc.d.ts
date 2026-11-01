import type { Context } from '@deepseek-ai/cordis';
import { type Language } from './preset-contract.ts';
/** Public exact Connection routes inherit the /api authentication and Host/Origin fence. */
export declare function registerPresetsRpc(ctx: Context, directory: string, refreshRoster: () => Promise<void>, getLanguage: () => Language): Promise<void>;
