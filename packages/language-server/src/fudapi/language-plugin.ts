/**
 * The Volar language plugin of a `.fudapi` (SDD-60 §4.9).
 *
 * A contract file is one language and nothing is embedded in it: no HTML, no CSS, no script.
 * So its virtual code is the file itself, mapped one to one, with no embedded codes — which is
 * also what keeps every service of the `.fud` out of it: there is no TypeScript, HTML or CSS
 * document for them to answer in.
 */

import type { CodeInformation, IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
import type { URI } from 'vscode-uri';
import { isFudapiUri } from '../uri.js';

/** The `languageId` a `.fudapi` is registered under, here and in the editor. */
export const FUDAPI_LANGUAGE_ID = 'fudapi';

/** Every feature, on the one mapping there is: the services of this file answer all of it. */
const EVERYTHING: CodeInformation = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: true,
};

function rootCode(snapshot: IScriptSnapshot): VirtualCode {
  return {
    id: 'root',
    languageId: FUDAPI_LANGUAGE_ID,
    snapshot,
    mappings: [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [snapshot.getLength()], data: EVERYTHING }],
  };
}

export function createFudapiLanguagePlugin(): LanguagePlugin<URI> {
  return {
    getLanguageId: (uri) => (isFudapiUri(uri) ? FUDAPI_LANGUAGE_ID : undefined),
    createVirtualCode: (uri, languageId, snapshot) =>
      languageId === FUDAPI_LANGUAGE_ID || isFudapiUri(uri) ? rootCode(snapshot) : undefined,
    updateVirtualCode: (_uri, _code, snapshot) => rootCode(snapshot),
  };
}
