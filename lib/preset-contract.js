export const PRESETS_CHANNEL = '/api';
export const PRESETS_ENDPOINT_PREFIX = 'subagent-presets/';
// `deep` stays as an inert compatibility field (accepted/round-tripped by the
// UI and storage; no nesting semantics — children cannot spawn subagents).
export const PRESET_KEYS = ['name', 'display_name', 'description', 'model', 'thinking', 'deep', 'background', 'maxRounds'];
//# sourceMappingURL=preset-contract.js.map