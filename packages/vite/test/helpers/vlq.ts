/**
 * A minimal Source Map v3 `mappings` decoder, for tests only (BUG-05 §6.7).
 *
 * Only the generated position is decoded: that is what tells whether a map still
 * describes the bytes that were emitted. The source fields are read to advance the VLQ
 * state — a segment's fields are relative to the previous one — and then dropped.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export interface GeneratedPosition {
  readonly generatedLine: number;
  readonly generatedColumn: number;
}

/** Decode one base64-VLQ run into its signed integers. */
function decodeSegment(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error(`not a base64-VLQ digit: ${char}`);
    }
    value += (digit & 31) << shift;
    if ((digit & 32) !== 0) {
      shift += 5;
      continue;
    }
    // The low bit is the sign, the rest the magnitude.
    values.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return values;
}

/** Every mapping of a `mappings` string, as absolute generated positions. */
export function decodeMappings(mappings: string): GeneratedPosition[] {
  const out: GeneratedPosition[] = [];
  const lines = mappings.split(';');
  for (let line = 0; line < lines.length; line += 1) {
    let column = 0;
    for (const segment of lines[line]!.split(',')) {
      if (segment.length === 0) {
        continue;
      }
      const [deltaColumn] = decodeSegment(segment);
      column += deltaColumn ?? 0;
      out.push({ generatedLine: line, generatedColumn: column });
    }
  }
  return out;
}
