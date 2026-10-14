/**
 * A piece's sibling URLs, moved to the fingerprinted segment as it is copied (BUG-47 §4.5).
 *
 * A publisher's runtime build writes the URLs of the pieces it imports with the version alone —
 * `/_fudic/0.0.1/dom/browser.js` — because it cannot know a fingerprint that depends on bytes
 * it is producing. The pieces are copied under `/_fudic/0.0.1-<fingerprint>/…`, so without this
 * the second piece a page asks for is a 404.
 *
 * **The map moves with the code.** A piece is minified onto one line, so lengthening a URL near
 * its start shifts every column after it, and a map left alone would point every later
 * breakpoint nine characters off. Only the generated column of each segment changes: it is
 * the first field and the only one measured on the generated line, so the rest of each
 * segment is copied as it is.
 */

import { RUNTIME_DIR } from '@fudic/conventions';
import { PIECE_URL } from './runtime-pieces.js';

/** A piece's code and, when it has one, its serialized map. */
export interface PieceText {
  readonly code: string;
  readonly map?: string;
}

/** One cut in the generated code: where on which line, how long, and by how much it grows. */
interface Cut {
  readonly line: number;
  readonly column: number;
  readonly end: number;
  readonly delta: number;
}

/**
 * `piece` with every sibling URL in `segments` — `<version>/<short>` → fingerprinted segment —
 * rewritten, and its map shifted to match. A URL of a publisher not in `segments` is left alone.
 */
export function rewritePieceUrls(piece: PieceText, segments: ReadonlyMap<string, string>): PieceText {
  const edits: { readonly at: number; readonly length: number; readonly text: string }[] = [];
  for (const match of piece.code.matchAll(PIECE_URL)) {
    const version = match[1]!;
    const segment = segments.get(`${version}/${match[2]!}`);
    if (segment === undefined) continue;
    // The version is the segment right after `/_fudic/`.
    edits.push({ at: match.index + RUNTIME_DIR.length + 2, length: version.length, text: segment });
  }
  if (edits.length === 0) return piece;

  const code = edits
    .toReversed()
    .reduce((out, e) => out.slice(0, e.at) + e.text + out.slice(e.at + e.length), piece.code);
  if (piece.map === undefined) return { code };
  const cuts = edits.map((e) => cutAt(piece.code, e.at, e.length, e.text.length - e.length));
  return { code, map: shiftMap(piece.map, cuts) };
}

/** An edit at `offset` as a line and column of the ORIGINAL code. */
function cutAt(code: string, offset: number, length: number, delta: number): Cut {
  const before = code.slice(0, offset);
  const line = before.split('\n').length - 1;
  const column = offset - (before.lastIndexOf('\n') + 1);
  return { line, column, end: column + length, delta };
}

/** The serialized map with the generated columns after each cut moved by its growth. */
function shiftMap(source: string, cuts: readonly Cut[]): string {
  const map = JSON.parse(source) as { mappings: string };
  const lines = map.mappings.split(';').map((text, line) => {
    const here = cuts.filter((c) => c.line === line);
    return here.length === 0 ? text : shiftLine(text, here);
  });
  return JSON.stringify({ ...map, mappings: lines.join(';') });
}

function shiftLine(text: string, cuts: readonly Cut[]): string {
  let previousOld = 0;
  let previousNew = 0;
  return text
    .split(',')
    .map((segment) => {
      if (segment === '') return segment;
      const [relative, rest] = firstVlq(segment);
      const oldColumn = previousOld + relative;
      const newColumn = oldColumn + cuts.filter((c) => c.end <= oldColumn).reduce((sum, c) => sum + c.delta, 0);
      const out = encodeVlq(newColumn - previousNew) + rest;
      previousOld = oldColumn;
      previousNew = newColumn;
      return out;
    })
    .join(',');
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The first Base64 VLQ of a segment, and the text after it. */
function firstVlq(segment: string): readonly [number, string] {
  let value = 0;
  let shift = 0;
  let i = 0;
  for (;;) {
    const digit = BASE64.indexOf(segment.charAt(i));
    i += 1;
    value += (digit & 31) << shift;
    shift += 5;
    if ((digit & 32) === 0) break;
  }
  const signed = value & 1 ? -(value >>> 1) : value >>> 1;
  return [signed, segment.slice(i)];
}

function encodeVlq(n: number): string {
  let value = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = value & 31;
    value >>>= 5;
    if (value > 0) digit |= 32;
    out += BASE64.charAt(digit);
  } while (value > 0);
  return out;
}
