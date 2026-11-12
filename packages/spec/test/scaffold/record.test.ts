/**
 * SDD-82 §3.9: what `record` writes — the real answers as literals a fixture holds, entries by
 * name in a page's or a flow's fixture, and the criterion's `data` and `answers` lines.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyFixture,
  fixtureKindOf,
  isLiteral,
  literalOf,
  readFixtures,
  recordFixture,
  recordLines,
  type Literal,
} from '../../src/index.js';

const source = (value: unknown, indent = ''): string => (literalOf(value, 'x', indent) as Literal).source;

describe('literalOf', () => {
  it('writes plain data as it is', () => {
    expect(source(undefined)).toBe('undefined');
    expect(source(null)).toBe('null');
    expect(source(true)).toBe('true');
    expect(source(-0)).toBe('-0');
    expect(source(3.5)).toBe('3.5');
    expect(source(10n)).toBe('10n');
    expect(source("Ana's")).toBe("'Ana\\'s'");
    expect(source([])).toBe('[]');
    expect(source({})).toBe('{}');
    expect(source({ id: 1, 'e-mail': 'a', tags: ['x'] })).toBe("{ id: 1, 'e-mail': 'a', tags: ['x'] }");
    expect(source(Object.assign(Object.create(null) as object, { a: 1 }))).toBe('{ a: 1 }');
  });

  it('breaks what does not fit one line, one entry per line', () => {
    const long = { users: [{ name: 'a'.repeat(60) }, { name: 'b'.repeat(60) }] };
    expect(source(long, '    ')).toBe(
      `{\n      users: [\n        { name: '${'a'.repeat(60)}' },\n        { name: '${'b'.repeat(60)}' },\n      ],\n    }`,
    );
  });

  it('writes the markers as the helper calls that make them, and says which', () => {
    const written = literalOf(
      [
        { $fails: { status: 503, title: 'caído' } },
        { $fails: { code: 'ana' } },
        { $redirects: '/entrar', status: 303 },
        { $redirects: '/x' },
        { $redirects: '/y', status: 302 },
        { $file: './fixtures/a/p.csv', type: 'text/csv', name: 'p.csv' },
        { $file: './f.bin' },
        { $later: 'never' },
        { $later: 0, fails: { status: 500, title: 'Internal Server Error' } },
        { $later: 20, value: { n: 1 } },
      ],
      'x',
    ) as Literal;
    expect(written.source).toBe(
      "[\n  fails(503, 'caído'),\n  fails('ana'),\n  redirects('/entrar'),\n  redirects('/x'),\n  redirects('/y', 302),\n" +
        "  file('./fixtures/a/p.csv', { type: 'text/csv', name: 'p.csv' }),\n  file('./f.bin'),\n  later.never(),\n" +
        "  later.fails(0, 500, 'Internal Server Error'),\n  later(20, { n: 1 }),\n]",
    );
    expect([...written.helpers].sort()).toEqual(['fails', 'file', 'later', 'redirects']);
  });

  it('says where and what a value with no literal is', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(literalOf({ users: [{ at: new Date(0) }] }, 'data.ana')).toEqual({ at: 'data.ana.users.0.at', found: 'a Date' });
    expect(literalOf({ f: () => 1 }, 'c')).toEqual({ at: 'c.f', found: 'a function' });
    expect(literalOf(Symbol('s'), 'c')).toEqual({ at: 'c', found: 'a symbol' });
    expect(literalOf(new Map(), 'c')).toEqual({ at: 'c', found: 'a Map' });
    expect(literalOf(new (class {})(), 'c')).toEqual({ at: 'c', found: 'a class instance' });
    const orphan = Object.create(Object.create(null) as object) as object;
    expect(literalOf(orphan, 'c')).toEqual({ at: 'c', found: 'a class instance' });
    expect(literalOf(cycle, 'c')).toEqual({ at: 'c.self', found: 'a cycle' });
    // The same object twice is no cycle.
    const shared = { a: 1 };
    expect(source([shared, shared])).toBe('[{ a: 1 }, { a: 1 }]');
    expect(isLiteral(literalOf(1, 'c'))).toBe(true);
    expect(isLiteral(literalOf(() => 1, 'c'))).toBe(false);
  });
});

describe('recordFixture', () => {
  const PATH = '/p/src/routes/usuarios.fixture.ts';
  const page = emptyFixture(fixtureKindOf('page', 'routes/usuarios'));

  it('a new fixture of a page or a flow, typed by its kind', () => {
    expect(page).toBe("import type { Fixtures } from 'fudic:routes/usuarios';\n\nexport default {} satisfies Fixtures;\n");
    expect(emptyFixture(fixtureKindOf('flow'))).toBe("import type { FlowFixtures } from '@fudic/spec';\n\nexport default {} satisfies FlowFixtures;\n");
  });

  it('adds the groups and the entries, and the helpers they call', () => {
    const out = recordFixture(
      page,
      PATH,
      [
        { group: 'data', name: 'entrar', value: '{ users: [] }' },
        { group: 'data', name: 'entrar-2', value: "fails(503, 'x')" },
        { group: 'calls', name: 'entrar', value: '{ login: undefined }' },
      ],
      ['fails'],
    );
    expect(out).toEqual({
      source:
        "import type { Fixtures } from 'fudic:routes/usuarios';\nimport { fails } from '@fudic/spec';\n\n" +
        "export default {\n  data: {\n    entrar: { users: [] },\n    'entrar-2': fails(503, 'x'),\n  },\n" +
        '  calls: {\n    entrar: { login: undefined },\n  },\n} satisfies Fixtures;\n',
    });
    const read = readFixtures((out as { source: string }).source, PATH);
    expect(read.data?.names.map((n) => n.text)).toEqual(['entrar', 'entrar-2']);
    expect(read.calls?.names.map((n) => n.text)).toEqual(['entrar']);
  });

  it('replaces what has the name, adds the comma a last entry lacks, keeps the rest as written', () => {
    const written =
      "import type { Fixtures } from 'fudic:routes/usuarios';\nimport { later } from '@fudic/spec';\n\n" +
      "export default {\n  data: {\n    'entrar': { users: ['old'] },\n    nadie: { users: [] }\n  },\n  calls: {},\n} satisfies Fixtures;\n";
    const out = recordFixture(
      written,
      PATH,
      [
        { group: 'data', name: 'entrar', value: '{ users: [] }' },
        { group: 'data', name: 'otro', value: '1' },
        { group: 'calls', name: 'entrar', value: '{}' },
      ],
      ['fails', 'later', 'file'],
    );
    expect((out as { source: string }).source).toBe(
      "import type { Fixtures } from 'fudic:routes/usuarios';\nimport { later, fails, file } from '@fudic/spec';\n\n" +
        "export default {\n  data: {\n    entrar: { users: [] },\n    nadie: { users: [] },\n    otro: 1,\n  },\n  calls: {\n    entrar: {},\n  },\n} satisfies Fixtures;\n",
    );
  });

  it('imports nothing it already imports; a file without imports gets one first', () => {
    const imported = "import { fails } from '@fudic/spec';\nexport default { calls: { a: 1, } };";
    expect(recordFixture(imported, PATH, [], ['fails'])).toEqual({ source: imported });
    expect(recordFixture(imported, PATH, [{ group: 'calls', name: 'b', value: '2' }], [])).toEqual({
      source: "import { fails } from '@fudic/spec';\nexport default { calls: { a: 1,\n  b: 2, } };",
    });
    expect(recordFixture('export default {};', PATH, [], ['fails'])).toEqual({ source: "import { fails } from '@fudic/spec';\nexport default {};" });
    // A type import, or a namespace one, is not where a helper goes.
    const typed = "import type { Failed } from '@fudic/spec';\nimport * as spec from '@fudic/spec';\nexport default {};";
    expect(recordFixture(typed, PATH, [], ['fails'])).toEqual({
      source: "import type { Failed } from '@fudic/spec';\nimport * as spec from '@fudic/spec';\nimport { fails } from '@fudic/spec';\nexport default {};",
    });
    // The last import is on the last line, with no newline after it.
    expect(recordFixture("import x from 'y';", PATH, [], ['file'])).toEqual({ source: "import x from 'y';import { file } from '@fudic/spec';\n" });
  });

  it('FUD1510 when the export default or the group is not an object literal', () => {
    const noDefault = recordFixture('export const x = 1;', PATH, [{ group: 'data', name: 'a', value: '1' }], []);
    expect(noDefault).toMatchObject({ problem: { code: 'FUD1510', span: { start: 0, end: 0 } } });
    const notObject = recordFixture('export default make();', PATH, [{ group: 'data', name: 'a', value: '1' }], []);
    expect(notObject).toMatchObject({ problem: { code: 'FUD1510', span: { start: 0, end: 22 } } });
    const group = recordFixture('export default { calls: other };', PATH, [{ group: 'calls', name: 'a', value: '1' }], []);
    expect(group).toMatchObject({ problem: { code: 'FUD1510', span: { start: 24, end: 29 } } });
  });
});

describe('recordLines', () => {
  const SPEC = [
    'page /usuarios',
    '',
    'criterion entrar',
    '  given',
    '    data dos-personas',
    '    answers entra-ana',
    '  when',
    '    click role:button/"Entrar"',
    '  then',
    '    text body "Sesión: ana"',
    '',
  ].join('\n');

  it('names what was recorded in the lines that are there', () => {
    expect(recordLines(SPEC, 'entrar', { data: ['entrar', 'entrar-2'], answers: 'entrar' })).toBe(
      SPEC.replace('data dos-personas', 'data entrar entrar-2').replace('answers entra-ana', 'answers entrar'),
    );
  });

  it('a line that names nothing recorded goes, the last one too', () => {
    expect(recordLines(SPEC, 'entrar', { data: [] })).toBe(SPEC.replace('    data dos-personas\n', '').replace('    answers entra-ana\n', ''));
    const last = 'page /x\n\ncriterion a\n  given\n    url /x\n    data d';
    expect(recordLines(last, 'a', {})).toBe('page /x\n\ncriterion a\n  given\n    url /x\n');
  });

  it('adds the lines that are not there: data first, answers after it', () => {
    const bare = 'page /x\n\ncriterion a\n  given\n    url /x\n  then\n    title "x"\n';
    expect(recordLines(bare, 'a', { data: ['a'], answers: 'a' })).toBe('page /x\n\ncriterion a\n  given\n    data a\n    answers a\n    url /x\n  then\n    title "x"\n');
    const withData = 'page /x\n\ncriterion a\n  given\n    url /x\n    data b\n  then\n    title "x"\n';
    expect(recordLines(withData, 'a', { data: ['a'], answers: 'a' })).toBe('page /x\n\ncriterion a\n  given\n    url /x\n    data a\n    answers a\n  then\n    title "x"\n');
    const empty = 'flow f\n\ncriterion a\n  given\n  then\n    title "x"\n';
    expect(recordLines(empty, 'a', { answers: 'a' })).toBe('flow f\n\ncriterion a\n  given\n    answers a\n  then\n    title "x"\n');
  });

  it('opens a given when there is none', () => {
    const noGiven = 'page /x\n\ncriterion a\n   then\n     title "x"\n';
    expect(recordLines(noGiven, 'a', { answers: 'a' })).toBe('page /x\n\ncriterion a\n   given\n     answers a\n   then\n     title "x"\n');
    expect(recordLines('page /x\n\ncriterion a', 'a', { data: ['a'], answers: 'a' })).toBe('page /x\n\ncriterion a\n  given\n    data a\n    answers a');
  });

  it('leaves the text alone without the criterion, or with nothing to write', () => {
    expect(recordLines(SPEC, 'otro', { data: ['x'] })).toBe(SPEC);
    const bare = 'page /x\n\ncriterion a\n  then\n    title "x"\n';
    expect(recordLines(bare, 'a', {})).toBe(bare);
  });
});
