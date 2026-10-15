import { type PresetEntry, type PresetFields, type PresetKey, type PresetList, type PresetReply, type SavePreset } from '../preset-contract.ts';
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types';
export type DraftMode = 'create' | 'copy' | 'edit' | 'repair';
export interface Draft {
    mode: DraftMode;
    original?: PresetEntry;
    fields: PresetFields;
    body: string;
    source: string;
    advanced: boolean;
}
export interface Failure {
    error: string;
    code: string;
    field?: string;
}
type DiscardAction = 'list' | 'refresh' | 'repair';
export type Confirmation = {
    kind: 'discard';
    action: DiscardAction;
} | {
    kind: 'delete';
    entry: PresetEntry;
} | {
    kind: 'display';
    request: SavePreset;
};
export interface PresetsSnapshot {
    status: 'idle' | 'loading' | 'ready' | 'error';
    list?: PresetList;
    draft?: Draft;
    failure?: Failure;
    listError?: Failure;
    busy: boolean;
    confirmation?: Confirmation;
    notice?: string;
    catalog?: ModelCatalog;
    catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
    catalogError?: string;
}
export interface PresetsClient {
    call<T>(endpoint: 'list' | 'save' | 'remove', payload: unknown): Promise<PresetReply<T>>;
    models(): Promise<ModelCatalog>;
}
export declare function saveRequest(draft: Draft): SavePreset;
export declare function isDirty(draft?: Draft): boolean;
/** One instance per plugin activation: React mounting/unmounting never owns drafts. */
export declare class PresetsController {
    private snapshot;
    private readonly listeners;
    private disposed;
    private loading?;
    private catalogLoading?;
    private readonly client;
    constructor(client: PresetsClient);
    getSnapshot: () => PresetsSnapshot;
    subscribe: (listener: () => void) => (() => void);
    dispose(): void;
    private publish;
    /** Opening refreshes the roster without replacing an in-progress draft or its revision. */
    open(): void;
    load(): Promise<void>;
    private fetchList;
    loadModels(): Promise<void>;
    start(mode: DraftMode, original?: PresetEntry): void;
    field(key: PresetKey, value: string): void;
    text(key: 'body' | 'source', value: string): void;
    advanced(open: boolean): void;
    discard(action: DiscardAction): void;
    private finishDiscard;
    askDelete(entry: PresetEntry): void;
    cancelConfirmation(): void;
    confirm(): Promise<void>;
    save(): Promise<void>;
    private persist;
}
export {};
