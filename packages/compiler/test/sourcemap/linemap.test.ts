/**
 * SDD-13 acceptance criteria (§6) for `LineMap` and `rangeOf`: the offset↔position
 * edge. Pure, lossless within range, clamps out of range, never throws.
 */

import { describe, it, expect } from 'vitest';
import { LineMap, rangeOf } from '../../src/sourcemap/index.js';
import { span } from '../../src/types/index.js';

describe('LineMap — basics (crit. #2)', () => {
  const lm = new LineMap('ab\ncd');

  it('maps offsets to (line, character)', () => {
    expect(lm.positionAt(0)).toEqual({ line: 0, character: 0 });
    expect(lm.positionAt(1)).toEqual({ line: 0, character: 1 });
    expect(lm.positionAt(3)).toEqual({ line: 1, character: 0 });
    expect(lm.positionAt(4)).toEqual({ line: 1, character: 1 });
  });

  it('inverts with offsetAt (roundtrip identity)', () => {
    expect(lm.offsetAt({ line: 1, character: 1 })).toBe(4);
    for (let o = 0; o <= 5; o += 1) {
      expect(lm.offsetAt(lm.positionAt(o))).toBe(o);
    }
  });

  it('counts lines (≥ 1)', () => {
    expect(lm.lineCount).toBe(2);
    expect(new LineMap('').lineCount).toBe(1);
    expect(new LineMap('one line').lineCount).toBe(1);
  });
});

describe('LineMap — line terminators (crit. #3)', () => {
  it('treats \\r\\n as one break', () => {
    const lm = new LineMap('a\r\nb');
    expect(lm.positionAt(3)).toEqual({ line: 1, character: 0 });
    expect(lm.lineCount).toBe(2);
  });

  it('treats a lone \\r as a break', () => {
    const lm = new LineMap('a\rb');
    expect(lm.positionAt(2)).toEqual({ line: 1, character: 0 });
    expect(lm.lineCount).toBe(2);
  });

  it('does not create an empty line between \\r and \\n', () => {
    // "a\r\nb\nc": lines are "a", "b", "c" — three, not four.
    expect(new LineMap('a\r\nb\nc').lineCount).toBe(3);
  });
});

describe('LineMap — clamp, never throws (crit. #4)', () => {
  const lm = new LineMap('ab\ncd'); // length 5

  it('clamps positionAt beyond the end to the final position', () => {
    expect(lm.positionAt(9999)).toEqual({ line: 1, character: 2 });
  });

  it('clamps positionAt before the start to (0,0)', () => {
    expect(lm.positionAt(-5)).toEqual({ line: 0, character: 0 });
  });

  it('clamps offsetAt for an out-of-range line to source.length', () => {
    expect(lm.offsetAt({ line: 99, character: 0 })).toBe(5);
  });

  it('clamps offsetAt for a negative line to 0', () => {
    expect(lm.offsetAt({ line: -1, character: 3 })).toBe(0);
  });

  it('clamps an over-long character to the source length', () => {
    expect(lm.offsetAt({ line: 1, character: 9999 })).toBe(5);
  });

  it('clamps a negative character to the line start', () => {
    expect(lm.offsetAt({ line: 1, character: -3 })).toBe(3);
  });
});

describe('rangeOf (crit. #5)', () => {
  const lm = new LineMap('ab\ncd');

  it('converts a span to an LSP range', () => {
    expect(rangeOf(lm, span(0, 2))).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 2 },
    });
  });

  it('crosses a line break', () => {
    expect(rangeOf(lm, span(1, 4))).toEqual({
      start: { line: 0, character: 1 },
      end: { line: 1, character: 1 },
    });
  });

  it('an empty span yields an empty range (cursor)', () => {
    const r = rangeOf(lm, span(4, 4));
    expect(r.start).toEqual(r.end);
    expect(r.start).toEqual({ line: 1, character: 1 });
  });
});
