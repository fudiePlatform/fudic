import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/index.js';
import { FIXTURES, spansOf } from './helpers.js';

/** Every generated input of criterion 10. */
function* inputs(): Generator<string> {
  const noise = ['"', '\t', '\r', '\\', '#', 'role:', '/"x', ' '];
  for (const fixture of FIXTURES) {
    for (let i = 0; i <= fixture.length; i++) yield fixture.slice(0, i);
    const lines = fixture.split('\n');
    for (const [n, line] of lines.entries()) {
      const bare = line.trimStart();
      for (let spaces = 0; spaces <= 6; spaces++) {
        yield [...lines.slice(0, n), ' '.repeat(spaces) + bare, ...lines.slice(n + 1)].join('\n');
      }
      for (const extra of noise) {
        yield [...lines.slice(0, n), line + extra, ...lines.slice(n + 1)].join('\n');
        yield [...lines.slice(0, n), extra + line, ...lines.slice(n + 1)].join('\n');
      }
    }
  }
}

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
