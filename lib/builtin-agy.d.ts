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
import type { Language } from './preset-contract.ts';
/** Stable id of the built-in member (also the user-file name it competes with). */
export declare const BUILTIN_AGY_ID = "agy";
/** Command the ACP provider spawns — fixed, never taken from config. */
export declare const BUILTIN_AGY_COMMAND: readonly ["agy", "acp"];
/** A built-in member edition, already localized (zh / en; ru / es use en). */
export interface BuiltinAgyDefinition {
    name: string;
    displayName: string;
    description: string;
    body: string;
    command: readonly string[];
}
/** Seams injected by the caller, plus the two config inputs that gate the member. */
export interface BuiltinAgyInput {
    language: Language;
    /** Experimental master switch (`agyEnabled`). */
    enabled: boolean;
    /** Names hidden from the roster (`disabledAgents`). */
    disabledAgents?: readonly string[];
    /** Resolve the executable with the same seam spawn uses. */
    resolveExecutable: (command: string) => string | undefined;
    /** Parse a user-owned `<name>.md`; undefined = no such file. */
    parseUserAgent: (name: string) => {
        ok: boolean;
    } | undefined;
}
/** Edition for one language; ru / es fall back to en (no dedicated edition). */
export declare function builtinAgyEdition(language: Language): BuiltinAgyDefinition;
/**
 * Resolve the built-in member for the roster, or undefined when hidden.
 * A user-owned `agy.md` wins whether it parses or is broken — the built-in
 * must never mask a broken user file in the roster.
 */
export declare function resolveBuiltinAgy(input: BuiltinAgyInput): BuiltinAgyDefinition | undefined;
/** Roster line, in the same `- name (display): description` shape as agent files. */
export declare function builtinAgyRosterLine(definition: BuiltinAgyDefinition): string;
