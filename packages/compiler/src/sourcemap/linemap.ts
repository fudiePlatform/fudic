/**
 * `LineMap` (SDD-13 §3.2) — the single edge where the offset world becomes the
 * line/column world of the editor. Every Span in the project stays an offset so
 * this conversion is O(log n) and lives in exactly one place. Never throws:
 * out-of-range clamps to [0, length] (the "parser never throws" rule carried into
 * a pure utility).
 */

import { type Span } from '../types/index.js';
import { type Position, type Range } from './position.js';

const LF = 10; // \n
const CR = 13; // \r

/**
 * Precomputed line-start table over a source. O(n) to build, O(log n) per query.
 * Line breaks recognized: `\n`, `\r\n`, `\r`. `character` counts UTF-16 code units
 * from the line start (same unit as Span offsets), so conversion is exact and
 * lossless.
 */
export class LineMap {
  /** Offset of the first character of each line. `lineStarts[0] === 0`, length ≥ 1. */
  readonly #lineStarts: readonly number[];
  readonly #length: number;

  constructor(source: string) {
    const starts: number[] = [0];
    const n = source.length;
    for (let i = 0; i < n; ) {
      const c = source.charCodeAt(i);
      if (c === LF) {
        starts.push(i + 1);
        i += 1;
      } else if (c === CR) {
        // `\r\n` is ONE break, not two empty lines.
        if (source.charCodeAt(i + 1) === LF) {
          starts.push(i + 2);
          i += 2;
        } else {
          starts.push(i + 1);
          i += 1;
        }
      } else {
        i += 1;
      }
    }
    this.#lineStarts = starts;
    this.#length = n;
  }

  /** Number of lines (≥ 1). */
  get lineCount(): number {
    return this.#lineStarts.length;
  }

  /** (line, character) for a UTF-16 offset. Out-of-range clamps to [0, length]. */
  positionAt(offset: number): Position {
    const clamped = offset < 0 ? 0 : offset > this.#length ? this.#length : offset;
    // Greatest index `lo` with lineStarts[lo] <= clamped (binary search).
    let lo = 0;
    let hi = this.#lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.#lineStarts[mid]! <= clamped) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return { line: lo, character: clamped - this.#lineStarts[lo]! };
  }

  /** UTF-16 offset for a position. Out-of-range clamps to [0, length]. */
  offsetAt(position: Position): number {
    if (position.line < 0) {
      return 0;
    }
    if (position.line >= this.#lineStarts.length) {
      return this.#length;
    }
    const base = this.#lineStarts[position.line]!;
    const character = position.character < 0 ? 0 : position.character;
    const offset = base + character;
    return offset > this.#length ? this.#length : offset;
  }
}

/** Convert a Span to an LSP Range via a LineMap. The edge where offsets become positions. */
export function rangeOf(lineMap: LineMap, s: Span): Range {
  return { start: lineMap.positionAt(s.start), end: lineMap.positionAt(s.end) };
}
