/**
 * The Volar language plugin of a `.fudspec` (SDD-52 §4.4).
 *
 * A criteria file is one language and nothing is embedded in it: no HTML, no CSS, no script.
 * So its virtual code is the file itself, mapped one to one, with no embedded codes — which is
 * also what keeps every service of the `.fud` out of it: there is no TypeScript, HTML or CSS
 * document for them to answer in.
 */

import type { CodeInformation, IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
import type { URI } from 'vscode-uri';
import { isFudspecUri } from '../uri.js';

/** The `languageId` a `.fudspec` is registered under, here and in the editor. */
export const FUDSPEC_LANGUAGE_ID = 'fudspec';

/** Every feature, on the one mapping there is: the services of this file answer all of it. */
const EVERYTHING: CodeInformation = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
  // SDD-53: the `.fudspec` service formats the file.
  format: true,
};

function rootCode(snapshot: IScriptSnapshot): VirtualCode {
  const length = snapshot.getLength();
  return {
    id: 'root',
    languageId: FUDSPEC_LANGUAGE_ID,
    snapshot,
    mappings: [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [length], data: EVERYTHING }],
  };
}

export function createFudspecLanguagePlugin(): LanguagePlugin<URI> {
  return {
    getLanguageId: (uri) => (isFudspecUri(uri) ? FUDSPEC_LANGUAGE_ID : undefined),
    createVirtualCode: (uri, languageId, snapshot) =>
      languageId === FUDSPEC_LANGUAGE_ID || isFudspecUri(uri) ? rootCode(snapshot) : undefined,
    updateVirtualCode: (_uri, _code, snapshot) => rootCode(snapshot),
  };
}
