import { type PresetEntry, type PresetList } from './preset-contract.ts';
/** The directory is trusted host configuration, never a remote request parameter. */
export declare function createPresetStore(directory: string): {
    list(): Promise<PresetList>;
    save(raw: unknown): Promise<PresetEntry>;
    remove(raw: unknown): Promise<void>;
};
