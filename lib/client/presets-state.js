import { PRESET_KEYS } from "../preset-contract.js";
export function saveRequest(draft) {
    const { original, mode } = draft;
    const updating = mode === 'edit' || mode === 'repair';
    const request = { id: updating ? original.id : draft.fields.name ?? '', version: updating ? original.version : null };
    if (mode === 'repair')
        return { ...request, source: draft.source };
    const patch = {};
    for (const key of PRESET_KEYS) {
        if (updating && key === 'name')
            continue;
        const value = draft.fields[key] ?? '';
        const before = updating ? original.fields[key] ?? '' : '';
        if (value !== before)
            patch[key] = value === '' ? null : value;
    }
    if (Object.keys(patch).length)
        request.patch = patch;
    if (updating ? draft.body !== original.body : draft.body !== '')
        request.body = draft.body;
    return request;
}
export function isDirty(draft) {
    if (!draft)
        return false;
    if (draft.mode === 'repair')
        return draft.source !== draft.original.source;
    const request = saveRequest(draft);
    return Boolean(request.patch || (draft.mode === 'edit' ? request.body !== undefined : draft.body !== ''));
}
const caught = (error) => ({ error: error instanceof Error ? error.message : String(error), code: 'transport' });
/** One instance per plugin activation: React mounting/unmounting never owns drafts. */
export class PresetsController {
    snapshot = { status: 'idle', busy: false, catalogStatus: 'idle' };
    listeners = new Set();
    disposed = false;
    loading;
    catalogLoading;
    client;
    constructor(client) { this.client = client; }
    getSnapshot = () => this.snapshot;
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    dispose() { this.disposed = true; this.listeners.clear(); }
    publish(patch) {
        if (this.disposed)
            return;
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    /** Opening refreshes the roster without replacing an in-progress draft or its revision. */
    open() { void this.load(); void this.loadModels(); }
    load() {
        if (this.loading)
            return this.loading;
        this.publish({ status: 'loading' });
        this.loading = this.fetchList().finally(() => { this.loading = undefined; });
        return this.loading;
    }
    async fetchList() {
        try {
            const reply = await this.client.call('list', null);
            if (reply.ok)
                this.publish({ status: 'ready', list: reply.value, listError: undefined });
            else
                this.publish({ status: 'error', listError: reply });
        }
        catch (error) {
            this.publish({ status: 'error', listError: caught(error) });
        }
    }
    loadModels() {
        if (this.catalogLoading)
            return this.catalogLoading;
        this.publish({ catalogStatus: 'loading', catalogError: undefined });
        this.catalogLoading = this.client.models().then(catalog => this.publish({ catalogStatus: 'ready', catalog, catalogError: undefined }), error => this.publish({ catalogStatus: 'error', catalogError: caught(error).error })).finally(() => { this.catalogLoading = undefined; });
        return this.catalogLoading;
    }
    start(mode, original) {
        if (this.snapshot.busy || this.snapshot.draft)
            return;
        if (original && (!original.structured || original.error) && mode !== 'repair')
            mode = 'repair';
        const fields = mode === 'create' ? {} : { ...original.fields };
        if (mode === 'copy')
            delete fields.name;
        if (mode === 'edit' || mode === 'repair')
            fields.name = original.id;
        this.publish({ draft: { mode, original, fields, body: original?.body ?? '', source: original?.source ?? '', advanced: false }, failure: undefined, notice: undefined });
    }
    field(key, value) {
        const draft = this.snapshot.draft;
        if (!draft || this.snapshot.busy || this.snapshot.confirmation || ((draft.mode === 'edit' || draft.mode === 'repair') && key === 'name'))
            return;
        this.publish({ draft: { ...draft, fields: { ...draft.fields, [key]: value } }, failure: undefined });
    }
    text(key, value) {
        if (!this.snapshot.draft || this.snapshot.busy || this.snapshot.confirmation)
            return;
        this.publish({ draft: { ...this.snapshot.draft, [key]: value }, failure: undefined });
    }
    advanced(open) {
        if (this.snapshot.draft)
            this.publish({ draft: { ...this.snapshot.draft, advanced: open } });
    }
    discard(action) {
        if (this.snapshot.busy || this.snapshot.confirmation)
            return;
        if (isDirty(this.snapshot.draft))
            this.publish({ confirmation: { kind: 'discard', action } });
        else
            this.finishDiscard(action);
    }
    finishDiscard(action) {
        if (action === 'repair') {
            const original = this.snapshot.draft?.original;
            this.publish({ draft: undefined, confirmation: undefined, failure: undefined });
            if (original)
                this.start('repair', original);
            return;
        }
        this.publish({ draft: undefined, confirmation: undefined, failure: undefined, notice: undefined });
        if (action === 'refresh')
            this.open();
    }
    askDelete(entry) {
        if (!this.snapshot.busy && !this.snapshot.confirmation)
            this.publish({ confirmation: { kind: 'delete', entry }, failure: undefined });
    }
    cancelConfirmation() { if (!this.snapshot.busy)
        this.publish({ confirmation: undefined }); }
    async confirm() {
        const confirmation = this.snapshot.confirmation;
        if (!confirmation || this.snapshot.busy)
            return;
        if (confirmation.kind === 'discard')
            this.finishDiscard(confirmation.action);
        else if (confirmation.kind === 'display')
            await this.persist({ ...confirmation.request, confirmDisplayName: true });
        else {
            this.publish({ busy: true, confirmation: undefined, failure: undefined });
            try {
                const reply = await this.client.call('remove', { id: confirmation.entry.id, version: confirmation.entry.version });
                if (!reply.ok)
                    this.publish({ failure: reply });
                else {
                    this.publish({ notice: `已删除 ${confirmation.entry.id}.md` });
                    await this.loading;
                    await this.load();
                }
            }
            catch (error) {
                this.publish({ failure: caught(error) });
            }
            finally {
                this.publish({ busy: false });
            }
        }
    }
    async save() {
        const draft = this.snapshot.draft;
        if (!draft || this.snapshot.busy || this.snapshot.confirmation)
            return;
        const request = saveRequest(draft);
        const previous = draft.original?.fields.display_name ?? '';
        if (draft.mode === 'edit' && (draft.fields.display_name ?? '') !== previous)
            this.publish({ confirmation: { kind: 'display', request } });
        else
            await this.persist(request);
    }
    async persist(request) {
        this.publish({ busy: true, confirmation: undefined, failure: undefined });
        try {
            const reply = await this.client.call('save', request);
            if (!reply.ok) {
                // Raw repair is parsed only by the host; it requests label confirmation after validation.
                if (reply.code === 'confirmation_required')
                    this.publish({ confirmation: { kind: 'display', request } });
                else
                    this.publish({ failure: reply });
            }
            else {
                this.publish({ draft: undefined, notice: `已保存 ${reply.value.id}.md` });
                await this.loading;
                await this.load();
            }
        }
        catch (error) {
            this.publish({ failure: caught(error) });
        }
        finally {
            this.publish({ busy: false });
        }
    }
}
//# sourceMappingURL=presets-state.js.map