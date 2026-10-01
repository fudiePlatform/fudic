/**
 * The Volar language plugin (SDD-24 §4.1, SDD-35 §4.2).
 *
 * This is the whole reason Volar is the framework and not a hand-written server: request
 * routing by mapping — source offset → virtual offset → service → answer → back — is several
 * thousand lines already written and tested by other people. What this file provides is the
 * three things Volar cannot know: that `.fud` is a language, what its virtual codes are, and
 * which of them TypeScript should treat as the file's script.
 *
 * The editor and the build mount this same plugin. They differ only in how they name a script
 * — the editor by `URI`, the build by path — and in where a document comes from, which is why
 * both are injected: the logic of what a `.fud` projects to exists once.
 *
 * Re-parsing is whole-document per version (§7): the shape of the AST allows incremental
 * reparse, but implementing it is a later SDD, and `updateVirtualCode` says so by delegating.
 */

import type { IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
// The `typescript` field of a LanguagePlugin is a module augmentation shipped by
// @volar/typescript; without this import it does not exist on the interface.
import type {} from '@volar/typescript';
import { serverFileName } from '@fudic/language-core';
import type { ProjectedFud } from './project.js';
import { createFudicVirtualCode, FUD_LANGUAGE_ID, type FudicVirtualCode } from './virtual-code.js';

/**
 * `ts.ScriptKind.TS` and `ts.ScriptKind.Deferred`.
 *
 * The numeric values are written out rather than imported: the editor typechecks with the
 * PROJECT's TypeScript, and importing the bundled copy here just to read two enum members
 * would pin a second one into the process.
 */
const SCRIPT_KIND_TS = 3;
const SCRIPT_KIND_DEFERRED = 7;

/** Where the documents of a `.fud` come from: a versioned cache in the editor, the disk in the build. */
export interface FudDocuments<D extends ProjectedFud> {
  /** The document at this version, parsed and projected. */
  get(path: string, version: number, source: string): D;
  /** Forget one document. */
  invalidate(path: string): void;
}

/** What the plugin needs to know about the scripts it is handed. */
export interface LanguageDeps<T, D extends ProjectedFud = ProjectedFud> {
  /** Whether a script id names a `.fud` — the language id is answered from this. */
  isFud(id: T): boolean;
  /**
   * Whether a script id names a `.fud` the plugin must build a code for even when the language
   * id says otherwise (the editor's throwaway formatting copy). Defaults to `isFud`.
   */
  isFudSource?(id: T): boolean;
  /** The path a script id names, POSIX-shaped. */
  pathOf(id: T): string;
  readonly documents: FudDocuments<D>;
}

/** The language plugin for `.fud`. */
export function fudLanguagePlugin<T, D extends ProjectedFud = ProjectedFud>(
  deps: LanguageDeps<T, D>,
): LanguagePlugin<T, FudicVirtualCode<D>> {
  const isFudSource = deps.isFudSource ?? deps.isFud;
  // Volar calls create/update only when a snapshot actually changed, so a counter per file is
  // a faithful document version — and it is the cache key that keeps one parse per keystroke.
  const versions = new Map<string, number>();

  const build = (id: T, snapshot: IScriptSnapshot): FudicVirtualCode<D> => {
    const path = deps.pathOf(id);
    const version = (versions.get(path) ?? 0) + 1;
    versions.set(path, version);

    return createFudicVirtualCode(
      deps.documents.get(path, version, snapshot.getText(0, snapshot.getLength())),
    );
  };

  return {
    getLanguageId(id) {
      return deps.isFud(id) ? FUD_LANGUAGE_ID : undefined;
    },

    createVirtualCode(id, languageId, snapshot) {
      // The id of the script decides, not the language id — because the language id is the
      // EDITOR's to choose. Volar passes through whatever the client sent in `didOpen`, and
      // each editor registers `.fud` under its own name: VS Code contributes `fudic`
      // (SDD-25 §3.1), another will contribute something else. Matching only
      // `FUD_LANGUAGE_ID` here builds no virtual code for any of them, and a server with no
      // virtual code answers every request with nothing.
      return languageId === FUD_LANGUAGE_ID || isFudSource(id) ? build(id, snapshot) : undefined;
    },

    updateVirtualCode(id, _code, snapshot) {
      return build(id, snapshot);
    },

    disposeVirtualCode(id) {
      const path = deps.pathOf(id);
      versions.delete(path);
      deps.documents.invalidate(path);
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
       * something. This is where the name it resolves to comes from — and it is why the build
       * mounts a language service host and not `proxyCreateProgram`, which ignores this hook.
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
