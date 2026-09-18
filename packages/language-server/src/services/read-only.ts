/**
 * A library's `.fud` is READ-ONLY (SDD-43 §4.4).
 *
 * It is in the index and in the TypeScript program for one reason — so the contract it
 * declares is a type and not `any` — and that is the whole of what it is there for. It is
 * navigated, hovered and jumped into; it is not diagnosed as the author's code and not
 * formatted. The author of an app cannot act on a single warning inside a package they did
 * not write, and a formatter that rewrites a file under `node_modules` writes into something
 * the next install replaces.
 *
 * It has to be a wrapper around EVERY service rather than a rule inside ours, because the
 * services that would speak here are TypeScript's, HTML's and CSS's: silencing only our own
 * leaves the library file underlined by three other voices.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { FORMATTING_TEMP_SUFFIX, uriToPath } from '../uri.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/**
 * Whether this document is a library's `.fud`.
 *
 * Two hops, the same ones `fudicDocumentOf` takes: what arrives is often an EMBEDDED uri,
 * and while formatting it is the throwaway `<uri>.tmp` Volar rebuilds the document as.
 * Neither is a name the index has ever heard of.
 */
export function isLibraryDocument(
  context: LanguageServiceContext,
  document: TextDocument,
  index: WorkspaceIndex,
): boolean {
  const uri = URI.parse(document.uri);
  const source = context.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
  const path = uriToPath(source);
  const file = path.endsWith(FORMATTING_TEMP_SUFFIX)
    ? path.slice(0, -FORMATTING_TEMP_SUFFIX.length)
    : path;
  return index.get(file)?.external === true;
}

/** Every plugin, answering nothing over a library's file. */
export function silenceLibraryFiles(
  plugins: readonly LanguageServicePlugin[],
  index: WorkspaceIndex,
): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const diagnostics = instance.provideDiagnostics?.bind(instance);
      const formatting = instance.provideDocumentFormattingEdits?.bind(instance);

      return {
        ...instance,
        ...(diagnostics === undefined
          ? {}
          : {
              provideDiagnostics(document, token) {
                if (isLibraryDocument(context, document, index)) return [];
                return diagnostics(document, token);
              },
            }),
        ...(formatting === undefined
          ? {}
          : {
              provideDocumentFormattingEdits(document, range, options, embedded, token) {
                if (isLibraryDocument(context, document, index)) return [];
                return formatting(document, range, options, embedded, token);
              },
            }),
      };
    },
  }));
}
