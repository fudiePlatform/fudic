/**
 * Formatting while typing (SDD-26 §4.7).
 *
 * «Limited to reindenting the current line after a `}` or a `>`; it reorganizes nothing.»
 * That sentence is the whole specification, and it is a strong one: this function may only
 * ever replace the LEADING WHITESPACE of one line. It does not parse, it cannot fail, and
 * it cannot touch a character the user typed — which is what makes it safe to run on every
 * keystroke, in a document that is broken by definition while it is being written.
 *
 * The line it aligns to is found by counting, not by parsing: a closing brace lines up with
 * its opening one, a closing tag with its opening one. When the count does not come out —
 * and while a file is half-written it often will not — nothing happens at all.
 */

import type { Span } from '@fudic/compiler';

/** A replacement for one stretch of text. The only shape this module can produce. */
export interface Reindent {
  readonly span: Span;
  readonly text: string;
}

/** The offsets of the line containing `offset`. */
function lineAt(source: string, offset: number): { readonly start: number; readonly end: number } {
  const start = source.lastIndexOf('\n', Math.max(offset - 1, 0)) + 1;
  const found = source.indexOf('\n', start);
  return { start, end: found === -1 ? source.length : found };
}

/** The leading whitespace of the line that contains `offset`. */
function indentOfLineAt(source: string, offset: number): string {
  const { start, end } = lineAt(source, offset);
  const line = source.slice(start, end);
  return line.slice(0, line.length - line.trimStart().length);
}

/** Scan back from `from` for the `{` that matches a `}` at that position. */
function matchingBrace(source: string, from: number): number | undefined {
  let depth = 0;
  for (let i = from; i >= 0; i -= 1) {
    const char = source[i];
    if (char === '}') depth += 1;
    else if (char === '{') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

/** Scan back from `from` for the `<name` that matches a `</name>` at that position. */
function matchingTag(source: string, from: number, name: string): number | undefined {
  const open = new RegExp(`<${name}(?=[\\s/>])`, 'gu');
  const close = new RegExp(`</${name}>`, 'gu');
  const before = source.slice(0, from);
  const marks = [
    ...[...before.matchAll(open)].map((m) => ({ at: m.index, step: -1 })),
    ...[...before.matchAll(close)].map((m) => ({ at: m.index, step: 1 })),
  ].sort((a, b) => b.at - a.at);

  let depth = 1;
  for (const mark of marks) {
    depth += mark.step;
    if (depth === 0) return mark.at;
  }
  return undefined;
}

const CLOSING_TAG = /^<\/([A-Za-z][^\s>]*)>/u;

/**
 * The reindent for the line `offset` sits on, or `undefined` when there is nothing to do.
 *
 * `undefined` is the common answer and the right default: a line that is not a lone closing
 * brace or a lone closing tag is a line the user is still writing.
 */
export function reindentLine(source: string, offset: number): Reindent | undefined {
  const { start, end } = lineAt(source, offset);
  const line = source.slice(start, end);
  const head = line.slice(0, line.length - line.trimStart().length);
  const rest = line.trimStart();

  let anchor: number | undefined;
  if (rest.startsWith('}')) {
    anchor = matchingBrace(source, start + head.length);
  } else {
    const closing = CLOSING_TAG.exec(rest);
    // Only a line that BEGINS with the closing tag: `</p>` at the end of a line of prose is
    // not an indentation question, it is prose.
    if (closing === null) return undefined;
    anchor = matchingTag(source, start, closing[1]!);
  }
  if (anchor === undefined) return undefined;

  // The anchor's own indentation is the answer, verbatim. No option is consulted here:
  // choosing a width would be inventing indentation, and inventing is reorganizing.
  const target = indentOfLineAt(source, anchor);
  if (target === head) return undefined;
  return { span: { start, end: start + head.length }, text: target };
}
