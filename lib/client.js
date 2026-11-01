window.__ModuleLoader__.load({id:"@aiwayds/dsh-subagent-registry",factory:(require)=>{const __PRESETS_CSS__="/* src/client/PresetsPage.module.css */\n.PresetsPage_page {\n  box-sizing: border-box;\n  height: 100%;\n  min-width: 0;\n  overflow: auto;\n  padding: 28px clamp(16px, 4vw, 48px) 48px;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n}\n.PresetsPage_content {\n  width: 100%;\n  max-width: 880px;\n  margin-inline: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n}\n.PresetsPage_header {\n  display: flex;\n  justify-content: space-between;\n  align-items: flex-start;\n  gap: 16px;\n}\n.PresetsPage_headingGroup {\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 8px;\n}\n.PresetsPage_title {\n  margin: 0;\n  font-size: 20px;\n  line-height: 1.4;\n  font-weight: 600;\n  overflow-wrap: anywhere;\n}\n.PresetsPage_title:focus {\n  outline: none;\n}\n.PresetsPage_actions,\n.PresetsPage_rowActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n.PresetsPage_action {\n  min-height: 32px;\n  height: 32px;\n  padding: 0 12px;\n  font-size: 13px;\n  border-radius: var(--dsw-radius-md);\n  white-space: nowrap;\n  transition: all 0.15s ease;\n}\n.PresetsPage_action:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));\n  outline-offset: 2px;\n}\n.PresetsPage_directory {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 12px 16px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: var(--dsw-radius-md);\n}\n.PresetsPage_directoryHeader {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n.PresetsPage_directoryIcon {\n  flex: none;\n  color: var(--dsw-alias-brand-primary);\n  opacity: 0.9;\n}\n.PresetsPage_directoryPath {\n  margin: 0;\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Monaco,\n    Consolas,\n    monospace;\n  font-size: 12.5px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n.PresetsPage_hint,\n.PresetsPage_status {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 1.6;\n  overflow-wrap: anywhere;\n}\n.PresetsPage_list {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.PresetsPage_card,\n.PresetsPage_row {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 18px 20px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-bg-layer-1);\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);\n  transition:\n    border-color 0.18s ease,\n    background-color 0.18s ease,\n    box-shadow 0.18s ease,\n    transform 0.18s ease;\n}\n.PresetsPage_card:hover,\n.PresetsPage_row:hover {\n  border-color: var(--dsw-alias-border-l3);\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);\n  transform: translateY(-1px);\n}\n.PresetsPage_card[data-state=error],\n.PresetsPage_row[data-state=error] {\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 2%, var(--dsw-alias-bg-layer-1));\n}\n.PresetsPage_card[data-state=error]:hover,\n.PresetsPage_row[data-state=error]:hover {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_cardHeader {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  min-width: 0;\n}\n.PresetsPage_cardIdentity {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-width: 0;\n  flex: 1;\n}\n.PresetsPage_avatar {\n  flex: none;\n  width: 38px;\n  height: 38px;\n  border-radius: var(--dsw-radius-md, 8px);\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-2));\n  color: var(--dsw-alias-brand-primary);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);\n  font-size: 15px;\n  font-weight: 600;\n  user-select: none;\n  transition: transform 0.18s ease;\n}\n.PresetsPage_card:hover .PresetsPage_avatar,\n.PresetsPage_row:hover .PresetsPage_avatar {\n  transform: scale(1.05);\n}\n.PresetsPage_avatarError {\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-layer-2));\n  color: var(--dsw-alias-state-error-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, transparent);\n}\n.PresetsPage_avatarIcon {\n  width: 18px;\n  height: 18px;\n}\n.PresetsPage_titleArea {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n  flex: 1;\n}\n.PresetsPage_titleRow,\n.PresetsPage_rowHeading {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.PresetsPage_cardTitle,\n.PresetsPage_rowTitle {\n  margin: 0;\n  font-size: 15px;\n  line-height: 1.4;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n.PresetsPage_filePill,\n.PresetsPage_identifier {\n  margin: 0;\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Monaco,\n    Consolas,\n    monospace;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  padding: 1px 7px;\n  border-radius: var(--dsw-radius-sm, 4px);\n  border: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n.PresetsPage_statusBadge,\n.PresetsPage_badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  border-radius: 999px;\n  padding: 1px 8px;\n  font-size: 11px;\n  line-height: 16px;\n  font-weight: 500;\n  white-space: nowrap;\n}\n.PresetsPage_statusDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n}\n.PresetsPage_statusBadge[data-status=ready] {\n  color: var(--dsw-alias-state-success-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 25%, transparent);\n}\n.PresetsPage_statusBadge[data-status=ready] .PresetsPage_statusDot {\n  background: var(--dsw-alias-state-success-primary);\n}\n.PresetsPage_statusBadge[data-status=error] {\n  color: var(--dsw-alias-state-error-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 25%, transparent);\n}\n.PresetsPage_statusBadge[data-status=error] .PresetsPage_statusDot {\n  background: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_statusBadge[data-status=unstructured] {\n  color: var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 25%, transparent);\n}\n.PresetsPage_statusBadge[data-status=unstructured] .PresetsPage_statusDot {\n  background: var(--dsw-alias-state-warn-primary);\n}\n.PresetsPage_cardActions,\n.PresetsPage_rowActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n}\n.PresetsPage_danger {\n  color: var(--dsw-alias-label-secondary);\n}\n.PresetsPage_danger:hover:not(:disabled) {\n  color: var(--dsw-alias-state-error-primary) !important;\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent) !important;\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent) !important;\n}\n.PresetsPage_danger:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-error-primary);\n  outline-offset: 2px;\n}\n.PresetsPage_cardBody,\n.PresetsPage_rowContent {\n  min-width: 0;\n}\n.PresetsPage_description {\n  margin: 0;\n  font-size: 13.5px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n  white-space: pre-wrap;\n}\n.PresetsPage_description[data-empty=true] {\n  color: var(--dsw-alias-label-tertiary);\n  font-style: italic;\n}\n.PresetsPage_cardErrorBox {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 10px 12px;\n  border-radius: var(--dsw-radius-md, 6px);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1));\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent);\n}\n.PresetsPage_cardErrorHeader {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_cardErrorText {\n  margin: 0;\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Monaco,\n    Consolas,\n    monospace;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-state-error-primary);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.PresetsPage_unstructuredNotice {\n  margin: 6px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-state-warn-primary);\n}\n.PresetsPage_cardMeta {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n  padding-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n.PresetsPage_metaChip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  height: 24px;\n  padding: 0 9px;\n  border-radius: 999px;\n  font-size: 12px;\n  line-height: 18px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  color: var(--dsw-alias-label-secondary);\n  transition: all 0.15s ease;\n}\n.PresetsPage_chipIcon {\n  flex: none;\n  opacity: 0.8;\n}\n.PresetsPage_chipLabel {\n  opacity: 0.85;\n}\n.PresetsPage_chipValue {\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n.PresetsPage_metaChip[data-kind=model] {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-layer-2));\n}\n.PresetsPage_metaChip[data-kind=thinking] {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-2));\n  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);\n}\n.PresetsPage_metaChip[data-kind=thinking] .PresetsPage_chipIcon {\n  color: var(--dsw-alias-brand-primary);\n  opacity: 1;\n}\n.PresetsPage_metaChip[data-kind=thinking] .PresetsPage_chipLabel {\n  color: var(--dsw-alias-brand-primary);\n  font-weight: 500;\n}\n.PresetsPage_metaChip[data-kind=thinking][data-active=true] {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent);\n  color: var(--dsw-alias-brand-primary);\n}\n.PresetsPage_metaChip[data-kind=thinking][data-active=true] .PresetsPage_chipValue {\n  color: var(--dsw-alias-brand-primary);\n  font-weight: 600;\n}\n.PresetsPage_metaChip[data-kind=thinking][data-level=off] {\n  opacity: 0.65;\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l1);\n}\n.PresetsPage_metaChip[data-kind=thinking][data-level=off] .PresetsPage_chipIcon,\n.PresetsPage_metaChip[data-kind=thinking][data-level=off] .PresetsPage_chipLabel,\n.PresetsPage_metaChip[data-kind=thinking][data-level=off] .PresetsPage_chipValue {\n  color: var(--dsw-alias-label-tertiary);\n}\n.PresetsPage_metaChip[data-kind=background] {\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, var(--dsw-alias-bg-layer-2));\n  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent);\n  color: var(--dsw-alias-state-business-primary);\n}\n.PresetsPage_metaChip[data-kind=background] .PresetsPage_chipIcon,\n.PresetsPage_metaChip[data-kind=background] .PresetsPage_chipValue {\n  color: var(--dsw-alias-state-business-primary);\n}\n.PresetsPage_metaChip[data-kind=deep] {\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l1);\n}\n.PresetsPage_metaChip[data-kind=rounds] {\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l1);\n}\n.PresetsPage_errorSummary,\n.PresetsPage_diagnostic,\n.PresetsPage_catalogError {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 16px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-md);\n  background: var(--dsw-alias-bg-layer-1);\n  min-width: 0;\n}\n.PresetsPage_errorSummary:focus,\n.PresetsPage_errorLink:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));\n  outline-offset: 3px;\n}\n.PresetsPage_errorTitle {\n  margin: 0;\n  font-weight: 500;\n  color: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_errorText,\n.PresetsPage_fieldError {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  font-size: 13px;\n  line-height: 1.6;\n}\n.PresetsPage_errorLink {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n.PresetsPage_notice {\n  margin: 0;\n  color: var(--dsw-alias-state-success-primary);\n  overflow-wrap: anywhere;\n}\n.PresetsPage_empty {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  text-align: center;\n  gap: 12px;\n  padding: 48px 24px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-lg, 12px);\n}\n.PresetsPage_emptyIcon {\n  width: 44px;\n  height: 44px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 2px;\n}\n.PresetsPage_emptyTitle {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n.PresetsPage_empty .PresetsPage_hint {\n  max-width: 360px;\n  margin-bottom: 4px;\n}\n.PresetsPage_form {\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n  min-width: 0;\n}\n.PresetsPage_field {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  min-width: 0;\n}\n.PresetsPage_fieldHeader {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n}\n.PresetsPage_toggleCustom {\n  background: none;\n  border: none;\n  padding: 0;\n  font: inherit;\n  font-size: 12px;\n  color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n  text-decoration: underline;\n}\n.PresetsPage_toggleCustom:hover {\n  opacity: 0.8;\n}\n.PresetsPage_label {\n  font-size: 14px;\n  line-height: 1.5;\n  font-weight: 500;\n}\n.PresetsPage_input {\n  width: 100%;\n  min-width: 0;\n  box-sizing: border-box;\n  min-height: 36px;\n}\n.PresetsPage_input:focus-within {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));\n  outline-offset: 3px;\n}\n.PresetsPage_field[data-state=error] .PresetsPage_input {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_field[data-state=disabled] .PresetsPage_input {\n  opacity: 0.5;\n}\n.PresetsPage_control {\n  width: 100%;\n  min-width: 0;\n  box-sizing: border-box;\n  padding: 10px 12px;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-md);\n  font: inherit;\n  font-size: 14px;\n  line-height: 1.6;\n}\n.PresetsPage_control:hover:not(:disabled) {\n  border-color: var(--dsw-alias-border-l4);\n}\n.PresetsPage_control:focus-visible,\n.PresetsPage_advancedToggle:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));\n  outline-offset: 3px;\n}\n.PresetsPage_control:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.PresetsPage_field[data-state=error] .PresetsPage_control {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n.PresetsPage_body,\n.PresetsPage_source {\n  resize: vertical;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  min-height: 240px;\n}\n.PresetsPage_source {\n  min-height: 400px;\n}\n.PresetsPage_advanced {\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n.PresetsPage_advancedToggle {\n  cursor: pointer;\n  padding-block: 16px;\n  font-size: 14px;\n  font-weight: 500;\n}\n.PresetsPage_advancedFields {\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n  padding-bottom: 8px;\n}\n.PresetsPage_formFooter {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 16px;\n  padding-top: 16px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n.PresetsPage_confirmText {\n  margin: 0 0 16px;\n  line-height: 1.6;\n  overflow-wrap: anywhere;\n}\n@media (max-width: 640px) {\n  .PresetsPage_page {\n    padding-top: 20px;\n  }\n  .PresetsPage_header {\n    flex-direction: column;\n    gap: 16px;\n  }\n  .PresetsPage_header .PresetsPage_actions {\n    width: 100%;\n  }\n  .PresetsPage_cardHeader {\n    flex-direction: column;\n    gap: 12px;\n  }\n  .PresetsPage_cardActions,\n  .PresetsPage_rowActions {\n    width: 100%;\n    justify-content: flex-end;\n  }\n  .PresetsPage_action,\n  .PresetsPage_input {\n    min-height: 38px;\n  }\n  .PresetsPage_formFooter {\n    align-items: flex-start;\n  }\n  .PresetsPage_formFooter .PresetsPage_actions {\n    width: 100%;\n  }\n}\n";const module={exports:{}};const exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  PANEL_ID: () => PANEL_ID,
  PANEL_LABEL: () => PANEL_LABEL,
  SubagentIcon: () => SubagentIcon,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react2 = require("react");

// src/preset-contract.ts
var PRESETS_CHANNEL = "/api";
var PRESETS_ENDPOINT_PREFIX = "subagent-presets/";
var PRESET_KEYS = ["name", "display_name", "description", "model", "thinking", "deep", "background", "maxRounds"];

// src/client/PresetsPage.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/presets-state.ts
function saveRequest(draft) {
  const { original, mode } = draft;
  const updating = mode === "edit" || mode === "repair";
  const request = { id: updating ? original.id : draft.fields.name ?? "", version: updating ? original.version : null };
  if (mode === "repair") return { ...request, source: draft.source };
  const patch = {};
  for (const key of PRESET_KEYS) {
    if (updating && key === "name") continue;
    const value = draft.fields[key] ?? "";
    const before = updating ? original.fields[key] ?? "" : "";
    if (value !== before) patch[key] = value === "" ? null : value;
  }
  if (Object.keys(patch).length) request.patch = patch;
  if (updating ? draft.body !== original.body : draft.body !== "") request.body = draft.body;
  return request;
}
function isDirty(draft) {
  if (!draft) return false;
  if (draft.mode === "repair") return draft.source !== draft.original.source;
  const request = saveRequest(draft);
  return Boolean(request.patch || (draft.mode === "edit" ? request.body !== void 0 : draft.body !== ""));
}
var caught = (error) => ({ error: error instanceof Error ? error.message : String(error), code: "transport" });
var PresetsController = class {
  snapshot = { status: "idle", busy: false, catalogStatus: "idle" };
  listeners = /* @__PURE__ */ new Set();
  disposed = false;
  loading;
  catalogLoading;
  client;
  constructor(client) {
    this.client = client;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
  publish(patch) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  /** Opening refreshes the roster without replacing an in-progress draft or its revision. */
  open() {
    void this.load();
    void this.loadModels();
  }
  load() {
    if (this.loading) return this.loading;
    this.publish({ status: "loading" });
    this.loading = this.fetchList().finally(() => {
      this.loading = void 0;
    });
    return this.loading;
  }
  async fetchList() {
    try {
      const reply = await this.client.call("list", null);
      if (reply.ok) this.publish({ status: "ready", list: reply.value, listError: void 0 });
      else this.publish({ status: "error", listError: reply });
    } catch (error) {
      this.publish({ status: "error", listError: caught(error) });
    }
  }
  loadModels() {
    if (this.catalogLoading) return this.catalogLoading;
    this.publish({ catalogStatus: "loading", catalogError: void 0 });
    this.catalogLoading = this.client.models().then(
      (catalog) => this.publish({ catalogStatus: "ready", catalog, catalogError: void 0 }),
      (error) => this.publish({ catalogStatus: "error", catalogError: caught(error).error })
    ).finally(() => {
      this.catalogLoading = void 0;
    });
    return this.catalogLoading;
  }
  start(mode, original) {
    if (this.snapshot.busy || this.snapshot.draft) return;
    if (original && (!original.structured || original.error) && mode !== "repair") mode = "repair";
    const fields = mode === "create" ? {} : { ...original.fields };
    if (mode === "copy") delete fields.name;
    if (mode === "edit" || mode === "repair") fields.name = original.id;
    this.publish({ draft: { mode, original, fields, body: original?.body ?? "", source: original?.source ?? "", advanced: false }, failure: void 0, notice: void 0 });
  }
  field(key, value) {
    const draft = this.snapshot.draft;
    if (!draft || this.snapshot.busy || this.snapshot.confirmation || (draft.mode === "edit" || draft.mode === "repair") && key === "name") return;
    this.publish({ draft: { ...draft, fields: { ...draft.fields, [key]: value } }, failure: void 0 });
  }
  text(key, value) {
    if (!this.snapshot.draft || this.snapshot.busy || this.snapshot.confirmation) return;
    this.publish({ draft: { ...this.snapshot.draft, [key]: value }, failure: void 0 });
  }
  advanced(open) {
    if (this.snapshot.draft) this.publish({ draft: { ...this.snapshot.draft, advanced: open } });
  }
  discard(action) {
    if (this.snapshot.busy || this.snapshot.confirmation) return;
    if (isDirty(this.snapshot.draft)) this.publish({ confirmation: { kind: "discard", action } });
    else this.finishDiscard(action);
  }
  finishDiscard(action) {
    if (action === "repair") {
      const original = this.snapshot.draft?.original;
      this.publish({ draft: void 0, confirmation: void 0, failure: void 0 });
      if (original) this.start("repair", original);
      return;
    }
    this.publish({ draft: void 0, confirmation: void 0, failure: void 0, notice: void 0 });
    if (action === "refresh") this.open();
  }
  askDelete(entry) {
    if (!this.snapshot.busy && !this.snapshot.confirmation) this.publish({ confirmation: { kind: "delete", entry }, failure: void 0 });
  }
  cancelConfirmation() {
    if (!this.snapshot.busy) this.publish({ confirmation: void 0 });
  }
  async confirm() {
    const confirmation = this.snapshot.confirmation;
    if (!confirmation || this.snapshot.busy) return;
    if (confirmation.kind === "discard") this.finishDiscard(confirmation.action);
    else if (confirmation.kind === "display") await this.persist({ ...confirmation.request, confirmDisplayName: true });
    else {
      this.publish({ busy: true, confirmation: void 0, failure: void 0 });
      try {
        const reply = await this.client.call("remove", { id: confirmation.entry.id, version: confirmation.entry.version });
        if (!reply.ok) this.publish({ failure: reply });
        else {
          this.publish({ notice: `\u5DF2\u5220\u9664 ${confirmation.entry.id}.md` });
          await this.loading;
          await this.load();
        }
      } catch (error) {
        this.publish({ failure: caught(error) });
      } finally {
        this.publish({ busy: false });
      }
    }
  }
  async save() {
    const draft = this.snapshot.draft;
    if (!draft || this.snapshot.busy || this.snapshot.confirmation) return;
    const request = saveRequest(draft);
    const previous = draft.original?.fields.display_name ?? "";
    if (draft.mode === "edit" && (draft.fields.display_name ?? "") !== previous) this.publish({ confirmation: { kind: "display", request } });
    else await this.persist(request);
  }
  async persist(request) {
    this.publish({ busy: true, confirmation: void 0, failure: void 0 });
    try {
      const reply = await this.client.call("save", request);
      if (!reply.ok) {
        if (reply.code === "confirmation_required") this.publish({ confirmation: { kind: "display", request } });
        else this.publish({ failure: reply });
      } else {
        this.publish({ draft: void 0, notice: `\u5DF2\u4FDD\u5B58 ${reply.value.id}.md` });
        await this.loading;
        await this.load();
      }
    } catch (error) {
      this.publish({ failure: caught(error) });
    } finally {
      this.publish({ busy: false });
    }
  }
};

// src/client/PresetsPage.module.css
var PresetsPage_default = {
  page: "PresetsPage_page",
  content: "PresetsPage_content",
  header: "PresetsPage_header",
  headingGroup: "PresetsPage_headingGroup",
  title: "PresetsPage_title",
  actions: "PresetsPage_actions",
  rowActions: "PresetsPage_rowActions",
  action: "PresetsPage_action",
  directory: "PresetsPage_directory",
  directoryHeader: "PresetsPage_directoryHeader",
  directoryIcon: "PresetsPage_directoryIcon",
  directoryPath: "PresetsPage_directoryPath",
  hint: "PresetsPage_hint",
  status: "PresetsPage_status",
  list: "PresetsPage_list",
  card: "PresetsPage_card",
  row: "PresetsPage_row",
  cardHeader: "PresetsPage_cardHeader",
  cardIdentity: "PresetsPage_cardIdentity",
  avatar: "PresetsPage_avatar",
  avatarError: "PresetsPage_avatarError",
  avatarIcon: "PresetsPage_avatarIcon",
  titleArea: "PresetsPage_titleArea",
  titleRow: "PresetsPage_titleRow",
  rowHeading: "PresetsPage_rowHeading",
  cardTitle: "PresetsPage_cardTitle",
  rowTitle: "PresetsPage_rowTitle",
  filePill: "PresetsPage_filePill",
  identifier: "PresetsPage_identifier",
  statusBadge: "PresetsPage_statusBadge",
  badge: "PresetsPage_badge",
  statusDot: "PresetsPage_statusDot",
  cardActions: "PresetsPage_cardActions",
  danger: "PresetsPage_danger",
  cardBody: "PresetsPage_cardBody",
  rowContent: "PresetsPage_rowContent",
  description: "PresetsPage_description",
  cardErrorBox: "PresetsPage_cardErrorBox",
  cardErrorHeader: "PresetsPage_cardErrorHeader",
  cardErrorText: "PresetsPage_cardErrorText",
  unstructuredNotice: "PresetsPage_unstructuredNotice",
  cardMeta: "PresetsPage_cardMeta",
  metaChip: "PresetsPage_metaChip",
  chipIcon: "PresetsPage_chipIcon",
  chipLabel: "PresetsPage_chipLabel",
  chipValue: "PresetsPage_chipValue",
  errorSummary: "PresetsPage_errorSummary",
  diagnostic: "PresetsPage_diagnostic",
  catalogError: "PresetsPage_catalogError",
  errorLink: "PresetsPage_errorLink",
  errorTitle: "PresetsPage_errorTitle",
  errorText: "PresetsPage_errorText",
  fieldError: "PresetsPage_fieldError",
  notice: "PresetsPage_notice",
  empty: "PresetsPage_empty",
  emptyIcon: "PresetsPage_emptyIcon",
  emptyTitle: "PresetsPage_emptyTitle",
  form: "PresetsPage_form",
  field: "PresetsPage_field",
  fieldHeader: "PresetsPage_fieldHeader",
  toggleCustom: "PresetsPage_toggleCustom",
  label: "PresetsPage_label",
  input: "PresetsPage_input",
  control: "PresetsPage_control",
  advancedToggle: "PresetsPage_advancedToggle",
  body: "PresetsPage_body",
  source: "PresetsPage_source",
  advanced: "PresetsPage_advanced",
  advancedFields: "PresetsPage_advancedFields",
  formFooter: "PresetsPage_formFooter",
  confirmText: "PresetsPage_confirmText"
};

// src/client/PresetsPage.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var titles = { create: "\u65B0\u5EFA\u5B50\u667A\u80FD\u4F53", copy: "\u590D\u5236\u5B50\u667A\u80FD\u4F53", edit: "\u7F16\u8F91\u5B50\u667A\u80FD\u4F53", repair: "\u539F\u6587\u4FEE\u590D" };
var labels = { name: "\u5185\u90E8\u540D\u79F0", display_name: "\u663E\u793A\u540D", description: "\u804C\u8D23\u63CF\u8FF0", model: "\u6A21\u578B", thinking: "\u601D\u8003\u5F3A\u5EA6", deep: "\u6DF1\u5EA6", background: "\u540E\u53F0\u8FD0\u884C", maxRounds: "\u8F6E\u6570\u4E0A\u9650", body: "\u7CFB\u7EDF\u63D0\u793A\u8BCD", source: "\u5B8C\u6574 Markdown \u539F\u6587" };
function WarningIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "9", x2: "12", y2: "13" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })
  ] });
}
function FolderIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className, width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" }) });
}
function ModelIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "4", y: "4", width: "16", height: "16", rx: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "9", y: "9", width: "6", height: "6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" })
  ] });
}
function ThinkingIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 18h6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10 22h4" })
  ] });
}
function BackgroundIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "12 6 12 12 16 14" })
  ] });
}
function DeepIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "6", r: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "18", r: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "18", cy: "9", r: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 9v6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 9h3a3 3 0 0 1 3 3v-3" })
  ] });
}
function RoundsIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m17 2 4 4-4 4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 11v-1a4 4 0 0 1 4-4h14" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m7 22-4-4 4-4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M21 13v1a4 4 0 0 1-4 4H3" })
  ] });
}
function EmptyIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, width: "40", height: "40", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "11", width: "18", height: "10", rx: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "5", r: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 7v4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "8", y1: "16", x2: "8.01", y2: "16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "16", y1: "16", x2: "16.01", y2: "16" })
  ] });
}
function AgentAvatar({ name, isError }) {
  if (isError) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${PresetsPage_default.avatar} ${PresetsPage_default.avatarError}`, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WarningIcon, { className: PresetsPage_default.avatarIcon }) });
  }
  const initial = name.trim().slice(0, 1).toUpperCase();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: PresetsPage_default.avatar, "aria-hidden": "true", children: initial || "?" });
}
function PresetsPage({ controller }) {
  const state = (0, import_react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const { draft, confirmation, busy } = state;
  const issue = state.failure ?? state.listError;
  const failure = issue?.field === "id" ? { ...issue, field: "name" } : issue;
  const prefix = (0, import_react.useId)();
  const heading = (0, import_react.useRef)(null);
  const errorSummary = (0, import_react.useRef)(null);
  const [customModelMode, setCustomModelMode] = (0, import_react.useState)(false);
  const view = draft ? `${draft.mode}:${draft.original?.id ?? ""}` : "list";
  (0, import_react.useEffect)(() => {
    controller.open();
  }, [controller]);
  (0, import_react.useEffect)(() => {
    heading.current?.focus();
  }, [view]);
  (0, import_react.useEffect)(() => {
    setCustomModelMode(false);
  }, [view]);
  (0, import_react.useEffect)(() => {
    if (failure) {
      if (["deep", "background", "maxRounds"].includes(failure.field ?? "")) controller.advanced(true);
      errorSummary.current?.focus();
    }
  }, [controller, failure]);
  const fieldId = (key) => `${prefix}-${key}`;
  const fieldError = (key) => failure?.field === key ? failure.error : void 0;
  const common = (key) => ({ id: fieldId(key), disabled: busy, "aria-invalid": Boolean(fieldError(key)), "aria-describedby": `${fieldId(key)}-hint${fieldError(key) ? ` ${fieldId(key)}-error` : ""}` });
  const field = (key, hint, control, extraHeader) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.field, "data-state": fieldError(key) ? "error" : busy ? "disabled" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.fieldHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: PresetsPage_default.label, htmlFor: fieldId(key), children: labels[key] }),
      extraHeader
    ] }),
    control,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, id: `${fieldId(key)}-hint`, children: hint }),
    fieldError(key) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.fieldError, id: `${fieldId(key)}-error`, children: fieldError(key) })
  ] });
  const input = (key, hint, extra = {}) => field(
    key,
    hint,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { ...common(key), ...extra, className: PresetsPage_default.input, value: draft?.fields[key] ?? "", onChange: (event) => controller.field(key, event.target.value) })
  );
  const select = (key, hint, options, disabled = false) => field(
    key,
    hint,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { ...common(key), disabled: disabled || busy, className: PresetsPage_default.control, value: draft?.fields[key] ?? "", onChange: (event) => controller.field(key, event.target.value), children: options.map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value, children: label }, value)) })
  );
  const editable = draft?.mode === "create" || draft?.mode === "copy";
  const raw = draft?.mode === "repair";
  const summaryField = failure?.field && failure.field in labels ? raw && failure.field !== "source" ? "source" : failure.field : void 0;
  const catalogGroups = state.catalog?.groups ?? [];
  const defaultModelSelection = state.catalog?.default;
  const defaultModelLabel = defaultModelSelection ? `\u7EE7\u627F\u9ED8\u8BA4 (${defaultModelSelection.provider}/${defaultModelSelection.model})` : "\u7EE7\u627F\u9ED8\u8BA4";
  const currentModel = draft?.fields[key_of("model")] ?? "";
  function key_of(k) {
    return k;
  }
  const isModelInCatalog = currentModel === "" || catalogGroups.some((g) => g.models.some((m) => `${g.id}/${m.id}` === currentModel));
  const onModelChange = (nextModel) => {
    controller.field("model", nextModel);
    const effectiveRoute = nextModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : "");
    let targetModelObj;
    for (const group of catalogGroups) {
      for (const m of group.models) {
        if (`${group.id}/${m.id}` === effectiveRoute) {
          targetModelObj = m;
          break;
        }
      }
      if (targetModelObj) break;
    }
    if (targetModelObj) {
      const efforts = targetModelObj.reasoning?.efforts ?? [];
      if (efforts.length === 0) {
        if (draft?.fields.thinking) controller.field("thinking", "");
      } else if (draft?.fields.thinking && !efforts.some((e) => e.id === draft.fields.thinking)) {
        controller.field("thinking", "");
      }
    }
  };
  const effectiveModelRoute = currentModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : "");
  let effectiveModelObj;
  for (const group of catalogGroups) {
    for (const m of group.models) {
      if (`${group.id}/${m.id}` === effectiveModelRoute) {
        effectiveModelObj = m;
        break;
      }
    }
    if (effectiveModelObj) break;
  }
  let thinkingOptions = [];
  let thinkingHint = "\u7559\u7A7A\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E\u3002";
  let thinkingDisabled = false;
  if (effectiveModelObj) {
    const reasoning = effectiveModelObj.reasoning;
    if (reasoning?.efforts && reasoning.efforts.length > 0) {
      const defaultEffortNote = reasoning.defaultEffort ? ` (${reasoning.defaultEffort})` : "";
      thinkingOptions = [
        ["", `\u7EE7\u627F\u9ED8\u8BA4${defaultEffortNote}`],
        ...reasoning.efforts.map((e) => [
          e.id,
          e.name && e.name.toLowerCase() !== e.id.toLowerCase() ? `${e.name} (${e.id})` : e.id
        ])
      ];
      if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
        thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (\u672A\u5728\u5217\u8868\u4E2D)`]);
      }
      thinkingHint = `\u7559\u7A7A\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E\u3002\u5F53\u524D\u6A21\u578B\u53EF\u7528\uFF1A${reasoning.efforts.map((e) => e.id).join(" / ")}\u3002`;
    } else {
      thinkingOptions = [["", "\u4E0D\u652F\u6301\u601D\u8003\u5F3A\u5EA6\uFF08\u7EE7\u627F/\u5173\u95ED\uFF09"]];
      if (draft?.fields.thinking) {
        thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (\u8BE5\u6A21\u578B\u4E0D\u652F\u6301)`]);
      }
      thinkingHint = `\u5F53\u524D\u6A21\u578B\uFF08${effectiveModelObj.name}\uFF09\u4E0D\u652F\u6301\u601D\u8003\u5F3A\u5EA6\u8BBE\u7F6E\u3002`;
      thinkingDisabled = true;
    }
  } else {
    const fallbackLevels = ["off", "low", "medium", "high", "xhigh", "max"];
    thinkingOptions = [
      ["", "\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E"],
      ...fallbackLevels.map((l) => [l, l])
    ];
    if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
      thinkingOptions.push([draft.fields.thinking, draft.fields.thinking]);
    }
    if (state.catalogStatus === "loading") {
      thinkingHint = "\u6B63\u5728\u52A0\u8F7D\u53EF\u7528\u601D\u8003\u5F3A\u5EA6\u2026";
    } else if (currentModel !== "") {
      thinkingHint = "\u672A\u5728\u6A21\u578B\u76EE\u5F55\u4E2D\u627E\u5230\u8BE5\u6A21\u578B\uFF0C\u63D0\u4F9B\u6807\u51C6\u601D\u8003\u5F3A\u5EA6\u9009\u9879\u3002";
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: PresetsPage_default.page, "data-view": draft?.mode ?? "list", "aria-busy": busy || state.status === "loading", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.content, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: PresetsPage_default.header, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.headingGroup, children: [
          draft && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "ghost", disabled: busy, onClick: () => controller.discard("list"), children: "\u8FD4\u56DE\u5217\u8868" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { ref: heading, tabIndex: -1, className: PresetsPage_default.title, children: draft ? titles[draft.mode] : "\u5B50\u667A\u80FD\u4F53" }),
          draft?.mode === "copy" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.hint, children: [
            "\u590D\u5236\u81EA ",
            draft.original?.id,
            ".md\uFF0C\u4FDD\u5B58\u4E3A\u65B0\u6587\u4EF6\u3002"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "outline", disabled: busy || state.status === "loading", onClick: () => controller.discard("refresh"), children: state.status === "loading" ? "\u6B63\u5728\u5237\u65B0\u2026" : "\u5237\u65B0" }),
          !draft && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", disabled: busy || state.status !== "ready", onClick: () => controller.start("create"), children: "\u65B0\u5EFA\u5B50\u667A\u80FD\u4F53" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.directory, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.directoryHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderIcon, { className: PresetsPage_default.directoryIcon }),
          state.list && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.directoryPath, children: [
            "\u76EE\u5F55\uFF1A",
            state.list.directory
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: "\u6307\u5411\u6B64\u76EE\u5F55\u7684 profile \u5171\u4EAB\u9884\u8BBE\u3002\u4FEE\u6539\u5C06\u7528\u4E8E\u540E\u7EED\u8C03\u7528\uFF0C\u5DF2\u8FD0\u884C\u7684\u4EFB\u52A1\u4FDD\u6301\u539F\u63D0\u793A\u8BCD\u3002" })
      ] }),
      failure && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: errorSummary, tabIndex: -1, role: "alert", className: PresetsPage_default.errorSummary, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorTitle, children: state.failure ? "\u64CD\u4F5C\u672A\u5B8C\u6210" : "\u8BFB\u53D6\u5931\u8D25" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: failure.error }),
        draft && summaryField && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { className: PresetsPage_default.errorLink, href: `#${fieldId(summaryField)}`, onClick: (event) => {
          event.preventDefault();
          document.getElementById(fieldId(summaryField))?.focus();
        }, children: [
          "\u68C0\u67E5",
          labels[summaryField]
        ] }),
        draft && failure.code === "source_required" && draft.mode === "edit" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, onClick: () => controller.discard("repair"), children: "\u8F6C\u5230\u539F\u6587\u4FEE\u590D" })
      ] }),
      state.notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.notice, role: "status", children: state.notice }),
      !draft ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.status, role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u9884\u8BBE\u76EE\u5F55\u2026" }),
        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.hint, children: [
          "\u672A\u80FD\u8BFB\u53D6\u6700\u65B0\u76EE\u5F55\u3002\u8BF7\u68C0\u67E5\u4E0A\u65B9\u9519\u8BEF\u540E\u5237\u65B0",
          state.list ? "\uFF1B\u4E0B\u65B9\u4FDD\u7559\u4E0A\u6B21\u8BFB\u53D6\u7684\u5217\u8868\u3002" : "\u3002"
        ] }),
        state.status === "ready" && state.list?.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.empty, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyIcon, { className: PresetsPage_default.emptyIcon }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: PresetsPage_default.emptyTitle, children: "\u6B64\u76EE\u5F55\u6682\u65E0\u5B50\u667A\u80FD\u4F53" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: "\u521B\u5EFA\u4E00\u4E2A\u5B50\u667A\u80FD\u4F53\uFF0C\u586B\u5199\u5B83\u7684\u804C\u8D23\u548C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", onClick: () => controller.start("create"), children: "\u65B0\u5EFA\u5B50\u667A\u80FD\u4F53" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: PresetsPage_default.list, children: state.list?.entries.map((entry) => {
          const displayName = entry.fields.display_name || entry.id;
          const isThinkingActive = Boolean(entry.fields.thinking && entry.fields.thinking !== "off");
          const thinkingValue = entry.fields.thinking || "\u7EE7\u627F\u9ED8\u8BA4";
          const modelValue = entry.fields.model || "\u7EE7\u627F\u9ED8\u8BA4";
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "article",
            {
              className: `${PresetsPage_default.card} ${PresetsPage_default.row}`,
              "data-state": entry.error ? "error" : "ready",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardHeader, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardIdentity, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AgentAvatar, { name: displayName, isError: Boolean(entry.error) }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: PresetsPage_default.titleArea, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${PresetsPage_default.rowHeading} ${PresetsPage_default.titleRow}`, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: `${PresetsPage_default.rowTitle} ${PresetsPage_default.cardTitle}`, children: displayName }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${PresetsPage_default.identifier} ${PresetsPage_default.filePill}`, children: `${entry.id}.md` }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "span",
                        {
                          className: `${PresetsPage_default.badge} ${PresetsPage_default.statusBadge}`,
                          "data-status": entry.error ? "error" : entry.structured ? "ready" : "unstructured",
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.statusDot, "aria-hidden": "true" }),
                            entry.error ? "\u6587\u4EF6\u9519\u8BEF" : entry.structured ? "\u53EF\u7528" : "\u539F\u6587\u7F16\u8F91"
                          ]
                        }
                      )
                    ] }) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${PresetsPage_default.rowActions} ${PresetsPage_default.cardActions}`, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      import_dsh_client_ui_primitives.Button,
                      {
                        type: "button",
                        className: PresetsPage_default.action,
                        variant: "outline",
                        "aria-label": `${entry.error ? "\u4FEE\u590D" : "\u7F16\u8F91"} ${entry.id}`,
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.start(entry.error || !entry.structured ? "repair" : "edit", entry),
                        children: entry.error ? "\u539F\u6587\u4FEE\u590D" : entry.structured ? "\u7F16\u8F91" : "\u539F\u6587\u7F16\u8F91"
                      }
                    ),
                    !entry.error && entry.structured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      import_dsh_client_ui_primitives.Button,
                      {
                        type: "button",
                        className: PresetsPage_default.action,
                        variant: "outline",
                        "aria-label": `\u590D\u5236 ${entry.id}`,
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.start("copy", entry),
                        children: "\u590D\u5236"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      import_dsh_client_ui_primitives.Button,
                      {
                        type: "button",
                        className: `${PresetsPage_default.action} ${PresetsPage_default.danger}`,
                        "aria-label": `\u5220\u9664 ${entry.id}.md`,
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.askDelete(entry),
                        children: "\u5220\u9664"
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${PresetsPage_default.rowContent} ${PresetsPage_default.cardBody}`, children: entry.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardErrorBox, role: "alert", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardErrorHeader, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WarningIcon, {}),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u914D\u7F6E\u89E3\u6790\u5F02\u5E38" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: `${PresetsPage_default.errorText} ${PresetsPage_default.cardErrorText}`, children: entry.error })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.description, "data-empty": !entry.fields.description, children: entry.fields.description || "\u672A\u586B\u5199\u804C\u8D23\u63CF\u8FF0" }),
                  !entry.structured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.unstructuredNotice, children: "\u6B64\u6587\u4EF6\u9700\u8981\u901A\u8FC7\u539F\u6587\u7F16\u8F91\u4FDD\u7559\u7ED3\u6784\u3002" })
                ] }) }),
                !entry.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardMeta, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: PresetsPage_default.metaChip, "data-kind": "model", title: `\u6A21\u578B\u8DEF\u7531\uFF1A${modelValue}`, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelIcon, { className: PresetsPage_default.chipIcon }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipLabel, children: "\u6A21\u578B\uFF1A" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: modelValue })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "thinking",
                      "data-active": isThinkingActive ? "true" : "false",
                      "data-level": entry.fields.thinking || "default",
                      title: `\u601D\u8003\u5F3A\u5EA6\uFF1A${thinkingValue}`,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThinkingIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipLabel, children: "\u601D\u8003\u5F3A\u5EA6\uFF1A" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: thinkingValue })
                      ]
                    }
                  ),
                  entry.fields.background && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "background",
                      title: entry.fields.background === "true" ? "\u540E\u53F0\u53EF\u6301\u7EED\u4F1A\u8BDD" : "\u524D\u53F0\u4E00\u6B21\u6027\u8FD0\u884C",
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackgroundIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: entry.fields.background === "true" ? "\u540E\u53F0\u53EF\u6301\u7EED" : "\u524D\u53F0\u8FD0\u884C" })
                      ]
                    }
                  ),
                  entry.fields.deep !== void 0 && entry.fields.deep !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "deep",
                      title: entry.fields.deep === "0" ? "\u53F6\u5B50\u8282\u70B9\uFF1A\u7981\u6B62\u6D3E\u53D1\u5B50\u4EE3\u7406" : `\u6D3E\u53D1\u6DF1\u5EA6\uFF1A${entry.fields.deep}`,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeepIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: entry.fields.deep === "0" ? "\u53F6\u5B50(\u7981\u6D3E\u53D1)" : `\u6DF1\u5EA6\uFF1A${entry.fields.deep}` })
                      ]
                    }
                  ),
                  entry.fields.maxRounds && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "rounds",
                      title: `\u5355\u6B21\u4F1A\u8BDD\u8F6E\u6570\u4E0A\u9650\uFF1A${entry.fields.maxRounds} \u8F6E`,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoundsIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: PresetsPage_default.chipValue, children: [
                          "\u4E0A\u9650 ",
                          entry.fields.maxRounds,
                          " \u8F6E"
                        ] })
                      ]
                    }
                  )
                ] })
              ]
            },
            entry.id
          );
        }) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: PresetsPage_default.form, onSubmit: (event) => {
        event.preventDefault();
        void controller.save();
      }, children: [
        input("name", editable ? "\u65B0\u6587\u4EF6\u540D\u7B49\u4E8E\u5185\u90E8\u540D\u79F0\uFF1B\u4F7F\u7528\u5B89\u5168\u4E14\u552F\u4E00\u7684\u540D\u79F0\u3002" : "\u5185\u90E8\u540D\u79F0\u56FA\u5B9A\u4E3A\u5F53\u524D\u6587\u4EF6\u6807\u8BC6\uFF0C\u4E0D\u80FD\u901A\u8FC7\u7F16\u8F91\u6216\u4FEE\u590D\u6539\u540D\u3002", { readOnly: !editable, required: true }),
        raw ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          draft.original?.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.diagnostic, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorTitle, children: "\u539F\u6587\u4EF6\u8BCA\u65AD" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: draft.original.error })
          ] }),
          field("source", `\u5305\u542B frontmatter \u548C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u3002\u5C06 name \u7EA0\u6B63\u4E3A ${draft.original.id}\uFF1B\u4FDD\u5B58\u65F6\u6309\u540C\u4E00\u89C4\u5219\u6821\u9A8C\u3002`, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ...common("source"), className: `${PresetsPage_default.control} ${PresetsPage_default.source}`, value: draft.source, spellCheck: false, onChange: (event) => controller.text("source", event.target.value) }))
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          input("display_name", "\u53EF\u7559\u7A7A\uFF0C\u4F7F\u7528\u5185\u90E8\u540D\u79F0\u4F5C\u4E3A\u663E\u793A\u6807\u7B7E\u3002\u53D8\u66F4\u5DF2\u6709\u663E\u793A\u540D\u65F6\u4F1A\u63D0\u793A\u5386\u53F2\u4EFB\u52A1\u5F71\u54CD\u3002"),
          input("description", "\u4E00\u884C\u804C\u8D23\u63CF\u8FF0\uFF0C\u7528\u4E8E\u5E2E\u52A9\u9009\u62E9\u5408\u9002\u7684\u5B50\u667A\u80FD\u4F53\u3002"),
          customModelMode ? field(
            "model",
            "\u586B\u5199\u81EA\u5B9A\u4E49 provider/model \u8DEF\u7531\uFF08\u4F8B\u5982 openai/gpt-6.1-sol\uFF09\u6216\u7559\u7A7A\u7EE7\u627F\u9ED8\u8BA4\u3002",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { ...common("model"), className: PresetsPage_default.input, placeholder: "\u4F8B\u5982\uFF1Aopenai/gpt-6.1-sol", value: currentModel, onChange: (event) => onModelChange(event.target.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: PresetsPage_default.toggleCustom, onClick: () => setCustomModelMode(false), children: "\u4ECE\u5217\u8868\u9009\u62E9" })
          ) : field(
            "model",
            "\u4ECE\u5F53\u524D\u90E8\u7F72\u5DF2\u542F\u7528\u7684\u6A21\u578B\u4E2D\u9009\u62E9\uFF1B\u7559\u7A7A\u7EE7\u627F\u9ED8\u8BA4\u8BBE\u7F6E\u3002",
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                ...common("model"),
                className: PresetsPage_default.control,
                value: currentModel,
                onChange: (event) => {
                  const val = event.target.value;
                  if (val === "__custom__") setCustomModelMode(true);
                  else onModelChange(val);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: defaultModelLabel }),
                  catalogGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: group.name, children: group.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: `${group.id}/${m.id}`, children: [
                    m.name,
                    " (",
                    group.id,
                    "/",
                    m.id,
                    ")"
                  ] }, `${group.id}/${m.id}`)) }, group.id)),
                  !isModelInCatalog && currentModel !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: "\u5F53\u524D\u8BBE\u7F6E / \u672A\u5728\u76EE\u5F55\u4E2D", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: currentModel, children: currentModel }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "__custom__", children: "\u81EA\u5B9A\u4E49\u8F93\u5165\u2026" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: PresetsPage_default.toggleCustom, onClick: () => setCustomModelMode(true), children: "\u81EA\u5B9A\u4E49\u8F93\u5165" })
          ),
          state.catalogStatus === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, role: "status", children: "\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\u76EE\u5F55\u2026" }),
          state.catalogError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.catalogError, role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.errorText, children: [
              "\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A",
              state.catalogError
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: "\u5F53\u524D\u6A21\u578B\u503C\u4ECD\u4FDD\u7559\uFF0C\u53EF\u7EE7\u7EED\u4F7F\u7528\u81EA\u5B9A\u4E49\u8DEF\u7531\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, disabled: busy || state.catalogStatus === "loading", onClick: () => {
              void controller.loadModels();
            }, children: "\u91CD\u8BD5\u6A21\u578B\u76EE\u5F55" })
          ] }),
          state.catalog?.failures.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.errorText, children: [
            "\u6A21\u578B\u76EE\u5F55 ",
            item.name,
            "\uFF1A",
            item.message
          ] }, item.id)),
          select("thinking", thinkingHint, thinkingOptions, thinkingDisabled),
          field("body", "\u4F5C\u4E3A\u7CFB\u7EDF\u63D0\u793A\u8BCD\u539F\u6837\u4F7F\u7528\uFF0C\u652F\u6301 Markdown\u3002", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ...common("body"), className: `${PresetsPage_default.control} ${PresetsPage_default.body}`, value: draft.body, onChange: (event) => controller.text("body", event.target.value) })),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: PresetsPage_default.advanced, open: draft.advanced, onToggle: (event) => controller.advanced(event.currentTarget.open), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: PresetsPage_default.advancedToggle, children: "\u9AD8\u7EA7\u8BBE\u7F6E" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.advancedFields, children: [
              input("deep", "\u7559\u7A7A\u6CBF\u7528\u7F3A\u7701\u6DF1\u5EA6 1\uFF1B0 \u7981\u6B62\u6B64\u89D2\u8272\u7EE7\u7EED\u6D3E\u53D1\u5B50\u4EE3\u7406\u3002", { type: "number", min: 0, step: 1, placeholder: "\u7EE7\u627F\uFF081\uFF09" }),
              select("background", "\u7559\u7A7A\u6CBF\u7528\u7F3A\u7701\u524D\u53F0\uFF1Btrue \u4E3A\u540E\u53F0\u53EF\u6301\u7EED\u4F1A\u8BDD\u3002", [["", "\u7EE7\u627F\uFF08\u524D\u53F0\uFF09"], ["false", "false\uFF08\u524D\u53F0\uFF09"], ["true", "true\uFF08\u540E\u53F0\uFF09"]]),
              input("maxRounds", "\u7559\u7A7A\u7EE7\u627F\u5168\u5C40\u8F6E\u6570\u4E0A\u9650\uFF1B\u586B\u5199\u6B63\u6574\u6570\u3002", { type: "number", min: 1, step: 1, placeholder: "\u7EE7\u627F\u5168\u5C40" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: PresetsPage_default.formFooter, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, role: "status", children: busy ? "\u6B63\u5728\u4FDD\u5B58\u2026" : isDirty(draft) ? "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539" : "\u5C1A\u672A\u4FEE\u6539" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "outline", disabled: busy, onClick: () => controller.discard("list"), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "submit", className: PresetsPage_default.action, variant: "primary", disabled: busy || !editable && !isDirty(draft), children: busy ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58\u9884\u8BBE" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Modal, { open: Boolean(confirmation), onClose: () => controller.cancelConfirmation(), title: confirmation?.kind === "delete" ? `\u5220\u9664 ${confirmation.entry.id}.md\uFF1F` : confirmation?.kind === "display" ? "\u786E\u8BA4\u663E\u793A\u540D\u53D8\u66F4" : "\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF1F", closeLabel: "\u53D6\u6D88\u786E\u8BA4", footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, "data-modal-autofocus": true, disabled: busy, onClick: () => controller.cancelConfirmation(), children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", disabled: busy, onClick: () => {
        void controller.confirm();
      }, children: confirmation?.kind === "delete" ? "\u786E\u8BA4\u5220\u9664" : confirmation?.kind === "display" ? "\u786E\u8BA4\u5E76\u4FDD\u5B58" : "\u653E\u5F03\u4FEE\u6539" })
    ] }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.confirmText, children: confirmation?.kind === "delete" ? `\u5C06\u5220\u9664 ${confirmation.entry.id}.md\u3002\u6240\u6709\u6307\u5411\u6B64\u76EE\u5F55\u7684 profile \u90FD\u5C06\u5931\u53BB\u6B64\u9884\u8BBE\uFF1B\u5220\u9664\u540E\u65E0\u6CD5\u4ECE\u672C\u9875\u6062\u590D\u3002` : confirmation?.kind === "display" ? "\u663E\u793A\u540D\u65B0\u589E\u3001\u6E05\u9664\u6216\u53D8\u66F4\u4F1A\u6539\u53D8\u67E5\u627E\u5386\u53F2\u4EFB\u52A1\u65F6\u4F7F\u7528\u7684\u663E\u793A\u6807\u7B7E\u3002\u65E7\u4EFB\u52A1\u53EF\u80FD\u65E0\u6CD5\u518D\u6309 name \u7EED\u8DD1\u6216\u8FFD\u95EE\uFF0C\u5386\u53F2\u8BB0\u5F55\u4E0D\u4F1A\u8FC1\u79FB\u3002" : confirmation?.kind === "discard" && confirmation.action === "refresh" ? "\u5237\u65B0\u5C06\u4E22\u5F03\u5F53\u524D\u8F93\u5165\u5E76\u91CD\u65B0\u8BFB\u53D6\u76EE\u5F55\u3002" : confirmation?.kind === "discard" && confirmation.action === "repair" ? "\u5C06\u4E22\u5F03\u5F53\u524D\u8868\u5355\u8F93\u5165\uFF0C\u5E76\u6253\u5F00\u8BFB\u53D6\u65F6\u7684\u5B8C\u6574\u539F\u6587\u3002" : "\u8FD4\u56DE\u5217\u8868\u5C06\u4E22\u5F03\u5F53\u524D\u8F93\u5165\u3002" }),
      confirmation?.kind === "delete" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.directoryPath, children: [
        "\u76EE\u5F55\uFF1A",
        state.list?.directory
      ] }),
      confirmation?.kind === "display" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: PresetsPage_default.directoryPath, children: [
        "\u76EE\u6807\uFF1A",
        confirmation.request.id,
        ".md"
      ] })
    ] })
  ] });
}

