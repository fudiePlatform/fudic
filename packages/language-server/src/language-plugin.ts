/**
 * The Volar language plugin (SDD-24 §4.1).
 *
 * This is the whole reason Volar is the framework and not a hand-written server: request
 * routing by mapping — source offset → virtual offset → service → answer → back — is several
 * thousand lines already written and tested by other people. What this file provides is the
 * three things Volar cannot know: that `.fud` is a language, what its virtual codes are, and
 * which of them TypeScript should treat as the file's script.
 *
 * Re-parsing is whole-document per version (§7): the shape of the AST allows incremental
 * reparse, but implementing it is a later SDD, and `updateVirtualCode` says so by delegating.
 */

import type { IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
// The `typescript` field of a LanguagePlugin is a module augmentation shipped by
// @volar/typescript; without this import it does not exist on the interface.
import type {} from '@volar/typescript';
import type { URI } from 'vscode-uri';
import { serverFileName } from '@fudic/language-core';
import type { DocumentCache } from './document-cache.js';
import { isFudUri, uriToPath } from './uri.js';
import { createFudicVirtualCode, FUD_LANGUAGE_ID, type FudicVirtualCode } from './virtual-code.js';

/**
 * `ts.ScriptKind.TS` and `ts.ScriptKind.Deferred`.
 *
 * The numeric values are written out rather than imported: the server typechecks with the
 * PROJECT's TypeScript (§2), and importing the bundled copy here just to read two enum members
 * would pin a second one into the process.
 */
const SCRIPT_KIND_TS = 3;
const SCRIPT_KIND_DEFERRED = 7;

/** The language plugin over a document cache. */
export function createFudicLanguagePlugin(
  cache: DocumentCache,
): LanguagePlugin<URI, FudicVirtualCode> {
  // Volar calls create/update only when a snapshot actually changed, so a counter per file is
  // a faithful document version — and it is the cache key that keeps one parse per keystroke.
  const versions = new Map<string, number>();

  const build = (uri: URI, snapshot: IScriptSnapshot): FudicVirtualCode => {
    const path = uriToPath(uri);
    const version = (versions.get(path) ?? 0) + 1;
    versions.set(path, version);

    return createFudicVirtualCode(
      cache.get(path, version, snapshot.getText(0, snapshot.getLength())),
    );
  };

  return {
    getLanguageId(uri) {
      return isFudUri(uri) ? FUD_LANGUAGE_ID : undefined;
    },

    createVirtualCode(uri, languageId, snapshot) {
      return languageId === FUD_LANGUAGE_ID ? build(uri, snapshot) : undefined;
    },

    updateVirtualCode(uri, _code, snapshot) {
      return build(uri, snapshot);
    },

    disposeVirtualCode(uri) {
      const path = uriToPath(uri);
      versions.delete(path);
      cache.invalidate(path);
    },

    typescript: {
      // `isMixedContent` is what tells TypeScript that a `.fud` is not TypeScript itself: its
      // script comes from the projection, and `Deferred` keeps tsserver from guessing.
      extraFileExtensions: [
        { extension: 'fud', isMixedContent: true, scriptKind: SCRIPT_KIND_DEFERRED },
      ],

      // Volar's augmentation is not generic over the root code, so these two hooks receive a
      // plain `VirtualCode`. The narrowing is safe by construction: the only roots that exist
      // are the ones `build` made.
      getServiceScript(root: VirtualCode) {
        return {
          code: (root as FudicVirtualCode).client,
          extension: '.ts',
          scriptKind: SCRIPT_KIND_TS,
        };
      },

      /**
       * The server virtual as a file of its own.
       *
       * It has to be one: the client virtual derives `$Data` from
       * `typeof import('./x.fud.server')`, so TypeScript must be able to resolve that name to
       * something. This is where the name it resolves to comes from.
       */
      getExtraServiceScripts(fileName: string, root: VirtualCode) {
        return [
          {
            fileName: serverFileName(fileName),
            code: (root as FudicVirtualCode).server,
            extension: '.ts',
            scriptKind: SCRIPT_KIND_TS,
          },
        ];
      },
    },
  };
}
