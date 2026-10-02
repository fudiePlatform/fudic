import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { fixtureEntry, fixtureModule, readFixtures, type PropField } from '../../src/index.js';

const PATH = '/ws/app-card.fixture.ts';

/** The props of the `app-card` of the example: two required strings and an optional variant. */
const PROPS: readonly PropField[] = [
  { name: 'title', required: true, shape: { kind: 'string' } },
  { name: 'href', required: true, shape: { kind: 'string' } },
  {
    name: 'variant',
    required: false,
    shape: {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'default' },
        { kind: 'literal', value: 'outline' },
      ],
    },
  },
];

const errors = (source: string) => parseSync(PATH, source, { lang: 'ts', sourceType: 'module' }).errors;

describe('fixtureEntry', () => {
  it('writes the key and the required props that have a sample', () => {
    expect(fixtureEntry('base', PROPS)).toBe("base: { title: '', href: '' }");
  });

  it('quotes a key that is not an identifier, and writes `{}` without props', () => {
    expect(fixtureEntry('titulo-largo', [])).toBe("'titulo-largo': {}");
  });
});

describe('fixtureModule (criterion 3)', () => {
  const source = fixtureModule('app-card', ['a', 'b'], PROPS);

  it('writes the import type, one entry per key in order, and the satisfies', () => {
    expect(source).toBe(
      [
        "import type { $Props } from './app-card.fud';",
        '',
        'export default {',
        "  a: { title: '', href: '' },",
        "  b: { title: '', href: '' },",
        '} satisfies Record<string, $Props>;',
        '',
      ].join('\n'),
    );
  });

  it('is valid TypeScript', () => {
    expect(errors(source)).toEqual([]);
  });

  it('is read back by readFixtures: its keys and the `}` that closes the object', () => {
    const fixtures = readFixtures(source, PATH);
    expect(fixtures.names.map((n) => n.text)).toEqual(['a', 'b']);
    expect(fixtures.end).toBeDefined();
    expect(source.slice(fixtures.end)).toBe('} satisfies Record<string, $Props>;\n');
  });

  it('takes a new entry inserted before `end`', () => {
    const { end } = readFixtures(source, PATH);
    const grown = `${source.slice(0, end)}  ${fixtureEntry('c', PROPS)},\n${source.slice(end)}`;
    expect(errors(grown)).toEqual([]);
    expect(readFixtures(grown, PATH).names.map((n) => n.text)).toEqual(['a', 'b', 'c']);
  });

  it('with no keys is still valid and has an `end`', () => {
    const empty = fixtureModule('app-card', [], PROPS);
    expect(errors(empty)).toEqual([]);
    const fixtures = readFixtures(empty, PATH);
    expect(fixtures.names).toEqual([]);
    expect(empty[fixtures.end ?? -1]).toBe('}');
  });
});

describe('readFixtures — `end`', () => {
  it('points at the closing `}` through `as` and parentheses', () => {
    const source = 'export default ({ a: {} } as const);';
    expect(source.slice(readFixtures(source, PATH).end)).toBe('} as const);');
  });

  it('is absent without a default-exported object', () => {
    expect('end' in readFixtures('export const a = {};', PATH)).toBe(false);
    expect('end' in readFixtures('const x = {};\nexport default x;', PATH)).toBe(false);
    expect('end' in readFixtures('', PATH)).toBe(false);
  });
});
