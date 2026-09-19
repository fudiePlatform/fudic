/**
 * The synthetic source, and the table that sends every position in it back home (SDD-29
 * §4.10).
 *
 * The expansion writes the text the author would have written: the caller's file with each
 * `@render` replaced, in its place, by the snippet's markup. That text is then parsed like
 * any other, which is what makes the rest of the compiler unable to tell a snippet from
 * hand-written markup — and what makes this table necessary, because a position in it may
 * belong to the caller's file, to the snippet's, or to nothing at all.
 *
 * Three kinds of piece, and they are the whole model:
 *
 *   copied     text taken verbatim from a file, one character for one character;
 *   synthetic  text this compiler wrote — a `(`, an `undefined` — which belongs to no file
 *              and is anchored at the `@render` that caused it;
 *   (nothing)  a piece deleted, like a declaration, which occupies no output at all.
 *
 * It is SDD-11's pattern, one layer up: a synthetic buffer with a region table, and every
 * offset mapped back before anyone is shown it.
 */

import { type Span, span } from '../types/index.js';

/** Where a position of the synthetic source came from. */
export interface Origin {
  /** Absolute path of the file. */
  readonly file: string;
  readonly offset: number;
  /**
   * `false` when the position is inside text this compiler wrote rather than text a file
   * holds — and then `offset` is the anchor, the `@render` that put it there.
   */
  readonly literal: boolean;
}

interface Segment {
  readonly outStart: number;
  readonly outEnd: number;
  readonly file: string;
  readonly srcStart: number;
  readonly srcEnd: number;
  readonly literal: boolean;
  /**
   * Where this piece sits in the file being COMPILED, whatever file it was taken from: its
   * own offset when it is the caller's own text, and the `@render` that pulled it in
   * otherwise.
   *
   * It is what a source map needs and `origin` cannot give it. A module's map has one
   * `sources` entry (SDD-13 §4.3), so a position of a body expanded from another file has no
   * line to point at — and the honest line is the call the author wrote.
   */
  readonly anchor: number;
}

/** The finished table: read-only, and the only thing that leaves this module. */
export class OffsetMap {
  readonly #segments: readonly Segment[];

  constructor(segments: readonly Segment[]) {
    this.#segments = segments;
  }

  /** The segment covering `offset`, or the last one that starts before it. */
  #at(offset: number): Segment | undefined {
    let lo = 0;
    let hi = this.#segments.length - 1;
    let found: Segment | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const segment = this.#segments[mid]!;
      if (segment.outStart > offset) {
        hi = mid - 1;
        continue;
      }
      found = segment;
      lo = mid + 1;
    }
    return found;
  }

  /**
   * Where a position of the synthetic source comes from.
   *
   * A position past the end of every segment answers the end of the last one, which is what
   * a diagnostic at end-of-file wants: the end of the file it was written in.
   */
  origin(offset: number): Origin | undefined {
    const segment = this.#at(offset);
    if (segment === undefined) return undefined;
    if (!segment.literal) {
      return { file: segment.file, offset: segment.srcStart, literal: false };
    }
    const delta = Math.min(offset - segment.outStart, segment.srcEnd - segment.srcStart);
    return { file: segment.file, offset: segment.srcStart + delta, literal: true };
  }

  /**
   * The same position, expressed in the file being COMPILED.
   *
   * Every position has one, which is what makes it the right answer for a source map: text
   * of the caller maps to itself, and text that came from a snippet maps to the `@render`
   * that pulled it in. A file with no expansion answers the offset it was given.
   */
  entryOffset(offset: number): number {
    const segment = this.#at(offset);
    if (segment === undefined) return offset;
    if (segment.anchor !== segment.srcStart || !segment.literal) return segment.anchor;
    return segment.srcStart + Math.min(offset - segment.outStart, segment.srcEnd - segment.srcStart);
  }

  /**
   * Where a SPAN comes from, as one span of one file.
   *
   * A span that starts in one file and ends in another — the markup of a snippet and the
   * argument spliced into it are neighbours in the output, and a node can cover both — is
   * reported at its START, clipped to the segment it begins in. Anything else would be a
   * range that exists in no file, and an editor would underline whatever happened to be at
   * those offsets.
   */
  spanOf(at: Span): { readonly file: string; readonly span: Span } | undefined {
    const start = this.origin(at.start);
    if (start === undefined) return undefined;
    if (!start.literal) return { file: start.file, span: span(start.offset, start.offset) };
    const segment = this.#at(at.start)!;
    const end = Math.min(at.end, segment.outEnd);
    const width = Math.max(0, end - at.start);
    return { file: start.file, span: span(start.offset, start.offset + width) };
  }
}

/** Builds the synthetic source and its table, one piece at a time. */
export class ExpandedText {
  #out = '';
  readonly #segments: Segment[] = [];
  /**
   * The `@render` of the file being compiled that everything written from now on came from,
   * or `null` while the file's own text is being copied.
   */
  #anchor: number | null = null;

  /** Everything written while this is set belongs, for a source map, to that call. */
  anchoredAt(offset: number | null): void {
    this.#anchor = offset;
  }

  /** Text taken verbatim from a file: one character out for one character in. */
  copy(file: string, source: string, at: Span): void {
    if (at.end <= at.start) return;
    this.#push(source.slice(at.start, at.end), file, at, true);
  }

  /** Text this compiler wrote, anchored where the author can act on it. */
  synthetic(text: string, anchor: { readonly file: string; readonly at: Span }): void {
    this.#push(text, anchor.file, anchor.at, false);
  }

  /** One piece, of either kind: the one place a segment is built and the anchor resolved. */
  #push(text: string, file: string, at: Span, literal: boolean): void {
    this.#segments.push({
      outStart: this.#out.length,
      outEnd: this.#out.length + text.length,
      file,
      srcStart: at.start,
      srcEnd: at.end,
      literal,
      anchor: this.#anchor ?? at.start,
    });
    this.#out += text;
  }

  get text(): string {
    return this.#out;
  }

  build(): OffsetMap {
    return new OffsetMap(this.#segments);
  }
}
