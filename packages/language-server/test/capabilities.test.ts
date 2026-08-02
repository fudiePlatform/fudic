/**
 * The declaration of §3.2 and the token legend of §4.3.
 *
 * These are asserted literally on purpose: a capability that silently disappears makes the
 * editor stop asking, and nothing else in the suite would notice.
 */

import { describe, expect, it } from 'vitest';
import { SemanticTokenTypes, TextDocumentSyncKind } from 'vscode-languageserver-protocol';
import {
  FUDIC_TOKEN_TYPES,
  SEMANTIC_TOKENS_LEGEND,
  SERVER_CAPABILITIES,
  tokenTypeIndex,
} from '../src/capabilities.js';

describe('SERVER_CAPABILITIES', () => {
  it('syncs incrementally', () => {
    expect(SERVER_CAPABILITIES.textDocumentSync).toBe(TextDocumentSyncKind.Incremental);
  });

  it('declares the trigger characters of §3.2 in order', () => {
    expect(SERVER_CAPABILITIES.completionProvider?.triggerCharacters).toEqual([
      '@',
      '<',
      '.',
      ':',
      '"',
      '/',
      ' ',
      '!',
      '}',
      '*',
      '$',
      ']',
      '>',
      '+',
      ')',
    ]);
  });

  it.each([
    'hoverProvider',
    'definitionProvider',
    'typeDefinitionProvider',
    'referencesProvider',
    'documentSymbolProvider',
    'codeActionProvider',
  ] as const)('declares %s', (capability) => {
    expect(SERVER_CAPABILITIES[capability]).toBe(true);
  });

  it('offers prepareRename, which is what keeps scaffolding un-renameable', () => {
    expect(SERVER_CAPABILITIES.renameProvider).toEqual({ prepareProvider: true });
  });

  it('declares formatting even though the algorithm is SDD-26', () => {
    expect(SERVER_CAPABILITIES.documentFormattingProvider).toBe(true);
    expect(SERVER_CAPABILITIES.documentRangeFormattingProvider).toBe(true);
  });

  it('declares document links for the <link> hrefs', () => {
    expect(SERVER_CAPABILITIES.documentLinkProvider).toEqual({ resolveProvider: false });
  });

  it('depends on other files and does not diagnose the workspace', () => {
    expect(SERVER_CAPABILITIES.diagnosticProvider).toEqual({
      interFileDependencies: true,
      workspaceDiagnostics: false,
    });
  });

  it('publishes the legend it will emit tokens against', () => {
    expect(SERVER_CAPABILITIES.semanticTokensProvider).toEqual({
      legend: SEMANTIC_TOKENS_LEGEND,
      full: true,
      range: true,
    });
  });
});

describe('SEMANTIC_TOKENS_LEGEND', () => {
  it('keeps the standard types first, so their indices never shift', () => {
    const standard = Object.values(SemanticTokenTypes);

    expect(SEMANTIC_TOKENS_LEGEND.tokenTypes.slice(0, standard.length)).toEqual(standard);
    expect(tokenTypeIndex(SemanticTokenTypes.variable)).toBe(
      standard.indexOf(SemanticTokenTypes.variable),
    );
  });

  it('adds the four fudic types of §4.3', () => {
    expect(FUDIC_TOKEN_TYPES).toEqual([
      'fudDirective',
      'fudInterpolation',
      'fudBinding',
      'fudComponentTag',
    ]);

    for (const type of FUDIC_TOKEN_TYPES) {
      expect(tokenTypeIndex(type)).toBeGreaterThanOrEqual(0);
    }
  });

  it('has no duplicate types and reports -1 for anything else', () => {
    expect(new Set(SEMANTIC_TOKENS_LEGEND.tokenTypes).size).toBe(
      SEMANTIC_TOKENS_LEGEND.tokenTypes.length,
    );
    expect(tokenTypeIndex('fudNotAToken')).toBe(-1);
  });

  it('carries the standard modifiers', () => {
    expect(SEMANTIC_TOKENS_LEGEND.tokenModifiers).toContain('declaration');
  });
});
