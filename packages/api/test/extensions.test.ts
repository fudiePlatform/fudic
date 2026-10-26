import { describe, expect, it } from 'vitest';
import { parseApi, type Decl } from '../src/index.js';
import { codes, slice } from './helpers.js';

type Of<K extends Decl['kind']> = Extract<Decl, { kind: K }>;

function first<K extends Decl['kind']>(source: string, kind: K): Of<K> {
  const decl = parseApi(source).value.declarations[0];
  expect(decl?.kind).toBe(kind);
  return decl as Of<K>;
}

const lines = (...l: string[]): string => l.join('\n');

describe('rules (SDD §3.7)', () => {
  it('reads where it applies, where it runs, `async`, parameters and failures', () => {
    const source = lines(
      'rule nif-unique',
      '  on field str map str i32',
      '  runs server',
      '  async',
      '  country  str',
      '  fails nif-taken country',
      '  fails nif-bad',
    );
    expect(codes(source)).toEqual([]);
    const rule = first(source, 'rule');
    expect(rule.on!.target.text).toBe('field');
    expect(rule.on!.types.map((t) => slice(source, t.span))).toEqual(['str', 'map str i32']);
    expect(rule.runs!.value.text).toBe('server');
    expect(slice(source, rule.async!)).toBe('async');
    expect(rule.params.map((p) => p.name.text)).toEqual(['country']);
    expect(rule.fails.map((f) => [f.code.text, f.params.map((p) => p.text)])).toEqual([
      ['nif-taken', ['country']],
      ['nif-bad', []],
    ]);
  });

  it('`on group` and `on form` take no types', () => {
    expect(first('rule r\n  on group', 'rule').on!.types).toEqual([]);
    expect(first('rule r\n  on form', 'rule').on!.target.text).toBe('form');
  });

  it('a bare rule has nothing set', () => {
    const rule = first('rule r', 'rule');
    for (const key of ['on', 'runs', 'async']) expect(rule).not.toHaveProperty(key);
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a rule with no name', 'rule', ['FUD1063']],
    ['a rule name in the wrong shape', 'rule nifUnique', ['FUD1070']],
    ['a word after the name', 'rule r x', ['FUD1064']],
    ['`on` alone', 'rule r\n  on', ['FUD1063']],
    ['`on` an unknown target', 'rule r\n  on everything', ['FUD1065']],
    ['`on field` with no types', 'rule r\n  on field', ['FUD1063']],
    ['`on field` with a broken type', 'rule r\n  on field str[ i32', ['FUD1067']],
    ['`on group` with types', 'rule r\n  on group str', ['FUD1064']],
    ['a second `on`', 'rule r\n  on form\n  on group', ['FUD1071']],
    ['a line under `on`', 'rule r\n  on form\n    x', ['FUD1065']],
    ['`runs` alone', 'rule r\n  runs', ['FUD1063']],
    ['`runs client`', 'rule r\n  runs client', ['FUD1065']],
    ['a word after `runs`', 'rule r\n  runs both x', ['FUD1064']],
    ['a second `runs`', 'rule r\n  runs both\n  runs server', ['FUD1071']],
    ['a second `async`', 'rule r\n  async\n  async', ['FUD1071']],
    ['a parameter called `async`', 'rule r\n  async  bool', ['FUD1076']],
    ['a line under `async`', 'rule r\n  async\n    x', ['FUD1065']],
    ['`fails` alone', 'rule r\n  fails', ['FUD1063']],
    ['a failure parameter in the wrong shape', 'rule r\n  fails x my-param', ['FUD1070']],
    ['a line under `fails`', 'rule r\n  fails x\n    y', ['FUD1065']],
    ['a lone word', 'rule r\n  frob', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }
});

describe('middlewares (SDD §3.8)', () => {
  it('reads its halves, parameters, `adds` and failures', () => {
    const source = lines(
      '# Who is calling.',
      'middleware auth',
      '  client',
      '  server',
      '  realm  str',
      '  adds',
      '    user   User',
      '    roles  str[]',
      '  fails unauthorized 401 "Sign in."',
    );
    expect(codes(source)).toEqual([]);
    const mw = first(source, 'middleware');
    expect([slice(source, mw.client!), slice(source, mw.server!)]).toEqual(['client', 'server']);
    expect(mw.params.map((p) => p.name.text)).toEqual(['realm']);
    expect(mw.adds!.fields.map((f) => f.name.text)).toEqual(['user', 'roles']);
    expect(slice(source, mw.adds!.span)).toBe('adds\n    user   User\n    roles  str[]');
    expect(mw.fails[0]!.status.value).toBe(401);
    expect(mw.doc).toBe('Who is calling.');
  });

  it('one half is enough', () => {
    expect(first('middleware m\n  server', 'middleware')).not.toHaveProperty('client');
    expect(first('middleware m\n  client', 'middleware')).not.toHaveProperty('server');
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a middleware with no name', 'middleware', ['FUD1063']],
    ['a middleware with no half', 'middleware m', ['FUD1073']],
    ['a word after the name', 'middleware m x\n  client', ['FUD1064']],
    ['a second `client`', 'middleware m\n  client\n  client', ['FUD1071']],
    ['a second `server`', 'middleware m\n  server\n  server', ['FUD1071']],
    ['a parameter called `client`', 'middleware m\n  server\n  client  str', ['FUD1076']],
    ['a parameter called `server`', 'middleware m\n  client\n  server  str', ['FUD1076']],
    ['a field called `adds`', 'middleware m\n  client\n  adds  str', ['FUD1076']],
    ['a second `adds`', 'middleware m\n  client\n  adds\n    a  str\n  adds\n    b  str', ['FUD1071']],
    ['a lone word under `adds`', 'middleware m\n  client\n  adds\n    a', ['FUD1065']],
    ['an empty `fails`', 'middleware m\n  client\n  fails', ['FUD1063']],
    ['a lone word', 'middleware m\n  client\n  frob', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }
});

describe('patterns (SDD §3.9)', () => {
  it('the regex is the rest of the line, `#` and inner blanks included, trailing blanks not', () => {
    const source = 'pattern hex  #[0-9a-f]{6} | x   ';
    expect(codes(source)).toEqual([]);
    const p = first(source, 'pattern');
    expect(p.source.text).toBe('#[0-9a-f]{6} | x');
    expect(slice(source, p.source.span)).toBe('#[0-9a-f]{6} | x');
    expect(slice(source, p.span)).toBe('pattern hex  #[0-9a-f]{6} | x');
  });

  it('a `#` after the name of a pattern is no comment; after the keyword, it is', () => {
    expect(first('pattern a  # x', 'pattern').source.text).toBe('# x');
    expect(codes('pattern # x')).toEqual(['FUD1063']);
  });

  it('an indented `pattern` is not a declaration: its rest is ordinary tokens', () => {
    expect(codes('form f\n  a  str\n    pattern web-url  "Bad."')).toEqual([]);
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a pattern with no name', 'pattern', ['FUD1063']],
    ['a pattern with no regex', 'pattern p', ['FUD1077']],
    ['a regex that does not compile', 'pattern p  (a', ['FUD1077']],
    ['a pattern name in the wrong shape', 'pattern Web  a', ['FUD1070']],
    ['a line under a pattern', 'pattern p  a\n  x', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }

  it('a regex that does not compile stays in the tree', () => {
    expect(first('pattern p  (a', 'pattern').source.text).toBe('(a');
  });
});
