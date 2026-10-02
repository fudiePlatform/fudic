import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/index.js';
import { inputs, spansOf } from './helpers.js';

describe('parseSpec never throws (criterion 10)', () => {
  it('returns a tree with spans inside the source for every generated input', () => {
    let count = 0;
    for (const source of inputs()) {
      const { value, diagnostics } = parseSpec(source);
      for (const s of [...spansOf(value), ...diagnostics.flatMap((d) => [d.span, ...(d.related ?? []).map((r) => r.span)])]) {
        if (!(s.start >= 0 && s.start <= s.end && s.end <= source.length)) {
          throw new Error(`span ${JSON.stringify(s)} out of ${JSON.stringify(source)}`);
        }
      }
      count++;
    }
    expect(count).toBeGreaterThan(500);
  });
});
