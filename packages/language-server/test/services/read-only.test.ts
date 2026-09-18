/**
 * A library's `.fud` is read-only (SDD-43 §4.4) — the rule, over the three shapes of URI a
 * service is handed.
 *
 * The acceptance probe measures what an editor sees; this measures the decision itself,
 * including the two hops that make it hard: a document arrives EMBEDDED, and while formatting
 * it arrives as the throwaway `<uri>.tmp` Volar rebuilds it as. Neither is a name the index
 * has heard of, and getting either wrong silently turns the rule off.
 */

import { describe, it, expect } from 'vitest';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageServiceContext } from '@volar/language-service';
import { isLibraryDocument } from '../../src/services/read-only.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { memoryFs, component } from '../_support.js';

const OWN = '/ws/apps/tienda/src/components/app-card.fud';
const LIB = '/ws/libs/ui/src/ui-card.fud';

/** An index holding one file of the workspace and one of a library. */
function indexOf(): WorkspaceIndex {
  const index = new WorkspaceIndex(
    memoryFs({ [OWN]: component('app-card'), [LIB]: component('ui-card') }),
  );
  index.upsert(OWN);
  index.upsert(LIB, true);
  return index;
}

/** A context that decodes `volar-embedded-content://…` back to the uri it was given. */
function contextWith(embedded: Readonly<Record<string, string>> = {}): LanguageServiceContext {
  return {
    decodeEmbeddedDocumentUri: (uri: URI) => {
      const source = embedded[uri.toString()];
      return source === undefined ? undefined : ([URI.parse(source), 'root'] as [URI, string]);
    },
  } as unknown as LanguageServiceContext;
}

const documentAt = (uri: string): TextDocument => TextDocument.create(uri, 'fudic', 1, '');

describe('isLibraryDocument', () => {
  it('is true for a library file named directly', () => {
    const uri = URI.file(LIB).toString();
    expect(isLibraryDocument(contextWith(), documentAt(uri), indexOf())).toBe(true);
  });

  it('is false for the author’s own file', () => {
    const uri = URI.file(OWN).toString();
    expect(isLibraryDocument(contextWith(), documentAt(uri), indexOf())).toBe(false);
  });

  it('is false for a file the index has never seen', () => {
    const uri = URI.file('/ws/apps/tienda/src/routes/index.fud').toString();
    expect(isLibraryDocument(contextWith(), documentAt(uri), indexOf())).toBe(false);
  });

  it('sees through an embedded uri', () => {
    // What a service is actually handed: Volar wraps even the root virtual code.
    const embedded = 'volar-embedded-content://root/whatever';
    const context = contextWith({ [embedded]: URI.file(LIB).toString() });
    expect(isLibraryDocument(context, documentAt(embedded), indexOf())).toBe(true);
  });

  it('sees through the `.tmp` copy Volar formats through', () => {
    const uri = `${URI.file(LIB).toString()}.tmp`;
    expect(isLibraryDocument(contextWith(), documentAt(uri), indexOf())).toBe(true);
  });

  it('sees through both at once', () => {
    const embedded = 'volar-embedded-content://root/whatever';
    const context = contextWith({ [embedded]: `${URI.file(LIB).toString()}.tmp` });
    expect(isLibraryDocument(context, documentAt(embedded), indexOf())).toBe(true);
  });
});
