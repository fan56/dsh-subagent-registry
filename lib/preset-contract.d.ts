/** Shared JSON contract for the authenticated Connection RPC and client. */
export declare const PRESETS_CHANNEL = "/api";
export declare const PRESETS_ENDPOINT_PREFIX = "subagent-presets/";
export declare const PRESET_KEYS: readonly ["name", "display_name", "description", "model", "thinking", "deep", "background", "maxRounds"];
export type PresetKey = (typeof PRESET_KEYS)[number];
export type PresetFields = Partial<Record<PresetKey, string>>;
export interface PresetEntry {
    id: string;
    version: string;
    fields: PresetFields;
    source: string;
    body: string;
    error?: string;
    structured: boolean;
}
export interface PresetList {
    directory: string;
    entries: PresetEntry[];
}
export interface SavePreset {
    id: string;
    /** null creates a file; a read revision updates that exact file. */
    version: string | null;
    patch?: Partial<Record<PresetKey, string | null>>;
    body?: string;
    /** Full original-text repair, exclusive of patch/body. */
    source?: string;
    confirmDisplayName?: boolean;
}
export interface DeletePreset {
    id: string;
    version: string;
}
export type PresetReply<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
    code: string;
    field?: string;
};
