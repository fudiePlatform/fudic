import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { fixtureEntry, fixtureModule, flowFixtureModule, pageFixtureModule, readFixtures, type PropField } from '../../src/index.js';

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

  // SDD-66 criterion 14: the form `g component` writes, `Fixtures<$Props>` and its import.
  it('writes the import types, one entry per key in order, and the satisfies of Fixtures', () => {
    expect(source).toBe(
      [
        "import type { Fixtures } from '@fudic/terms';",
        "import type { $Props } from './app-card.fud';",
        '',
        'export default {',
        "  a: { title: '', href: '' },",
        "  b: { title: '', href: '' },",
        '} satisfies Fixtures<$Props>;',
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
    expect(source.slice(fixtures.end)).toBe('} satisfies Fixtures<$Props>;\n');
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

describe('pageFixtureModule and flowFixtureModule (SDD-82 §3.10)', () => {
  const USERS: readonly PropField[] = [
    { name: 'title', required: true, shape: { kind: 'string' } },
    { name: 'users', required: true, shape: { kind: 'array', element: { kind: 'opaque' } } },
    { name: 'note', required: false, shape: { kind: 'string' } },
  ];

  it('a page: data sampled from load, paths when declared, calls empty, typed by the route', () => {
    const source = pageFixtureModule('routes/usuarios', { data: { name: 'base', fields: USERS }, paths: true });
    expect(source).toBe(
      [
        "import type { Fixtures } from 'fudic:routes/usuarios';",
        '',
        'export default {',
        '  data: {',
        "    base: { title: '', users: [] },",
        '  },',
        '  paths: [],',
        '  calls: {},',
        '} satisfies Fixtures;',
        '',
      ].join('\n'),
    );
    expect(errors(source)).toEqual([]);
    const read = readFixtures(source, PATH);
    expect(read.data?.names.map((n) => n.text)).toEqual(['base']);
    expect(read.paths?.names).toEqual([]);
    expect(read.calls?.names).toEqual([]);
  });

  it('a page without load nor paths: only calls', () => {
    expect(pageFixtureModule('routes/index', {})).toBe("import type { Fixtures } from 'fudic:routes/index';\n\nexport default {\n  calls: {},\n} satisfies Fixtures;\n");
  });

  it('a flow: services empty, typed by @fudic/spec', () => {
    const source = flowFixtureModule();
    expect(source).toBe("import type { FlowFixtures } from '@fudic/spec';\n\nexport default {\n  services: {},\n} satisfies FlowFixtures;\n");
    expect(readFixtures(source, PATH).services?.names).toEqual([]);
  });
});
