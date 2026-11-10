/**
 * The quick fixes of a `.fudapi` (SDD-81 §3.8), each anchored on its diagnostic:
 *
 * - `FUD1480` on an argument of a `get`: the function becomes a `post`, which carries a body. Not
 *   for a route or query parameter: those are in the URL whatever the verb.
 * - `FUD1482`: the `= …` of a file field goes; a file starts empty.
 */

import type { FnDecl } from '@fudic/api';
import type { SourceDiagnostic, Span } from '@fudic/diagnostics';
import type { CodeAction } from 'vscode-languageserver-protocol';
import { rangeOf, type ApiDocument } from './document.js';

const inside = (outer: Span, inner: Span): boolean => outer.start <= inner.start && inner.end <= outer.end;

function action(doc: ApiDocument, uri: string, title: string, at: Span, newText: string): CodeAction {
  return {
    title,
    kind: 'quickfix',
    isPreferred: true,
    diagnostics: [],
    edit: { changes: { [uri]: [{ range: rangeOf(doc.path, doc.text, at), newText }] } },
  };
}

/** `FUD1480` inside a body argument of a `get`: make it a `post`. */
function toPost(doc: ApiDocument, uri: string, d: SourceDiagnostic): CodeAction | undefined {
  const fn = doc.source.file.declarations.find((x): x is FnDecl => x.kind === 'fn' && inside(x.span, d.span));
  const arg = fn?.args.find((a) => inside(a.span, d.span));
  if (fn?.verb !== 'get' || arg?.place !== 'body') return undefined;
  return action(doc, uri, 'Make it a post', fn.verbSpan, 'post');
}

/** `FUD1482`: the initial value, with its `=` and the blanks before it. */
function dropInitial(doc: ApiDocument, uri: string, d: SourceDiagnostic): CodeAction {
  const start = /\s*=\s*$/u.exec(doc.text.slice(0, d.span.start))!.index;
  return action(doc, uri, 'Remove the initial value', { start, end: d.span.end }, '');
}

/** Who repairs each code: the one table of this file that reads a code (`@fudic/diagnostics` house rule). */
const REPAIRS: ReadonlyMap<string, (doc: ApiDocument, uri: string, d: SourceDiagnostic) => CodeAction | undefined> = new Map([['FUD1480', toPost], ['FUD1482', dropInitial]]);

/** The repairs of the diagnostics whose span meets `[start, end]`. */
export function apiRepairs(doc: ApiDocument, uri: string, diagnostics: readonly SourceDiagnostic[], start: number, end: number): CodeAction[] {
  const out: CodeAction[] = [];
  for (const d of diagnostics) {
    if (d.span.start > end || start > d.span.end) continue;
    const fix = REPAIRS.get(d.code)?.(doc, uri, d);
    if (fix !== undefined) out.push(fix);
  }
  return out;
}
