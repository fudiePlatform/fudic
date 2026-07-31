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
 * The capabilities of §3.2.
 *
 * `interFileDependencies: true` is mandatory, not decorative: changing `app-badge.fud` has
 * to repaint the errors of every page that uses it (§6.9). `workspaceDiagnostics` stays
 * false — diagnostics are for open files; the whole-project check is `fudic check` in CI.
 */
export const SERVER_CAPABILITIES: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  completionProvider: { triggerCharacters: ['@', '<', '.', ':', '"', '/', ' '] },
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
  diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
};
