/**
 * Source Map v3 builder (SDD-13 §3.3). Accumulates (output offset ↔ source offset)
 * pairs and serializes a standard Source Map v3 (Base64 VLQ). Both offsets are
 * converted to positions with the respective LineMap; segments are VLQ-encoded.
 * Never throws.
 *
 * v1 maps 4 fields per segment (generated column, source index, source line,
 * source column) and no `names` (the 5th field) — identifiers are not mapped yet.
 */

import { type LineMap } from './linemap.js';

export interface SourceMapV3 {
  readonly version: 3;
  readonly file: string;
  readonly sources: readonly string[];
  readonly sourcesContent: readonly (string | null)[];
  readonly names: readonly string[];
  readonly mappings: string; // Base64 VLQ
}

export interface SourceMapOptions {
  /** Generated file name (the emit output). */
  readonly file: string;
  /** The `.fud` path recorded in `sources`. */
  readonly source: string;
  /** The `.fud` text, embedded in `sourcesContent`. */
  readonly sourceContent: string;
  /** LineMap over the ORIGINAL `.fud` source. */
  readonly sourceLineMap: LineMap;
  /** LineMap over the GENERATED output (built by the emit over its own text). */
  readonly generatedLineMap: LineMap;
}

interface Mapping {
  readonly generatedOffset: number;
  readonly sourceOffset: number;
  /** The author's identifier at this position, when the anchor sits on one. */
  readonly name?: string;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 VLQ of a signed integer (source-map v3 encoding). */
function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) {
      digit |= 32; // continuation bit
    }
    out += BASE64[digit];
  } while (vlq > 0);
  return out;
}

/**
 * Accumulates output↔source segments and serializes a Source Map v3. `build` is
 * idempotent; mappings come out sorted by generated position.
 */
export class SourceMapBuilder {
  readonly #options: SourceMapOptions;
  readonly #mappings: Mapping[] = [];

  constructor(options: SourceMapOptions) {
    this.#options = options;
  }

  /**
   * Record that generated `generatedOffset` originates from `.fud` `sourceOffset`.
   *
   * `name` is the identifier the author wrote there, when the anchor sits on one. It is what
   * a debugger needs to answer `n()` in the console after a minifier has renamed `n` to `p`:
   * positions alone cannot say that two spellings are the same binding.
   */
  addMapping(generatedOffset: number, sourceOffset: number, name?: string): void {
    this.#mappings.push(
      name === undefined ? { generatedOffset, sourceOffset } : { generatedOffset, sourceOffset, name },
    );
  }

  /** Serialize. Idempotent; mappings are sorted by generated position. */
  build(): SourceMapV3 {
    // The `names` array, built as the mappings are read and shared by every segment that
    // spells the same identifier — the fifth field is an INDEX into it, not a string.
    const names: string[] = [];
    const nameIndex = new Map<string, number>();
    const indexOfName = (name: string): number => {
      const known = nameIndex.get(name);
      if (known !== undefined) return known;
      const i = names.length;
      names.push(name);
      nameIndex.set(name, i);
      return i;
    };

    const segments = this.#mappings
      .map((m) => ({
        gen: this.#options.generatedLineMap.positionAt(m.generatedOffset),
        src: this.#options.sourceLineMap.positionAt(m.sourceOffset),
        name: m.name,
      }))
      .sort((a, b) => a.gen.line - b.gen.line || a.gen.character - b.gen.character);

    let mappings = '';
    let prevGenLine = 0;
    let prevGenColumn = 0;
    let prevSourceLine = 0;
    let prevSourceColumn = 0;
    let prevNameIndex = 0;
    let lineHasSegment = false;

    for (const seg of segments) {
      if (seg.gen.line > prevGenLine) {
        mappings += ';'.repeat(seg.gen.line - prevGenLine);
        prevGenLine = seg.gen.line;
        prevGenColumn = 0;
        lineHasSegment = false;
      }
      if (lineHasSegment) {
        mappings += ',';
      }
      // 4 fields: Δgenerated column, Δsource index (single source ⇒ always 0),
      // Δsource line, Δsource column. Generated column resets per generated line;
      // the source fields carry across lines.
      mappings += encodeVlq(seg.gen.character - prevGenColumn);
      mappings += encodeVlq(0);
      mappings += encodeVlq(seg.src.line - prevSourceLine);
      mappings += encodeVlq(seg.src.character - prevSourceColumn);
      // The fifth field, and only when there is a name: a segment of four fields and one of
      // five are both legal, and a name index is not something to invent for a segment that
      // does not sit on an identifier.
      if (seg.name !== undefined) {
        const i = indexOfName(seg.name);
        mappings += encodeVlq(i - prevNameIndex);
        prevNameIndex = i;
      }
      prevGenColumn = seg.gen.character;
      prevSourceLine = seg.src.line;
      prevSourceColumn = seg.src.character;
      lineHasSegment = true;
    }

    return {
      version: 3,
      file: this.#options.file,
      sources: [this.#options.source],
      sourcesContent: [this.#options.sourceContent],
      names,
      mappings,
    };
  }
}