// src/client/index.ts
var PANEL_ID = "subagent-presets";
var PANEL_LABEL = "\u5B50\u667A\u80FD\u4F53";
var inject = ["slots", "layout", "connection", "remote", "remote.session"];
function SubagentIcon({ size }) {
  const edge = typeof size === "number" && size > 0 ? size : 16;
  return (0, import_react2.createElement)(
    "svg",
    {
      width: edge,
      height: edge,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    (0, import_react2.createElement)("circle", { cx: 6.5, cy: 5, r: 2 }),
    (0, import_react2.createElement)("path", { d: "M6.5 7v12" }),
    (0, import_react2.createElement)("path", { d: "M6.5 11c3.5 0 3.5-4.5 7-4.5" }),
    (0, import_react2.createElement)("path", { d: "M6.5 11c3.5 0 3.5 4.5 7 4.5" }),
    (0, import_react2.createElement)("circle", { cx: 16.5, cy: 6.5, r: 2 }),
    (0, import_react2.createElement)("circle", { cx: 16.5, cy: 15.5, r: 2 })
  );
}
function apply(ctx) {
  const client = {
    async call(endpoint, payload) {
      const result = await ctx.connection.rpc.call(PRESETS_CHANNEL, `${PRESETS_ENDPOINT_PREFIX}${endpoint}`, payload);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    async models() {
      const result = await ctx.remote.session.modelCatalog();
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    }
  };
  const controller = new PresetsController(client);
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "@aiwayds/dsh-subagent-registry";
    style.textContent = __PRESETS_CSS__;
    document.head.append(style);
    return () => {
      style.remove();
      controller.dispose();
    };
  }, "subagent-presets: style and controller");
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID,
    inject: () => ({ controller })
  }, PresetsPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    label: PANEL_LABEL,
    order: 50
  }, SubagentIcon));
}

return module.exports;}});
