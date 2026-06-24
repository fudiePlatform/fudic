import { describe, it, expect } from 'vitest';
import {
  span,
  emptySpan,
  spanLength,
  isEmptySpan,
  mergeSpans,
  spanContains,
} from '../../src/types/span.js';

describe('span', () => {
  it('builds a half-open range', () => {
    expect(span(3, 7)).toEqual({ start: 3, end: 7 });
  });

  it('accepts an empty span (start === end)', () => {
    expect(span(5, 5)).toEqual({ start: 5, end: 5 });
    expect(emptySpan(5)).toEqual(span(5, 5));
  });

  it('normalizes start > end by swapping, never throws', () => {
    expect(span(7, 3)).toEqual({ start: 3, end: 7 });
  });
});

describe('spanLength', () => {
  it('returns end - start', () => {
    expect(spanLength(span(2, 5))).toBe(3);
  });

  it('is 0 for an empty span', () => {
    expect(spanLength(span(5, 5))).toBe(0);
  });
});

describe('isEmptySpan', () => {
  it('is true only when start === end', () => {
    expect(isEmptySpan(span(5, 5))).toBe(true);
    expect(isEmptySpan(span(2, 5))).toBe(false);
  });
});

describe('mergeSpans', () => {
  it('produces the bounding span of two disjoint spans', () => {
    expect(mergeSpans(span(2, 5), span(8, 10))).toEqual({ start: 2, end: 10 });
  });

  it('is order-independent', () => {
    expect(mergeSpans(span(8, 10), span(2, 5))).toEqual({ start: 2, end: 10 });
  });

  it('swallows the gap (bounding, not interval union)', () => {
    const merged = mergeSpans(span(2, 5), span(8, 10));
    expect(spanContains(merged, 6)).toBe(true);
  });
});

describe('spanContains', () => {
  it('includes start, excludes end (half-open)', () => {
    expect(spanContains(span(2, 5), 2)).toBe(true);
    expect(spanContains(span(2, 5), 5)).toBe(false);
    expect(spanContains(span(2, 5), 4)).toBe(true);
  });

  it('an empty span contains no offset', () => {
    expect(spanContains(span(5, 5), 5)).toBe(false);
  });
});
