import { describe, expect, it } from 'vitest';
import { readFixtures } from '../src/index.js';

const PATH = '/ws/fud-card.fixture.ts';

/** Each key with the text its span covers. */
function keys(source: string): readonly (readonly [string, string])[] {
  const fixtures = readFixtures(source, PATH);
  expect(fixtures.path).toBe(PATH);
  return fixtures.names.map((n) => [n.text, source.slice(n.span.start, n.span.end)] as const);
}

describe('readFixtures (criterion 19)', () => {
  it('reads the keys of an `export default … satisfies`, quoted and not, with their spans', () => {
    const source = [
      "import type { $Props } from './fud-card.fud';",
      '',
      'export default {',
      "  'titulo-largo': { title: 'Un título', items: [] },",
      "  vacio: { title: '', items: [] },",
      '  "doble": {},',
      '} satisfies Record<string, $Props>;',
    ].join('\n');
    expect(keys(source)).toEqual([
      ['titulo-largo', "'titulo-largo'"],
      ['vacio', 'vacio'],
      ['doble', '"doble"'],
    ]);
  });

  it('reads them without satisfies, and through `as` and parentheses', () => {
    expect(keys('export default { a: {} };')).toEqual([['a', 'a']]);
    expect(keys('export default ({ a: {} } as const);')).toEqual([['a', 'a']]);
  });

  it('skips spreads, computed and numeric keys', () => {
    expect(keys('export default { ...base, [k]: {}, 1: {}, b: {} };')).toEqual([['b', 'b']]);
  });

  it('has no names without an object default export', () => {
    expect(keys('export const a = {};')).toEqual([]);
    expect(keys('const x = {};\nexport default x;')).toEqual([]);
    expect(keys('')).toEqual([]);
  });

  it('keeps what can still be read from a file with a syntax error', () => {
    // Oxc recovers from a missing initializer and keeps the tree...
    expect(keys('export default { a: {}, b: {} };\nconst x;').map(([text]) => text)).toEqual(['a', 'b']);
    // ...and from a fatal error it keeps nothing: no names, and still no throw.
    expect(keys('export default { a: {}, b: {} };\nconst = ;')).toEqual([]);
  });
});
