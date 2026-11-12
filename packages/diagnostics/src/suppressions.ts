/**
 * `fud-disable` and `fud-disable-next-line`: a warning silenced where it occurs, with the reason
 * written beside it. The directive lives inside the comments each language already has, so every
 * reader hands its comments here and the directive is read in one place.
 */

import { codeInfo } from './catalog.js';
import { FUD1520 } from './codes/FUD1520.js';
import { FUD1521 } from './codes/FUD1521.js';
import { FUD1522 } from './codes/FUD1522.js';
import type { LineMap } from './linemap.js';
import type { Span } from './span.js';
import type { FudCode, SourceDiagnostic } from './types.js';

/** One directive that silences something. */
export interface Suppression {
  readonly codes: readonly FudCode[];
  readonly scope: 'file' | 'next-line';
  /** The comment, for FUD1523 and the editor. */
  readonly span: Span;
  /** The 0-based line it covers; absent for scope 'file'. */
  readonly line?: number;
}

/**
 * A comment as its reader found it: `span` covers all of it and `text` is what is written there,
 * delimiters included (`@* … *@`, `/* … *\/`, `// …`, `# …`), so a code can be pointed at.
 */
export interface SourceComment {
  readonly span: Span;
  readonly text: string;
}

export interface SuppressionsResult {
  readonly suppressions: readonly Suppression[];
  readonly diagnostics: readonly SourceDiagnostic[];
}

/** The delimiters of the comments the readers hand over: opener, then closer when it has one. */
const OPENER = /^(?:@\*|\/\*+|\/\/|#)/u;
const CLOSER = /(?:\*+\/|\*@)$/u;

const KEYWORD = /^fud-disable(-next-line)?(?=[\s:]|$)/u;
const CODE = /^FUD\d{4}$/u;

/** Reads the fud-disable directives out of a file's comments. Never throws. */
export function readSuppressions(comments: readonly SourceComment[], lines: LineMap): SuppressionsResult {
  const suppressions: Suppression[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  for (const comment of comments) {
    const read = readOne(comment, lines, diagnostics);
    if (read !== undefined) suppressions.push(read);
  }
  return { suppressions, diagnostics };
}

function readOne(comment: SourceComment, lines: LineMap, diagnostics: SourceDiagnostic[]): Suppression | undefined {
  const opener = OPENER.exec(comment.text)?.[0].length ?? 0;
  const closer = CLOSER.exec(comment.text.slice(opener))?.[0].length ?? 0;
  const body = comment.text.slice(opener, comment.text.length - closer);
  const lead = body.length - body.trimStart().length;
  const text = body.trim();
  if (!text.startsWith('fud-disable')) return undefined;

  const refuse = (reason: string): undefined => {
    diagnostics.push(FUD1522({ span: comment.span, reason }));
    return undefined;
  };
  const keyword = KEYWORD.exec(text);
  if (keyword === null) return refuse('it is neither `fud-disable` nor `fud-disable-next-line`');

  const colon = text.indexOf(':', keyword[0].length);
  const list = text.slice(keyword[0].length, colon < 0 ? text.length : colon);
  if (list.trim() === '') return refuse('it names no code');

  // Where `list` starts in the source, so each code is underlined where it is written.
  let at = comment.span.start + opener + lead + keyword[0].length;
  const named: { readonly code: string; readonly span: Span }[] = [];
  for (const part of list.split(',')) {
    const code = part.trim();
    if (!CODE.test(code)) return refuse(code === '' ? 'a code is missing between two commas' : `"${code}" is not a code`);
    const start = at + part.indexOf(code);
    named.push({ code, span: { start, end: start + code.length } });
    at += part.length + 1;
  }
  if (colon < 0 || text.slice(colon + 1).trim() === '') return refuse('it gives no reason after the codes');

  const codes: FudCode[] = [];
  for (const { code, span } of named) {
    const info = codeInfo(code);
    if (info === undefined || 'retired' in info) {
      diagnostics.push(
        FUD1520({ place: 'comment', code, span, ...(info === undefined ? {} : { replacedBy: info.replacedBy }) }),
      );
    } else if (info.severity === 'error') {
      diagnostics.push(FUD1521({ place: 'comment', code: info.code, span }));
    } else if (!codes.includes(info.code)) {
      codes.push(info.code);
    }
  }
  if (codes.length === 0) return undefined;
  return keyword[1] === undefined
    ? { codes, scope: 'file', span: comment.span }
    : { codes, scope: 'next-line', span: comment.span, line: lines.positionAt(comment.span.end).line + 1 };
}
