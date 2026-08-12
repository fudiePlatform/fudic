/**
 * What the server declares in `initialize` (SDD-24 §3.2) and the semantic token legend of
 * §4.3.
 *
 * The list is a contract with the client, not a wish: a capability declared here must route
 * through the mapping to some service, and one that is missing makes the editor stop asking.
 * Formatting was the single deliberate exception — declared and delegated from the first
 * commit, so the client would not have to be re-configured when SDD-26 landed. It has: the
 * three formatting capabilities now route to `@fudic/formatter`, the same function the CLI
 * calls.
 */

import {
  SemanticTokenModifiers,
  SemanticTokenTypes,
  TextDocumentSyncKind,
  type SemanticTokensLegend,
  type ServerCapabilities,
} from 'vscode-languageserver-protocol';
import { EMMET_TRIGGER_CHARACTERS } from './services/emmet.js';

/**
 * The token types this server adds to the standard ones (§4.3).
 *
 * They exist to correct the TextMate grammar of SDD-25, which is necessarily approximate at
 * the `@` transitions: these come from the real AST, so `@if` is a directive and `app-badge`
 * is visibly not a native tag.
 */
export const FUDIC_TOKEN_TYPES = [
  'fudDirective',
  'fudInterpolation',
  'fudBinding',
  'fudComponentTag',
] as const;

export type FudicTokenType = (typeof FUDIC_TOKEN_TYPES)[number];

/** The legend: every standard type first, so a standard index never shifts, then ours. */
export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = {
  tokenTypes: [...Object.values(SemanticTokenTypes), ...FUDIC_TOKEN_TYPES],
  tokenModifiers: [...Object.values(SemanticTokenModifiers)],
};

/** Index of a token type in the legend, or `-1` when it is not part of it. */
export function tokenTypeIndex(type: string): number {
  return SEMANTIC_TOKENS_LEGEND.tokenTypes.indexOf(type);
}

/**
 * Diagnostics are NOT declared here, and that is the fix of BUG-22 §2.
 *
 * There are two channels for them and a server may only use one. In PULL the editor asks
 * (`textDocument/diagnostic`); in PUSH the server sends (`textDocument/publishDiagnostics`).
 * Volar chooses: with `interFileDependencies` on a plugin it takes push, because the pull
 * model's own flag for that is unreliable, and it then deliberately leaves
 * `diagnosticProvider` OUT of the initialize result — that absence is how it tells the editor
 * "do not ask, I will send".
 *
 * Declaring it here overrode that absence while changing nothing about the push. The editor
 * believed both, so it kept two collections of the same errors: `unclosed <div> element`
 * appeared twice in the hover and twice in the Problems panel, from one parse.
 *
 * `interFileDependencies` stays on the SERVICE, where it belongs and where Volar reads it:
 * changing `app-badge.fud` still repaints the errors of every page that uses it (§6.9). What
 * is gone is the second announcement of a channel this server does not use.
 */
/**
 * What makes the editor ask for completions.
 *
 * The list the CLIENT is told, so it is the one that decides whether a request is made at all:
 * a character that is not here produces no request, and the service's own list never gets a
 * chance to matter. That is why Emmet's characters are here and not only on the service —
 * without `*` the editor stops asking after the `*` of `ul>li*2`, and it never asks again,
 * because the word left under the cursor is a number and VS Code does not auto-trigger on
 * numbers.
 *
 * And it cuts the other way, which is what BUG-15 §4.5 is about: declaring a character is not
 * an invitation, it is an EXCLUSIVE. When the editor asks because of a trigger character,
 * Volar skips every plugin that does not declare that same character — and neither the HTML
 * service nor the TypeScript ones declare the space. So announcing it left this service alone
 * in the room at the one position where it has nothing to say (a word inside an open tag is an
 * attribute name, and `wordContextAt` steps aside for the projection), and the measured result
 * was zero items where an invoked request returns a hundred and fifty.
 *
 * The rule that stays written: a trigger character is declared only if THIS server has
 * something to say when it is pressed. The space is gone; typing it now asks nothing, and the
 * first letter after it asks an invoked completion with every plugin alive, which is what
 * happens in a `.html` and what the user expects.
 */
export const COMPLETION_TRIGGER_CHARACTERS: readonly string[] = [
  ...new Set(['@', '<', '.', ':', '"', '/', ...EMMET_TRIGGER_CHARACTERS]),
];

export const SERVER_CAPABILITIES: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  completionProvider: { triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS] },
  hoverProvider: true,
  definitionProvider: true,
  typeDefinitionProvider: true,
  referencesProvider: true,
  renameProvider: { prepareProvider: true },
  documentSymbolProvider: true,
  semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND, full: true, range: true },
  documentFormattingProvider: true,
  documentRangeFormattingProvider: true,
  // The two characters of SDD-26 §4.7, and the only two: formatting while typing reindents
  // the current line and reorganizes nothing.
  documentOnTypeFormattingProvider: { firstTriggerCharacter: '}', moreTriggerCharacter: ['>'] },
  documentLinkProvider: { resolveProvider: false },
  codeActionProvider: true,
};
