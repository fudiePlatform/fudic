/**
 * The Volar language plugin, as the server mounts it (SDD-24 §4.1).
 *
 * The plugin itself is `@fudic/typecheck`'s — the build mounts the same one (SDD-35 §4.1). What
 * is the server's is how it names a script: by `URI`, including the throwaway `<uri>.tmp` Volar
 * formats through, and with the documents coming out of the versioned cache.
 */

import type { LanguagePlugin } from '@volar/language-core';
import { fudLanguagePlugin, type FudicVirtualCode } from '@fudic/typecheck';
import type { URI } from 'vscode-uri';
import type { CachedDocument, DocumentCache } from './document-cache.js';
import { isFudSourceUri, isFudUri, uriToPath } from './uri.js';

/** The language plugin over a document cache. */
export function createFudicLanguagePlugin(
  cache: DocumentCache,
): LanguagePlugin<URI, FudicVirtualCode<CachedDocument>> {
  return fudLanguagePlugin<URI, CachedDocument>({
    isFud: isFudUri,
    isFudSource: isFudSourceUri,
    pathOf: uriToPath,
    documents: cache,
  });
}
