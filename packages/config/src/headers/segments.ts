/**
 * The pieces of a header's value as they are written: what is left of its first line and each
 * continuation, each with its offset in the file. Every check points into these, so a problem in
 * the third line of a CSP lands on that line and not on the header.
 */

import { span, type FileDiagnostic, type Span } from '@fudic/diagnostics';

/** The three files, by what they govern. */
export type HeadersKind = 'page' | 'sw' | 'assets';

/** One header of a file, its continuations already joined. */
export interface HeaderEntry {
  readonly name: string;
  /** Continuations joined with the header's separator. `''` only in `assets.headers`: not sent. */
  readonly value: string;
  /** From the name to the end of its last continuation. */
  readonly span: Span;
}

/** A trimmed, non-empty piece of text and where it starts. */
export interface Piece {
  readonly text: string;
  readonly span: Span;
}

/** What a value check receives: the header, where it is, and its pieces. */
export interface ValueCtx {
  readonly kind: HeadersKind;
  /** The file the diagnostics are about: `page.headers`, … */
  readonly file: string;
  readonly entry: HeaderEntry;
  /** The span of the name alone. */
  readonly nameSpan: Span;
  /** The rest of the first line, then each continuation; blank and comment lines skipped. */
  readonly segments: readonly Piece[];
}

/** A check of a header's value. */
export type ValueCheck = (ctx: ValueCtx) => readonly FileDiagnostic[];

/** The span of the name of `entry`. */
export function nameSpanOf(entry: HeaderEntry): Span {
  return span(entry.span.start, entry.span.start + entry.name.length);
}

/** The value of `entry` as written in `text`, line by line. */
export function segmentsOf(text: string, entry: HeaderEntry): readonly Piece[] {
  const out: Piece[] = [];
  let offset = entry.span.start + entry.name.length + 1;
  text
    .slice(offset, entry.span.end)
    .split('\n')
    .forEach((line, i) => {
      const piece = trimmed(line, offset);
      // A `#` opens a comment only on a line of its own, never in the first line's value.
      if (piece !== undefined && (i === 0 || !piece.text.startsWith('#'))) out.push(piece);
      offset += line.length + 1;
    });
  return out;
}

/** `segments` split at `separator`, each part trimmed; the empty ones dropped. */
export function partsOf(segments: readonly Piece[], separator: string): readonly Piece[] {
  const out: Piece[] = [];
  for (const segment of segments) {
    let offset = segment.span.start;
    for (const part of segment.text.split(separator)) {
      const piece = trimmed(part, offset);
      if (piece !== undefined) out.push(piece);
      offset += part.length + separator.length;
    }
  }
  return out;
}

/** The words of `piece`, separated by whitespace. */
export function wordsOf(piece: Piece): readonly Piece[] {
  return [...piece.text.matchAll(/\S+/gu)].map((m) => ({
    text: m[0],
    span: span(piece.span.start + m.index, piece.span.start + m.index + m[0].length),
  }));
}

/** `text` without the whitespace around it, with its span from `offset`; undefined when empty. */
function trimmed(text: string, offset: number): Piece | undefined {
  const body = text.trim();
  if (body === '') return undefined;
  const start = offset + text.length - text.trimStart().length;
  return { text: body, span: span(start, start + body.length) };
}
