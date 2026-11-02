/**
 * SDD-75 — definitions without VS Code's preview: Ctrl over a name showed its hover and, under
 * it, the same declaration again. The link keeps where Ctrl+Click lands.
 */

import { describe, expect, it } from 'vitest';
import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import { CancellationToken, type LocationLink } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { definitionsWithoutPreview, withoutPreview } from '../../src/services/no-preview.js';

const LINK: LocationLink = {
  targetUri: 'file:///a.fudapi',
  targetRange: { start: { line: 3, character: 0 }, end: { line: 9, character: 0 } },
  targetSelectionRange: { start: { line: 3, character: 5 }, end: { line: 3, character: 11 } },
  originSelectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
};

describe('withoutPreview', () => {
  it('collapses the range VS Code previews onto where the name starts, and keeps the rest', () => {
    expect(withoutPreview([LINK])).toEqual([
      { ...LINK, targetRange: { start: { line: 3, character: 5 }, end: { line: 3, character: 5 } } },
    ]);
  });

  it('no answer stays no answer', () => {
    expect(withoutPreview(undefined)).toBeUndefined();
    expect(withoutPreview(null)).toBeNull();
  });
});

describe('definitionsWithoutPreview', () => {
  const plugin = (instance: LanguageServicePluginInstance): LanguageServicePlugin => ({ name: 'p', capabilities: {}, create: () => instance });
  const doc = TextDocument.create('file:///x.fud', 'fudic', 1, '');

  const LINKS = { env: { clientCapabilities: { textDocument: { definition: { linkSupport: true } } } } } as never;

  it('wraps the definitions of a plugin that gives them, for a client that reads links', async () => {
    const [wrapped] = definitionsWithoutPreview([plugin({ provideDefinition: async () => [LINK] })]);
    const instance = wrapped!.create(LINKS);
    const [link] = (await instance.provideDefinition!(doc, { line: 0, character: 0 }, CancellationToken.None)) as LocationLink[];
    expect(link!.targetRange).toEqual({ start: { line: 3, character: 5 }, end: { line: 3, character: 5 } });
  });

  it('leaves a plugin with no definitions as it is, and any plugin for a client without links', () => {
    const instance: LanguageServicePluginInstance = { provideHover: () => undefined };
    expect(definitionsWithoutPreview([plugin(instance)])[0]!.create(LINKS)).toBe(instance);
    const linking: LanguageServicePluginInstance = { provideDefinition: async () => [LINK] };
    for (const clientCapabilities of [undefined, {}, { textDocument: {} }, { textDocument: { definition: {} } }]) {
      const env = clientCapabilities === undefined ? {} : { clientCapabilities };
      expect(definitionsWithoutPreview([plugin(linking)])[0]!.create({ env } as never)).toBe(linking);
    }
  });
});
