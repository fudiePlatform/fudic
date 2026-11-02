/**
 * The hover over `catches` in a function (SDD-74 §4.1, decision 174): what the clause keeps on
 * the page and what it leaves to `error-pages`.
 */

import type { Hover } from 'vscode-languageserver-protocol';
import { rangeOf, touches, type ApiDocument } from './document.js';

const CATCHES =
  'The statuses this function keeps for its caller. An `HttpError` with one of them reaches the code that called it — `run()` of a `task` resolves `failed`, a bare `await` rejects — and is painted on the page. Any other status goes to `error-pages`.';

export function catchesHover(doc: ApiDocument, offset: number): Hover | undefined {
  for (const d of doc.source.file.declarations) {
    if (d.kind !== 'fn' || d.catches === undefined || !touches(d.catches.keyword, offset)) continue;
    return { contents: { kind: 'markdown', value: CATCHES }, range: rangeOf(doc.path, doc.text, d.catches.keyword) };
  }
  return undefined;
}
