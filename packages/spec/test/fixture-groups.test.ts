/**
 * A page's or a flow's fixture, read without running it (SDD-82 §3.4, §4.1) — criterion 9.
 */

import { describe, expect, it } from 'vitest';
import { readFixtures, type FixtureGroup } from '../src/index.js';

const PATH = '/ws/src/routes/usuarios.fixture.ts';

const names = (group: FixtureGroup | undefined): readonly string[] | undefined => group?.names.map((n) => n.text);

describe('readFixtures — the groups of a page (criterion 9)', () => {
  const source = [
    "import type { Fixtures } from 'fudic:routes/usuarios';",
    "import { fails, later, redirects, file } from '@fudic/spec';",
    '',
    'export default {',
    '  data: {',
    "    'dos-personas': { users: [ana, luis] },",
    '    nadie: { users: [] },',
    "    caido: fails(503, 'la base de datos no responde'),",
    '  },',
    "  paths: ['hola-fudic', 'dsd-in-depth'],",
    '  calls: {',
    "    'busca-luis': { search: [luis] },",
    '    buscando: { search: later.never() },',
    '  },',
    '  services: {},',
    '} satisfies Fixtures;',
  ].join('\n');
  const fixtures = readFixtures(source, PATH);

  it('gives the names of data, calls and services, and the values of paths', () => {
    expect(names(fixtures.data)).toEqual(['dos-personas', 'nadie', 'caido']);
    expect(names(fixtures.calls)).toEqual(['busca-luis', 'buscando']);
    expect(names(fixtures.services)).toEqual([]);
    expect(names(fixtures.paths)).toEqual(['hola-fudic', 'dsd-in-depth']);
  });

  it('places each name in the fixture file, and each group ends at its closing bracket', () => {
    const at = (group: FixtureGroup | undefined, i: number): string => source.slice(group!.names[i]!.span.start, group!.names[i]!.span.end);
    expect(at(fixtures.data, 0)).toBe("'dos-personas'");
    expect(at(fixtures.paths, 1)).toBe("'dsd-in-depth'");
    expect(source[fixtures.data!.end!]).toBe('}');
    expect(source[fixtures.paths!.end!]).toBe(']');
  });

  it('a readable group has no problem', () => {
    for (const group of [fixtures.data, fixtures.calls, fixtures.services, fixtures.paths]) expect(group?.problem).toBeUndefined();
  });

  it('a group that is not there is absent', () => {
    const flow = readFixtures('export default { services: { a: [] } };', PATH);
    expect([flow.data, flow.calls, flow.paths]).toEqual([undefined, undefined, undefined]);
    expect(names(flow.services)).toEqual(['a']);
  });

  it('reads paths through `as const`', () => {
    expect(names(readFixtures("export default { paths: ['a'] as const };", PATH).paths)).toEqual(['a']);
  });
});

describe('readFixtures — FUD1510', () => {
  const problem = (source: string, key: 'data' | 'calls' | 'services' | 'paths') => {
    const group = readFixtures(source, PATH)[key]!;
    const d = group.problem!;
    return { group, d, text: source.slice(d.span.start, d.span.end) };
  };

  it('a group that is not an object literal: no names, the problem on its value', () => {
    const { group, d, text } = problem('export default { data: build() };', 'data');
    expect(group.names).toEqual([]);
    expect(group.end).toBeUndefined();
    expect([d.code, d.file, text]).toEqual(['FUD1510', PATH, 'build()']);
    expect(d.message).toBe("the fixture's `data` cannot be read without running it: write it as an object literal");
  });

  it('a spread or a computed key: the names it has, and the problem', () => {
    const { group, d } = problem('export default { calls: { ...base, [k]: {}, a: {} } };', 'calls');
    expect(names(group)).toEqual(['a']);
    expect(d.message).toContain('an object literal with plain keys');
  });

  it('paths that is not an array, or holds something other than strings', () => {
    expect(problem('export default { paths: list };', 'paths').group.names).toEqual([]);
    const mixed = problem("export default { paths: ['a', b, ...c, , `d`] };", 'paths');
    expect(names(mixed.group)).toEqual(['a']);
    expect(mixed.group.end).toBeDefined();
    expect(mixed.d.message).toContain('an array of strings');
  });
});
