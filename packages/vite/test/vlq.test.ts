/**
 * The `mappings` decoder the source-map suites read a build's maps with.
 *
 * It is test infrastructure, and it is tested: three suites now assert things ABOUT a map —
 * density, which source a segment names, which line of the `.fud` a breakpoint would land on
 * — so a decoder that quietly mis-accumulates would make all three agree on the wrong answer.
 */

import { describe, it, expect } from 'vitest';
import { decodeMappings } from './helpers/vlq.js';

describe('decodeMappings', () => {
  it('decodes a four-field segment into a generated AND a source position', () => {
    // `AAAA` is [0, 0, 0, 0]: column 0 of line 0, source 0, source line 0.
    expect(decodeMappings('AAAA')).toEqual([
      { generatedLine: 0, generatedColumn: 0, sourceIndex: 0, sourceLine: 0 },
    ]);
  });

  it('accumulates the source fields ACROSS lines, and resets only the column', () => {
    // Two lines, one segment each, every field advancing by one: `CCCC` is [1, 1, 1, 1].
    const [first, second] = decodeMappings('CCCC;CCCC');
    expect(first).toEqual({ generatedLine: 0, generatedColumn: 1, sourceIndex: 1, sourceLine: 1 });
    // The generated column restarted at 0 + 1; the source fields kept going.
    expect(second).toEqual({ generatedLine: 1, generatedColumn: 1, sourceIndex: 2, sourceLine: 2 });
  });

  it('reads a ONE-FIELD segment as a generated position that names no source', () => {
    // Legal in the format and what a bundler writes for code that came from nowhere.
    expect(decodeMappings('A')).toEqual([{ generatedLine: 0, generatedColumn: 0 }]);
  });

  it('skips an empty line of the mappings, which is a line with nothing on it', () => {
    expect(decodeMappings('AAAA;;AAAA')).toHaveLength(2);
  });

  it('decodes a continued VLQ — a value that does not fit in one digit', () => {
    // `gB` is [16]: the first digit carries the continuation bit.
    expect(decodeMappings('gB')[0]!.generatedColumn).toBe(16);
  });

  it('refuses a character that is not a base64-VLQ digit', () => {
    expect(() => decodeMappings('!')).toThrow(/not a base64-VLQ digit/u);
  });
});
