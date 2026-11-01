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

// src/client/strings.ts
var LANGUAGES = ["zh", "en", "ru"];
var zh = {
  titles: { create: "\u65B0\u5EFA\u5B50\u667A\u80FD\u4F53", copy: "\u590D\u5236\u5B50\u667A\u80FD\u4F53", edit: "\u7F16\u8F91\u5B50\u667A\u80FD\u4F53", repair: "\u539F\u6587\u4FEE\u590D" },
  labels: { name: "\u5185\u90E8\u540D\u79F0", display_name: "\u663E\u793A\u540D", description: "\u804C\u8D23\u63CF\u8FF0", model: "\u6A21\u578B", thinking: "\u601D\u8003\u5F3A\u5EA6", deep: "\u6DF1\u5EA6", background: "\u540E\u53F0\u8FD0\u884C", maxRounds: "\u8F6E\u6570\u4E0A\u9650", body: "\u7CFB\u7EDF\u63D0\u793A\u8BCD", source: "\u5B8C\u6574 Markdown \u539F\u6587" },
  backToList: "\u8FD4\u56DE\u5217\u8868",
  agentsTitle: "\u5B50\u667A\u80FD\u4F53",
  copiedFrom: (id) => `\u590D\u5236\u81EA ${id}.md\uFF0C\u4FDD\u5B58\u4E3A\u65B0\u6587\u4EF6\u3002`,
  refreshing: "\u6B63\u5728\u5237\u65B0\u2026",
  refresh: "\u5237\u65B0",
  createAgent: "\u65B0\u5EFA\u5B50\u667A\u80FD\u4F53",
  directory: (path) => `\u76EE\u5F55\uFF1A${path}`,
  directoryHint: "\u6307\u5411\u6B64\u76EE\u5F55\u7684 profile \u5171\u4EAB\u9884\u8BBE\u3002\u4FEE\u6539\u5C06\u7528\u4E8E\u540E\u7EED\u8C03\u7528\uFF0C\u5DF2\u8FD0\u884C\u7684\u4EFB\u52A1\u4FDD\u6301\u539F\u63D0\u793A\u8BCD\u3002",
  errorActionIncomplete: "\u64CD\u4F5C\u672A\u5B8C\u6210",
  errorReadFailed: "\u8BFB\u53D6\u5931\u8D25",
  checkField: (label) => `\u68C0\u67E5${label}`,
  goToRepair: "\u8F6C\u5230\u539F\u6587\u4FEE\u590D",
  loadingPresets: "\u6B63\u5728\u8BFB\u53D6\u9884\u8BBE\u76EE\u5F55\u2026",
  refreshFailed: (hasList) => `\u672A\u80FD\u8BFB\u53D6\u6700\u65B0\u76EE\u5F55\u3002\u8BF7\u68C0\u67E5\u4E0A\u65B9\u9519\u8BEF\u540E\u5237\u65B0${hasList ? "\uFF1B\u4E0B\u65B9\u4FDD\u7559\u4E0A\u6B21\u8BFB\u53D6\u7684\u5217\u8868\u3002" : "\u3002"}`,
  emptyTitle: "\u6B64\u76EE\u5F55\u6682\u65E0\u5B50\u667A\u80FD\u4F53",
  emptyHint: "\u521B\u5EFA\u4E00\u4E2A\u5B50\u667A\u80FD\u4F53\uFF0C\u586B\u5199\u5B83\u7684\u804C\u8D23\u548C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u3002",
  inheritDefault: "\u7EE7\u627F\u9ED8\u8BA4",
  inheritDefaultRoute: (route) => `\u7EE7\u627F\u9ED8\u8BA4 (${route})`,
  inheritDefaultWithNote: (note) => `\u7EE7\u627F\u9ED8\u8BA4${note}`,
  thinkingHint: "\u7559\u7A7A\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E\u3002",
  thinkingHintEfforts: (efforts) => `\u7559\u7A7A\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E\u3002\u5F53\u524D\u6A21\u578B\u53EF\u7528\uFF1A${efforts}\u3002`,
  thinkingInheritDeployment: "\u7EE7\u627F\u5F53\u524D\u90E8\u7F72\u7684\u601D\u8003\u8BBE\u7F6E",
  thinkingUnlisted: (id) => `${id} (\u672A\u5728\u5217\u8868\u4E2D)`,
  thinkingUnsupportedOption: "\u4E0D\u652F\u6301\u601D\u8003\u5F3A\u5EA6\uFF08\u7EE7\u627F/\u5173\u95ED\uFF09",
  thinkingUnsupportedValue: (id) => `${id} (\u8BE5\u6A21\u578B\u4E0D\u652F\u6301)`,
  thinkingUnsupportedHint: (model) => `\u5F53\u524D\u6A21\u578B\uFF08${model}\uFF09\u4E0D\u652F\u6301\u601D\u8003\u5F3A\u5EA6\u8BBE\u7F6E\u3002`,
  thinkingLoading: "\u6B63\u5728\u52A0\u8F7D\u53EF\u7528\u601D\u8003\u5F3A\u5EA6\u2026",
  thinkingFallbackHint: "\u672A\u5728\u6A21\u578B\u76EE\u5F55\u4E2D\u627E\u5230\u8BE5\u6A21\u578B\uFF0C\u63D0\u4F9B\u6807\u51C6\u601D\u8003\u5F3A\u5EA6\u9009\u9879\u3002",
  statusBadgeError: "\u6587\u4EF6\u9519\u8BEF",
  statusBadgeReady: "\u53EF\u7528",
  statusBadgeRaw: "\u539F\u6587\u7F16\u8F91",
  editAria: (id, isError) => `${isError ? "\u4FEE\u590D" : "\u7F16\u8F91"} ${id}`,
  copyAria: (id) => `\u590D\u5236 ${id}`,
  deleteAria: (id) => `\u5220\u9664 ${id}.md`,
  copyAction: "\u590D\u5236",
  editAction: "\u7F16\u8F91",
  deleteAction: "\u5220\u9664",
  parseError: "\u914D\u7F6E\u89E3\u6790\u5F02\u5E38",
  descriptionEmpty: "\u672A\u586B\u5199\u804C\u8D23\u63CF\u8FF0",
  unstructuredNotice: "\u6B64\u6587\u4EF6\u9700\u8981\u901A\u8FC7\u539F\u6587\u7F16\u8F91\u4FDD\u7559\u7ED3\u6784\u3002",
  modelRouteTitle: (value) => `\u6A21\u578B\u8DEF\u7531\uFF1A${value}`,
  modelChipLabel: "\u6A21\u578B\uFF1A",
  thinkingChipTitle: (value) => `\u601D\u8003\u5F3A\u5EA6\uFF1A${value}`,
  thinkingChipLabel: "\u601D\u8003\u5F3A\u5EA6\uFF1A",
  backgroundContinuousTitle: "\u540E\u53F0\u53EF\u6301\u7EED\u4F1A\u8BDD",
  backgroundOnceTitle: "\u524D\u53F0\u4E00\u6B21\u6027\u8FD0\u884C",
  backgroundContinuous: "\u540E\u53F0\u53EF\u6301\u7EED",
  backgroundForeground: "\u524D\u53F0\u8FD0\u884C",
  deepLeafTitle: "\u53F6\u5B50\u8282\u70B9\uFF1A\u7981\u6B62\u6D3E\u53D1\u5B50\u4EE3\u7406",
  deepDispatchTitle: (depth) => `\u6D3E\u53D1\u6DF1\u5EA6\uFF1A${depth}`,
  deepLeaf: "\u53F6\u5B50(\u7981\u6D3E\u53D1)",
  deepValue: (depth) => `\u6DF1\u5EA6\uFF1A${depth}`,
  roundsTitle: (rounds) => `\u5355\u6B21\u4F1A\u8BDD\u8F6E\u6570\u4E0A\u9650\uFF1A${rounds} \u8F6E`,
  roundsValue: (rounds) => `\u4E0A\u9650 ${rounds} \u8F6E`,
  nameHintEditable: "\u65B0\u6587\u4EF6\u540D\u7B49\u4E8E\u5185\u90E8\u540D\u79F0\uFF1B\u4F7F\u7528\u5B89\u5168\u4E14\u552F\u4E00\u7684\u540D\u79F0\u3002",
  nameHintFixed: "\u5185\u90E8\u540D\u79F0\u56FA\u5B9A\u4E3A\u5F53\u524D\u6587\u4EF6\u6807\u8BC6\uFF0C\u4E0D\u80FD\u901A\u8FC7\u7F16\u8F91\u6216\u4FEE\u590D\u6539\u540D\u3002",
  diagnosticTitle: "\u539F\u6587\u4EF6\u8BCA\u65AD",
  sourceHint: (id) => `\u5305\u542B frontmatter \u548C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u3002\u5C06 name \u7EA0\u6B63\u4E3A ${id}\uFF1B\u4FDD\u5B58\u65F6\u6309\u540C\u4E00\u89C4\u5219\u6821\u9A8C\u3002`,
  displayNameHint: "\u53EF\u7559\u7A7A\uFF0C\u4F7F\u7528\u5185\u90E8\u540D\u79F0\u4F5C\u4E3A\u663E\u793A\u6807\u7B7E\u3002\u53D8\u66F4\u5DF2\u6709\u663E\u793A\u540D\u65F6\u4F1A\u63D0\u793A\u5386\u53F2\u4EFB\u52A1\u5F71\u54CD\u3002",
  descriptionHint: "\u4E00\u884C\u804C\u8D23\u63CF\u8FF0\uFF0C\u7528\u4E8E\u5E2E\u52A9\u9009\u62E9\u5408\u9002\u7684\u5B50\u667A\u80FD\u4F53\u3002",
  customModelHint: "\u586B\u5199\u81EA\u5B9A\u4E49 provider/model \u8DEF\u7531\uFF08\u4F8B\u5982 openai/gpt-6.1-sol\uFF09\u6216\u7559\u7A7A\u7EE7\u627F\u9ED8\u8BA4\u3002",
  customModelPlaceholder: "\u4F8B\u5982\uFF1Aopenai/gpt-6.1-sol",
  selectFromList: "\u4ECE\u5217\u8868\u9009\u62E9",
  catalogModelHint: "\u4ECE\u5F53\u524D\u90E8\u7F72\u5DF2\u542F\u7528\u7684\u6A21\u578B\u4E2D\u9009\u62E9\uFF1B\u7559\u7A7A\u7EE7\u627F\u9ED8\u8BA4\u8BBE\u7F6E\u3002",
  notInCatalogGroup: "\u5F53\u524D\u8BBE\u7F6E / \u672A\u5728\u76EE\u5F55\u4E2D",
  customInputOption: "\u81EA\u5B9A\u4E49\u8F93\u5165\u2026",
  customInputButton: "\u81EA\u5B9A\u4E49\u8F93\u5165",
  loadingCatalog: "\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\u76EE\u5F55\u2026",
  catalogError: (error) => `\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A${error}`,
  catalogErrorHint: "\u5F53\u524D\u6A21\u578B\u503C\u4ECD\u4FDD\u7559\uFF0C\u53EF\u7EE7\u7EED\u4F7F\u7528\u81EA\u5B9A\u4E49\u8DEF\u7531\u3002",
  retryCatalog: "\u91CD\u8BD5\u6A21\u578B\u76EE\u5F55",
  catalogFailure: (name, message) => `\u6A21\u578B\u76EE\u5F55 ${name}\uFF1A${message}`,
  bodyHint: "\u4F5C\u4E3A\u7CFB\u7EDF\u63D0\u793A\u8BCD\u539F\u6837\u4F7F\u7528\uFF0C\u652F\u6301 Markdown\u3002",
  advancedTitle: "\u9AD8\u7EA7\u8BBE\u7F6E",
  deepHint: "\u7559\u7A7A\u6CBF\u7528\u7F3A\u7701\u6DF1\u5EA6 1\uFF1B0 \u7981\u6B62\u6B64\u89D2\u8272\u7EE7\u7EED\u6D3E\u53D1\u5B50\u4EE3\u7406\u3002",
  deepPlaceholder: "\u7EE7\u627F\uFF081\uFF09",
  backgroundHint: "\u7559\u7A7A\u6CBF\u7528\u7F3A\u7701\u524D\u53F0\uFF1Btrue \u4E3A\u540E\u53F0\u53EF\u6301\u7EED\u4F1A\u8BDD\u3002",
  backgroundInheritOption: "\u7EE7\u627F\uFF08\u524D\u53F0\uFF09",
  backgroundFalseOption: "false\uFF08\u524D\u53F0\uFF09",
  backgroundTrueOption: "true\uFF08\u540E\u53F0\uFF09",
  maxRoundsHint: "\u7559\u7A7A\u7EE7\u627F\u5168\u5C40\u8F6E\u6570\u4E0A\u9650\uFF1B\u586B\u5199\u6B63\u6574\u6570\u3002",
  maxRoundsPlaceholder: "\u7EE7\u627F\u5168\u5C40",
  saving: "\u6B63\u5728\u4FDD\u5B58\u2026",
  unsavedChanges: "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
  noChanges: "\u5C1A\u672A\u4FEE\u6539",
  cancel: "\u53D6\u6D88",
  savePreset: "\u4FDD\u5B58\u9884\u8BBE",
  deleteConfirmTitle: (id) => `\u5220\u9664 ${id}.md\uFF1F`,
  displayNameConfirmTitle: "\u786E\u8BA4\u663E\u793A\u540D\u53D8\u66F4",
  discardConfirmTitle: "\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF1F",
  closeLabel: "\u53D6\u6D88\u786E\u8BA4",
  confirmDelete: "\u786E\u8BA4\u5220\u9664",
  confirmSave: "\u786E\u8BA4\u5E76\u4FDD\u5B58",
  discardChanges: "\u653E\u5F03\u4FEE\u6539",
  deleteConfirmText: (id) => `\u5C06\u5220\u9664 ${id}.md\u3002\u6240\u6709\u6307\u5411\u6B64\u76EE\u5F55\u7684 profile \u90FD\u5C06\u5931\u53BB\u6B64\u9884\u8BBE\uFF1B\u5220\u9664\u540E\u65E0\u6CD5\u4ECE\u672C\u9875\u6062\u590D\u3002`,
  displayNameConfirmText: "\u663E\u793A\u540D\u65B0\u589E\u3001\u6E05\u9664\u6216\u53D8\u66F4\u4F1A\u6539\u53D8\u67E5\u627E\u5386\u53F2\u4EFB\u52A1\u65F6\u4F7F\u7528\u7684\u663E\u793A\u6807\u7B7E\u3002\u65E7\u4EFB\u52A1\u53EF\u80FD\u65E0\u6CD5\u518D\u6309 name \u7EED\u8DD1\u6216\u8FFD\u95EE\uFF0C\u5386\u53F2\u8BB0\u5F55\u4E0D\u4F1A\u8FC1\u79FB\u3002",
  discardRefreshText: "\u5237\u65B0\u5C06\u4E22\u5F03\u5F53\u524D\u8F93\u5165\u5E76\u91CD\u65B0\u8BFB\u53D6\u76EE\u5F55\u3002",
  discardRepairText: "\u5C06\u4E22\u5F03\u5F53\u524D\u8868\u5355\u8F93\u5165\uFF0C\u5E76\u6253\u5F00\u8BFB\u53D6\u65F6\u7684\u5B8C\u6574\u539F\u6587\u3002",
  discardListText: "\u8FD4\u56DE\u5217\u8868\u5C06\u4E22\u5F03\u5F53\u524D\u8F93\u5165\u3002",
  confirmTarget: (id) => `\u76EE\u6807\uFF1A${id}.md`,
  deletedNotice: (id) => `\u5DF2\u5220\u9664 ${id}.md`,
  savedNotice: (id) => `\u5DF2\u4FDD\u5B58 ${id}.md`
};
var ru = {
  titles: { create: "\u041D\u043E\u0432\u044B\u0439 \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442", copy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u0430", edit: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u0430", repair: "\u0420\u0435\u043C\u043E\u043D\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0430" },
  labels: { name: "\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0435 \u0438\u043C\u044F", display_name: "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0435 \u0438\u043C\u044F", description: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u0435\u0439", model: "\u041C\u043E\u0434\u0435\u043B\u044C", thinking: "\u0423\u0440\u043E\u0432\u0435\u043D\u044C thinking", deep: "\u0413\u043B\u0443\u0431\u0438\u043D\u0430", background: "\u0424\u043E\u043D\u043E\u0432\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A", maxRounds: "\u041B\u0438\u043C\u0438\u0442 \u0440\u0430\u0443\u043D\u0434\u043E\u0432", body: "\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u0430\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430", source: "\u041F\u043E\u043B\u043D\u044B\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 Markdown" },
  backToList: "\u041A \u0441\u043F\u0438\u0441\u043A\u0443",
  agentsTitle: "\u0421\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u044B",
  copiedFrom: (id) => `\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0438\u0437 ${id}.md \u2014 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u043D\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B.`,
  refreshing: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u2026",
  refresh: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
  createAgent: "\u041D\u043E\u0432\u044B\u0439 \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442",
  directory: (path) => `\u041A\u0430\u0442\u0430\u043B\u043E\u0433: ${path}`,
  directoryHint: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438, \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0449\u0438\u0435 \u043D\u0430 \u044D\u0442\u043E\u0442 \u043A\u0430\u0442\u0430\u043B\u043E\u0433, \u0440\u0430\u0437\u0434\u0435\u043B\u044F\u044E\u0442 \u043F\u0440\u0435\u0441\u0435\u0442\u044B. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C\u0441\u044F \u043A \u043F\u043E\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C \u0432\u044B\u0437\u043E\u0432\u0430\u043C; \u0443\u0436\u0435 \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443.",
  errorActionIncomplete: "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430",
  errorReadFailed: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0447\u0442\u0435\u043D\u0438\u044F",
  checkField: (label) => `\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C ${label}`,
  goToRepair: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0440\u0435\u043C\u043E\u043D\u0442\u0443 \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0430",
  loadingPresets: "\u0427\u0442\u0435\u043D\u0438\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043F\u0440\u0435\u0441\u0435\u0442\u043E\u0432\u2026",
  refreshFailed: (hasList) => `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433; \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043E\u0448\u0438\u0431\u043A\u0443 \u0432\u044B\u0448\u0435 \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435${hasList ? "; \u043D\u0438\u0436\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u0440\u043E\u0448\u043B\u043E\u0433\u043E \u0447\u0442\u0435\u043D\u0438\u044F." : "."}`,
  emptyTitle: "\u0412 \u044D\u0442\u043E\u043C \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u043E\u0432",
  emptyHint: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u0430 \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0435\u0433\u043E \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u0438 \u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u0443\u044E \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443.",
  inheritDefault: "\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  inheritDefaultRoute: (route) => `\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C (${route})`,
  inheritDefaultWithNote: (note) => `\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E${note}`,
  thinkingHint: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 thinking \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0440\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u044F.",
  thinkingHintEfforts: (efforts) => `\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 thinking \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0440\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u044F. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0434\u043B\u044F \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043C\u043E\u0434\u0435\u043B\u0438: ${efforts}.`,
  thinkingInheritDeployment: "\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 thinking \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0440\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u044F",
  thinkingUnlisted: (id) => `${id} (\u043D\u0435\u0442 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435)`,
  thinkingUnsupportedOption: "\u041D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0443\u0440\u043E\u0432\u043D\u0438 thinking (\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435/\u0432\u044B\u043A\u043B.)",
  thinkingUnsupportedValue: (id) => `${id} (\u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442)`,
  thinkingUnsupportedHint: (model) => `\u041C\u043E\u0434\u0435\u043B\u044C (${model}) \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0443 \u0443\u0440\u043E\u0432\u043D\u0435\u0439 thinking.`,
  thinkingLoading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0443\u0440\u043E\u0432\u043D\u0435\u0439 thinking\u2026",
  thinkingFallbackHint: "\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043C\u043E\u0434\u0435\u043B\u0435\u0439; \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u044E\u0442\u0441\u044F \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u0443\u0440\u043E\u0432\u043D\u0438 thinking.",
  statusBadgeError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0444\u0430\u0439\u043B\u0430",
  statusBadgeReady: "\u0413\u043E\u0442\u043E\u0432",
  statusBadgeRaw: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0430",
  editAria: (id, isError) => `${isError ? "\u0420\u0435\u043C\u043E\u043D\u0442" : "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"} ${id}`,
  copyAria: (id) => `\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ${id}`,
  deleteAria: (id) => `\u0423\u0434\u0430\u043B\u0438\u0442\u044C ${id}.md`,
  copyAction: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  editAction: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  deleteAction: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
  parseError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0430\u0437\u0431\u043E\u0440\u0430 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438",
  descriptionEmpty: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E",
  unstructuredNotice: "\u0427\u0442\u043E\u0431\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443, \u044D\u0442\u043E\u0442 \u0444\u0430\u0439\u043B \u043D\u0443\u0436\u043D\u043E \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u0430\u043A \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A.",
  modelRouteTitle: (value) => `\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u043C\u043E\u0434\u0435\u043B\u0438: ${value}`,
  modelChipLabel: "\u041C\u043E\u0434\u0435\u043B\u044C: ",
  thinkingChipTitle: (value) => `\u0423\u0440\u043E\u0432\u0435\u043D\u044C thinking: ${value}`,
  thinkingChipLabel: "Thinking: ",
  backgroundContinuousTitle: "\u041D\u0435\u043F\u0440\u0435\u0440\u044B\u0432\u043D\u0430\u044F \u0444\u043E\u043D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F",
  backgroundOnceTitle: "\u0420\u0430\u0437\u043E\u0432\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0430 \u043F\u0435\u0440\u0435\u0434\u043D\u0435\u043C \u043F\u043B\u0430\u043D\u0435",
  backgroundContinuous: "\u0424\u043E\u043D, \u043D\u0435\u043F\u0440\u0435\u0440\u044B\u0432\u043D\u044B\u0439",
  backgroundForeground: "\u041F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 \u043F\u043B\u0430\u043D",
  deepLeafTitle: "\u041B\u0438\u0441\u0442\u043E\u0432\u043E\u0439 \u0443\u0437\u0435\u043B: \u0437\u0430\u043F\u0443\u0441\u043A \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u043E\u0432 \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D",
  deepDispatchTitle: (depth) => `\u0413\u043B\u0443\u0431\u0438\u043D\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430: ${depth}`,
  deepLeaf: "\u041B\u0438\u0441\u0442 (\u0431\u0435\u0437 \u0437\u0430\u043F\u0443\u0441\u043A\u0430)",
  deepValue: (depth) => `\u0413\u043B\u0443\u0431\u0438\u043D\u0430: ${depth}`,
  roundsTitle: (rounds) => `\u041B\u0438\u043C\u0438\u0442 \u0440\u0430\u0443\u043D\u0434\u043E\u0432 \u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438: ${rounds}`,
  roundsValue: (rounds) => `\u041B\u0438\u043C\u0438\u0442: ${rounds}`,
  nameHintEditable: "\u041D\u043E\u0432\u043E\u0435 \u0438\u043C\u044F \u0444\u0430\u0439\u043B\u0430 \u0440\u0430\u0432\u043D\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u043C\u0443 \u0438\u043C\u0435\u043D\u0438; \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0435 \u0443\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u0438\u043C\u044F.",
  nameHintFixed: "\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0435 \u0438\u043C\u044F \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043E \u0437\u0430 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u043E\u043C \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0444\u0430\u0439\u043B\u0430; \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u0438\u043B\u0438 \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u043C \u043D\u0435\u043B\u044C\u0437\u044F.",
  diagnosticTitle: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430",
  sourceHint: (id) => `\u0421\u043E\u0434\u0435\u0440\u0436\u0438\u0442 frontmatter \u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u0443\u044E \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443. name \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043D\u0430 ${id}; \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E \u0442\u0435\u043C \u0436\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430\u043C.`,
  displayNameHint: "\u041C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C \u2014 \u0432 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435 \u043C\u0435\u0442\u043A\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0435 \u0438\u043C\u044F. \u041F\u0440\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0433\u043E \u0438\u043C\u0435\u043D\u0438 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435 \u043E \u0432\u043B\u0438\u044F\u043D\u0438\u0438 \u043D\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438.",
  descriptionHint: "\u041E\u0434\u043D\u043E\u0441\u0442\u0440\u043E\u0447\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u0435\u0439, \u043F\u043E\u043C\u043E\u0433\u0430\u044E\u0449\u0435\u0435 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0435\u0433\u043E \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u0430.",
  customModelHint: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 provider/model (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, openai/gpt-6.1-sol) \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.",
  customModelPlaceholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: openai/gpt-6.1-sol",
  selectFromList: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430",
  catalogModelHint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C, \u0432\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u0443\u044E \u0432 \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u0440\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u0438; \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.",
  notInCatalogGroup: "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 / \u043D\u0435\u0442 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435",
  customInputOption: "\u0421\u0432\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u2026",
  customInputButton: "\u0421\u0432\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442",
  loadingCatalog: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043C\u043E\u0434\u0435\u043B\u0435\u0439\u2026",
  catalogError: (error) => `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043C\u043E\u0434\u0435\u043B\u0435\u0439: ${error}`,
  catalogErrorHint: "\u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E; \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442.",
  retryCatalog: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430",
  catalogFailure: (name, message) => `\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 ${name}: ${message}`,
  bodyHint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0434\u043E\u0441\u043B\u043E\u0432\u043D\u043E \u043A\u0430\u043A \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u0430\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430; \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F Markdown.",
  advancedTitle: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
  deepHint: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0433\u043B\u0443\u0431\u0438\u043D\u0443 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 1; 0 \u0437\u0430\u043F\u0440\u0435\u0449\u0430\u0435\u0442 \u044D\u0442\u043E\u043C\u0443 \u0430\u0433\u0435\u043D\u0442\u0443 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u0441\u0443\u0431-\u0430\u0433\u0435\u043D\u0442\u043E\u0432.",
  deepPlaceholder: "\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C (1)",
  backgroundHint: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 \u043F\u043B\u0430\u043D \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E; true = \u043D\u0435\u043F\u0440\u0435\u0440\u044B\u0432\u043D\u0430\u044F \u0444\u043E\u043D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F.",
  backgroundInheritOption: "\u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C (\u043F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 \u043F\u043B\u0430\u043D)",
  backgroundFalseOption: "false (\u043F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 \u043F\u043B\u0430\u043D)",
  backgroundTrueOption: "true (\u0444\u043E\u043D)",
  maxRoundsHint: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u0433\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442 \u0440\u0430\u0443\u043D\u0434\u043E\u0432; \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0446\u0435\u043B\u043E\u0435.",
  maxRoundsPlaceholder: "\u0423\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u0433\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0439",
  saving: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026",
  unsavedChanges: "\u0415\u0441\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
  noChanges: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442",
  cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
  savePreset: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u0435\u0441\u0435\u0442",
  deleteConfirmTitle: (id) => `\u0423\u0434\u0430\u043B\u0438\u0442\u044C ${id}.md?`,
  displayNameConfirmTitle: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0433\u043E \u0438\u043C\u0435\u043D\u0438",
  discardConfirmTitle: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F?",
  closeLabel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
  confirmDelete: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435",
  confirmSave: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
  discardChanges: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
  deleteConfirmText: (id) => `\u0411\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043B\u0451\u043D ${id}.md. \u0412\u0441\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0438, \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0449\u0438\u0435 \u043D\u0430 \u044D\u0442\u043E\u0442 \u043A\u0430\u0442\u0430\u043B\u043E\u0433, \u043F\u043E\u0442\u0435\u0440\u044F\u044E\u0442 \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u0441\u0435\u0442; \u043F\u043E\u0441\u043B\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u043D\u0435\u043B\u044C\u0437\u044F.`,
  displayNameConfirmText: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u0435, \u043E\u0447\u0438\u0441\u0442\u043A\u0430 \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0433\u043E \u0438\u043C\u0435\u043D\u0438 \u0432\u043B\u0438\u044F\u0435\u0442 \u043D\u0430 \u043C\u0435\u0442\u043A\u0443, \u043F\u043E \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043D\u0430\u0445\u043E\u0434\u044F\u0442\u0441\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438. \u0421\u0442\u0430\u0440\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043C\u043E\u0433\u0443\u0442 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0442\u044C \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u044F\u0442\u044C\u0441\u044F \u043F\u043E name; \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043D\u0435 \u043C\u0438\u0433\u0440\u0438\u0440\u0443\u0435\u0442.",
  discardRefreshText: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u0431\u0440\u043E\u0441\u0438\u0442 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0432\u0432\u043E\u0434 \u0438 \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0435\u0442 \u043A\u0430\u0442\u0430\u043B\u043E\u0433.",
  discardRepairText: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0432\u0432\u043E\u0434 \u0444\u043E\u0440\u043C\u044B \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u0431\u0440\u043E\u0448\u0435\u043D, \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u044B\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u0438\u043A, \u0441\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u0438 \u0447\u0442\u0435\u043D\u0438\u0438.",
  discardListText: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043A \u0441\u043F\u0438\u0441\u043A\u0443 \u043E\u0442\u0431\u0440\u043E\u0441\u0438\u0442 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0432\u0432\u043E\u0434.",
  confirmTarget: (id) => `\u0426\u0435\u043B\u044C: ${id}.md`,
  deletedNotice: (id) => `\u0423\u0434\u0430\u043B\u0451\u043D ${id}.md`,
  savedNotice: (id) => `\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D ${id}.md`
};
var en = {
  titles: { create: "New Sub-agent", copy: "Copy Sub-agent", edit: "Edit Sub-agent", repair: "Repair Source" },
  labels: { name: "Internal Name", display_name: "Display Name", description: "Responsibilities", model: "Model", thinking: "Thinking", deep: "Depth", background: "Background", maxRounds: "Max Rounds", body: "System Prompt", source: "Full Source Markdown" },
  backToList: "Back to list",
  agentsTitle: "Sub-agents",
  copiedFrom: (id) => `Copied from ${id}.md; saved as a new file.`,
  refreshing: "Refreshing\u2026",
  refresh: "Refresh",
  createAgent: "New Sub-agent",
  directory: (path) => `Directory: ${path}`,
  directoryHint: "Profiles pointing at this directory share presets. Changes apply to future calls; already-running tasks keep their original prompt.",
  errorActionIncomplete: "Operation not completed",
  errorReadFailed: "Read failed",
  checkField: (label) => `Check ${label}`,
  goToRepair: "Go to source repair",
  loadingPresets: "Reading preset directory\u2026",
  refreshFailed: (hasList) => `Failed to read the latest catalog. Check the error above and refresh${hasList ? "; the previous list is kept below." : "."}`,
  emptyTitle: "No sub-agents in this directory yet",
  emptyHint: "Create a sub-agent and fill in its responsibilities and system prompt.",
  inheritDefault: "Inherit default",
  inheritDefaultRoute: (route) => `Inherit default (${route})`,
  inheritDefaultWithNote: (note) => `Inherit default${note}`,
  thinkingHint: "Leave empty to inherit the deployment's thinking settings.",
  thinkingHintEfforts: (efforts) => `Leave empty to inherit the deployment's thinking settings. Available for the current model: ${efforts}.`,
  thinkingInheritDeployment: "Inherit the deployment's thinking settings",
  thinkingUnlisted: (id) => `${id} (not listed)`,
  thinkingUnsupportedOption: "No thinking levels supported (inherit/off)",
  thinkingUnsupportedValue: (id) => `${id} (unsupported by this model)`,
  thinkingUnsupportedHint: (model) => `The current model (${model}) does not support thinking settings.`,
  thinkingLoading: "Loading available thinking levels\u2026",
  thinkingFallbackHint: "Model not found in the catalog; standard thinking levels are offered.",
  statusBadgeError: "File error",
  statusBadgeReady: "Ready",
  statusBadgeRaw: "Raw source edit",
  editAria: (id, isError) => `${isError ? "Repair" : "Edit"} ${id}`,
  copyAria: (id) => `Copy ${id}`,
  deleteAria: (id) => `Delete ${id}.md`,
  copyAction: "Copy",
  editAction: "Edit",
  deleteAction: "Delete",
  parseError: "Configuration parse error",
  descriptionEmpty: "No responsibilities provided",
  unstructuredNotice: "This file must be edited as raw source to preserve its structure.",
  modelRouteTitle: (value) => `Model route: ${value}`,
  modelChipLabel: "Model: ",
  thinkingChipTitle: (value) => `Thinking: ${value}`,
  thinkingChipLabel: "Thinking: ",
  backgroundContinuousTitle: "Continuous background session",
  backgroundOnceTitle: "One-shot foreground run",
  backgroundContinuous: "Background, continuous",
  backgroundForeground: "Foreground",
  deepLeafTitle: "Leaf node: dispatching sub-agents is forbidden",
  deepDispatchTitle: (depth) => `Dispatch depth: ${depth}`,
  deepLeaf: "Leaf (no dispatch)",
  deepValue: (depth) => `Depth: ${depth}`,
  roundsTitle: (rounds) => `Max rounds per session: ${rounds}`,
  roundsValue: (rounds) => `Limit: ${rounds}`,
  nameHintEditable: "The new file name equals the internal name; use a safe, unique name.",
  nameHintFixed: "The internal name is fixed to the current file identifier and cannot be renamed by editing or repair.",
  diagnosticTitle: "Original file diagnostics",
  sourceHint: (id) => `Contains frontmatter and the system prompt. name is corrected to ${id}; saving validates by the same rule.`,
  displayNameHint: "Can be left empty to use the internal name as the display label. Changing an existing display name warns about the impact on historical tasks.",
  descriptionHint: "A one-line description of responsibilities used to help pick a suitable sub-agent.",
  customModelHint: "Enter a custom provider/model route (for example openai/gpt-6.1-sol) or leave empty to inherit the default.",
  customModelPlaceholder: "For example: openai/gpt-6.1-sol",
  selectFromList: "Select from list",
  catalogModelHint: "Choose from models enabled in the current deployment; leave empty to inherit the default.",
  notInCatalogGroup: "Current setting / not in catalog",
  customInputOption: "Custom input\u2026",
  customInputButton: "Custom input",
  loadingCatalog: "Loading model catalog\u2026",
  catalogError: (error) => `Failed to load the model catalog: ${error}`,
  catalogErrorHint: "The current model value is kept; a custom route can still be used.",
  retryCatalog: "Retry catalog load",
  catalogFailure: (name, message) => `Model catalog ${name}: ${message}`,
  bodyHint: "Used verbatim as the system prompt; Markdown is supported.",
  advancedTitle: "Advanced settings",
  deepHint: "Leave empty to keep the default depth 1; 0 forbids this agent from dispatching sub-agents.",
  deepPlaceholder: "Inherit (1)",
  backgroundHint: "Leave empty to keep the default foreground; true means a continuous background session.",
  backgroundInheritOption: "Inherit (foreground)",
  backgroundFalseOption: "false (foreground)",
  backgroundTrueOption: "true (background)",
  maxRoundsHint: "Leave empty to inherit the global round limit; enter a positive integer.",
  maxRoundsPlaceholder: "Inherit global",
  saving: "Saving\u2026",
  unsavedChanges: "Unsaved changes",
  noChanges: "No changes",
  cancel: "Cancel",
  savePreset: "Save preset",
  deleteConfirmTitle: (id) => `Delete ${id}.md?`,
  displayNameConfirmTitle: "Confirm display name change",
  discardConfirmTitle: "Discard unsaved changes?",
  closeLabel: "Cancel confirmation",
  confirmDelete: "Confirm delete",
  confirmSave: "Confirm and save",
  discardChanges: "Discard changes",
  deleteConfirmText: (id) => `${id}.md will be deleted. Every profile pointing at this directory loses this preset; it cannot be restored from this page after deletion.`,
  displayNameConfirmText: "Adding, clearing or changing the display name changes the label used to find historical tasks. Old tasks may no longer be continued or followed up by name; history is not migrated.",
  discardRefreshText: "Refreshing discards the current input and re-reads the directory.",
  discardRepairText: "The current form input will be discarded and the full source read at load time will open.",
  discardListText: "Returning to the list discards the current input.",
  confirmTarget: (id) => `Target: ${id}.md`,
  deletedNotice: (id) => `Deleted ${id}.md`,
  savedNotice: (id) => `Saved ${id}.md`
};
var tables = { zh, en, ru };
function stringsFor(lang) {
  return lang && LANGUAGES.includes(lang) ? tables[lang] : tables.zh;
}

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
      if (reply.ok) this.publish({ status: "ready", list: reply.value, listError: void 0, language: reply.value.language });
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
          this.publish({ notice: stringsFor(this.snapshot.language).deletedNotice(confirmation.entry.id) });
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
        this.publish({ draft: void 0, notice: stringsFor(this.snapshot.language).savedNotice(reply.value.id) });
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
  const t = stringsFor(state.language);
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: PresetsPage_default.label, htmlFor: fieldId(key), children: t.labels[key] }),
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
  const summaryField = failure?.field && failure.field in t.labels ? raw && failure.field !== "source" ? "source" : failure.field : void 0;
  const catalogGroups = state.catalog?.groups ?? [];
  const defaultModelSelection = state.catalog?.default;
  const defaultModelLabel = defaultModelSelection ? t.inheritDefaultRoute(`${defaultModelSelection.provider}/${defaultModelSelection.model}`) : t.inheritDefault;
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
  let thinkingHint = t.thinkingHint;
  let thinkingDisabled = false;
  if (effectiveModelObj) {
    const reasoning = effectiveModelObj.reasoning;
    if (reasoning?.efforts && reasoning.efforts.length > 0) {
      const defaultEffortNote = reasoning.defaultEffort ? ` (${reasoning.defaultEffort})` : "";
      thinkingOptions = [
        ["", t.inheritDefaultWithNote(defaultEffortNote)],
        ...reasoning.efforts.map((e) => [
          e.id,
          e.name && e.name.toLowerCase() !== e.id.toLowerCase() ? `${e.name} (${e.id})` : e.id
        ])
      ];
      if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
        thinkingOptions.push([draft.fields.thinking, t.thinkingUnlisted(draft.fields.thinking)]);
      }
      thinkingHint = t.thinkingHintEfforts(reasoning.efforts.map((e) => e.id).join(" / "));
    } else {
      thinkingOptions = [["", t.thinkingUnsupportedOption]];
      if (draft?.fields.thinking) {
        thinkingOptions.push([draft.fields.thinking, t.thinkingUnsupportedValue(draft.fields.thinking)]);
      }
      thinkingHint = t.thinkingUnsupportedHint(effectiveModelObj.name);
      thinkingDisabled = true;
    }
  } else {
    const fallbackLevels = ["off", "low", "medium", "high", "xhigh", "max"];
    thinkingOptions = [
      ["", t.thinkingInheritDeployment],
      ...fallbackLevels.map((l) => [l, l])
    ];
    if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
      thinkingOptions.push([draft.fields.thinking, draft.fields.thinking]);
    }
    if (state.catalogStatus === "loading") {
      thinkingHint = t.thinkingLoading;
    } else if (currentModel !== "") {
      thinkingHint = t.thinkingFallbackHint;
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: PresetsPage_default.page, "data-view": draft?.mode ?? "list", "aria-busy": busy || state.status === "loading", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.content, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: PresetsPage_default.header, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.headingGroup, children: [
          draft && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "ghost", disabled: busy, onClick: () => controller.discard("list"), children: t.backToList }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { ref: heading, tabIndex: -1, className: PresetsPage_default.title, children: draft ? t.titles[draft.mode] : t.agentsTitle }),
          draft?.mode === "copy" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: t.copiedFrom(draft.original?.id ?? "") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "outline", disabled: busy || state.status === "loading", onClick: () => controller.discard("refresh"), children: state.status === "loading" ? t.refreshing : t.refresh }),
          !draft && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", disabled: busy || state.status !== "ready", onClick: () => controller.start("create"), children: t.createAgent })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.directory, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.directoryHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderIcon, { className: PresetsPage_default.directoryIcon }),
          state.list && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.directoryPath, children: t.directory(state.list.directory) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: t.directoryHint })
      ] }),
      failure && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: errorSummary, tabIndex: -1, role: "alert", className: PresetsPage_default.errorSummary, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorTitle, children: state.failure ? t.errorActionIncomplete : t.errorReadFailed }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: failure.error }),
        draft && summaryField && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: PresetsPage_default.errorLink, href: `#${fieldId(summaryField)}`, onClick: (event) => {
          event.preventDefault();
          document.getElementById(fieldId(summaryField))?.focus();
        }, children: t.checkField(t.labels[summaryField]) }),
        draft && failure.code === "source_required" && draft.mode === "edit" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, onClick: () => controller.discard("repair"), children: t.goToRepair })
      ] }),
      state.notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.notice, role: "status", children: state.notice }),
      !draft ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.status, role: "status", children: t.loadingPresets }),
        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: t.refreshFailed(Boolean(state.list)) }),
        state.status === "ready" && state.list?.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.empty, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyIcon, { className: PresetsPage_default.emptyIcon }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: PresetsPage_default.emptyTitle, children: t.emptyTitle }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: t.emptyHint }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", onClick: () => controller.start("create"), children: t.createAgent })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: PresetsPage_default.list, children: state.list?.entries.map((entry) => {
          const displayName = entry.fields.display_name || entry.id;
          const isThinkingActive = Boolean(entry.fields.thinking && entry.fields.thinking !== "off");
          const thinkingValue = entry.fields.thinking || t.inheritDefault;
          const modelValue = entry.fields.model || t.inheritDefault;
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
                            entry.error ? t.statusBadgeError : entry.structured ? t.statusBadgeReady : t.statusBadgeRaw
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
                        "aria-label": t.editAria(entry.id, Boolean(entry.error)),
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.start(entry.error || !entry.structured ? "repair" : "edit", entry),
                        children: entry.error ? t.titles.repair : entry.structured ? t.editAction : t.statusBadgeRaw
                      }
                    ),
                    !entry.error && entry.structured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      import_dsh_client_ui_primitives.Button,
                      {
                        type: "button",
                        className: PresetsPage_default.action,
                        variant: "outline",
                        "aria-label": t.copyAria(entry.id),
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.start("copy", entry),
                        children: t.copyAction
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      import_dsh_client_ui_primitives.Button,
                      {
                        type: "button",
                        className: `${PresetsPage_default.action} ${PresetsPage_default.danger}`,
                        "aria-label": t.deleteAria(entry.id),
                        disabled: busy || state.status !== "ready",
                        onClick: () => controller.askDelete(entry),
                        children: t.deleteAction
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${PresetsPage_default.rowContent} ${PresetsPage_default.cardBody}`, children: entry.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardErrorBox, role: "alert", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardErrorHeader, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WarningIcon, {}),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t.parseError })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: `${PresetsPage_default.errorText} ${PresetsPage_default.cardErrorText}`, children: entry.error })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.description, "data-empty": !entry.fields.description, children: entry.fields.description || t.descriptionEmpty }),
                  !entry.structured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.unstructuredNotice, children: t.unstructuredNotice })
                ] }) }),
                !entry.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.cardMeta, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: PresetsPage_default.metaChip, "data-kind": "model", title: t.modelRouteTitle(modelValue), children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelIcon, { className: PresetsPage_default.chipIcon }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipLabel, children: t.modelChipLabel }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: modelValue })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "thinking",
                      "data-active": isThinkingActive ? "true" : "false",
                      "data-level": entry.fields.thinking || "default",
                      title: t.thinkingChipTitle(thinkingValue),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThinkingIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipLabel, children: t.thinkingChipLabel }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: thinkingValue })
                      ]
                    }
                  ),
                  entry.fields.background && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "background",
                      title: entry.fields.background === "true" ? t.backgroundContinuousTitle : t.backgroundOnceTitle,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackgroundIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: entry.fields.background === "true" ? t.backgroundContinuous : t.backgroundForeground })
                      ]
                    }
                  ),
                  entry.fields.deep !== void 0 && entry.fields.deep !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "deep",
                      title: entry.fields.deep === "0" ? t.deepLeafTitle : t.deepDispatchTitle(entry.fields.deep),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeepIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: entry.fields.deep === "0" ? t.deepLeaf : t.deepValue(entry.fields.deep) })
                      ]
                    }
                  ),
                  entry.fields.maxRounds && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: PresetsPage_default.metaChip,
                      "data-kind": "rounds",
                      title: t.roundsTitle(entry.fields.maxRounds),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoundsIcon, { className: PresetsPage_default.chipIcon }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: PresetsPage_default.chipValue, children: t.roundsValue(entry.fields.maxRounds) })
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
        input("name", editable ? t.nameHintEditable : t.nameHintFixed, { readOnly: !editable, required: true }),
        raw ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          draft.original?.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.diagnostic, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorTitle, children: t.diagnosticTitle }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: draft.original.error })
          ] }),
          field("source", t.sourceHint(draft.original.id), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ...common("source"), className: `${PresetsPage_default.control} ${PresetsPage_default.source}`, value: draft.source, spellCheck: false, onChange: (event) => controller.text("source", event.target.value) }))
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          input("display_name", t.displayNameHint),
          input("description", t.descriptionHint),
          customModelMode ? field(
            "model",
            t.customModelHint,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { ...common("model"), className: PresetsPage_default.input, placeholder: t.customModelPlaceholder, value: currentModel, onChange: (event) => onModelChange(event.target.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: PresetsPage_default.toggleCustom, onClick: () => setCustomModelMode(false), children: t.selectFromList })
          ) : field(
            "model",
            t.catalogModelHint,
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
                  !isModelInCatalog && currentModel !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: t.notInCatalogGroup, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: currentModel, children: currentModel }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "__custom__", children: t.customInputOption })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: PresetsPage_default.toggleCustom, onClick: () => setCustomModelMode(true), children: t.customInputButton })
          ),
          state.catalogStatus === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, role: "status", children: t.loadingCatalog }),
          state.catalogError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.catalogError, role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: t.catalogError(state.catalogError) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, children: t.catalogErrorHint }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, disabled: busy || state.catalogStatus === "loading", onClick: () => {
              void controller.loadModels();
            }, children: t.retryCatalog })
          ] }),
          state.catalog?.failures.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.errorText, children: t.catalogFailure(item.name, item.message) }, item.id)),
          select("thinking", thinkingHint, thinkingOptions, thinkingDisabled),
          field("body", t.bodyHint, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ...common("body"), className: `${PresetsPage_default.control} ${PresetsPage_default.body}`, value: draft.body, onChange: (event) => controller.text("body", event.target.value) })),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: PresetsPage_default.advanced, open: draft.advanced, onToggle: (event) => controller.advanced(event.currentTarget.open), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: PresetsPage_default.advancedToggle, children: t.advancedTitle }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.advancedFields, children: [
              input("deep", t.deepHint, { type: "number", min: 0, step: 1, placeholder: t.deepPlaceholder }),
              select("background", t.backgroundHint, [["", t.backgroundInheritOption], ["false", t.backgroundFalseOption], ["true", t.backgroundTrueOption]]),
              input("maxRounds", t.maxRoundsHint, { type: "number", min: 1, step: 1, placeholder: t.maxRoundsPlaceholder })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: PresetsPage_default.formFooter, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.hint, role: "status", children: busy ? t.saving : isDirty(draft) ? t.unsavedChanges : t.noChanges }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "outline", disabled: busy, onClick: () => controller.discard("list"), children: t.cancel }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "submit", className: PresetsPage_default.action, variant: "primary", disabled: busy || !editable && !isDirty(draft), children: busy ? t.saving : t.savePreset })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Modal, { open: Boolean(confirmation), onClose: () => controller.cancelConfirmation(), title: confirmation?.kind === "delete" ? t.deleteConfirmTitle(confirmation.entry.id) : confirmation?.kind === "display" ? t.displayNameConfirmTitle : t.discardConfirmTitle, closeLabel: t.closeLabel, footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: PresetsPage_default.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, "data-modal-autofocus": true, disabled: busy, onClick: () => controller.cancelConfirmation(), children: t.cancel }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", className: PresetsPage_default.action, variant: "primary", disabled: busy, onClick: () => {
        void controller.confirm();
      }, children: confirmation?.kind === "delete" ? t.confirmDelete : confirmation?.kind === "display" ? t.confirmSave : t.discardChanges })
    ] }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.confirmText, children: confirmation?.kind === "delete" ? t.deleteConfirmText(confirmation.entry.id) : confirmation?.kind === "display" ? t.displayNameConfirmText : confirmation?.kind === "discard" && confirmation.action === "refresh" ? t.discardRefreshText : confirmation?.kind === "discard" && confirmation.action === "repair" ? t.discardRepairText : t.discardListText }),
      confirmation?.kind === "delete" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.directoryPath, children: t.directory(state.list?.directory ?? "") }),
      confirmation?.kind === "display" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: PresetsPage_default.directoryPath, children: t.confirmTarget(confirmation.request.id) })
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
