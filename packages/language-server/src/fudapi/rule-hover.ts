/**
 * The hover over what a remote rule is written with (SDD-80 §4.8): `remote` after `runs`, and
 * `debounce`. They are words of the language, not names, so the hover explains them.
 */

import type { Span } from '@fudic/diagnostics';
import type { Hover } from 'vscode-languageserver-protocol';
import { rangeOf, touches, type ApiDocument } from './document.js';

/** What each value of `runs` does, in the browser and on the server. */
export const RUNS_DOC: Readonly<Record<'both' | 'server' | 'remote', string>> = {
  both: 'Runs in the browser while typing and again on the server on submit.',
  server: 'Runs only on the server, on submit. The browser never sees it.',
  remote: 'The browser asks the server while typing; the server also runs it on submit.',
};

const REMOTE = `${RUNS_DOC.remote} It is always async. The question is \`POST /_fudic/rule/<id>/<name>\` with the value the rule watches and the parameters of its use — never the whole form —, in binary unless the rule says \`use json\`. A failed question (network, 401, 429, 500) passes as valid: the submit is the authority.`;

const DEBOUNCE =
  'Milliseconds between the last change of the value and the question to the server; `300` when not written. Only in a `runs remote` rule.';

export function ruleHover(doc: ApiDocument, offset: number): Hover | undefined {
  for (const d of doc.source.file.declarations) {
    if (d.kind !== 'rule') continue;
    const runs = d.runs?.value;
    if (runs?.text === 'remote' && touches(runs.span, offset)) return hover(doc, REMOTE, runs.span);
    if (d.debounce !== undefined && touches(d.debounce.keyword, offset)) return hover(doc, DEBOUNCE, d.debounce.keyword);
  }
  return undefined;
}

function hover(doc: ApiDocument, value: string, span: Span): Hover {
  return { contents: { kind: 'markdown', value }, range: rangeOf(doc.path, doc.text, span) };
}
