import { describe, expect, it } from 'vitest';
import { createApiIndex, parseApi, validateApi, type ApiSource } from '../src/index.js';
import { slice } from './helpers.js';
import { app, check, codesOf } from './project.js';

const lines = (...l: string[]): string => l.join('\n');

/** A form with these fields and these `summary` lines. */
const form = (fields: readonly string[], summary: readonly string[] = []): string =>
  lines('form f', ...fields.map((f) => `  ${f}`), ...(summary.length > 0 ? ['  summary', ...summary.map((s) => `    ${s}`)] : []));

/** The diagnostics of a form, as code and covered text. */
function found(text: string, others: Parameters<typeof check>[1] = {}): readonly (readonly [string, string, string])[] {
  return check(text, others).diagnostics.map((d) => [d.code, slice(text, d.span), d.message] as const);
}

const FIELDS = [
  'name  str',
  'age  u8',
  'born  date',
  'id  uuid',
  'active  bool',
  'tags  str[]',
  'scores  i32[]',
  'acceso  group',
  '  clave  str',
  '  repetir  str',
];

describe('initial values (FUD1094)', () => {
  it('a value of the field type passes', () => {
    expect(codesOf(form(['a  str = "x"', 'b  u8 = 255', 'c  f32 = -1.5', 'd  bool = false', 'e  str[] = []', 'f  uuid = ""', 'g  date = ""']))).toEqual([]);
  });

  const bad: readonly (readonly [string, string, string])[] = [
    ['a  u8 = 256', '256', '`256`'],
    ['a  i8 = 1.5', '1.5', '`1.5`'],
    ['a  str = 3', '3', '`3`'],
    ['a  bool = "yes"', '"yes"', '`"yes"`'],
    ['a  str[] = "x"', '"x"', 'str[]'],
    ['a  str = []', '[]', '`[]`'],
    ['a  u8 = true', 'true', '`true`'],
    ['a  map str str = ""', '""', 'map str str'],
    ['a  str? = 1', '1', 'str?'],
  ];
  for (const [field, covered, says] of bad) {
    it(`${field} is FUD1094 on the value`, () => {
      const [only, ...rest] = found(form([field]));
      expect(rest).toEqual([]);
      expect(only!.slice(0, 2)).toEqual(['FUD1094', covered]);
      expect(only![2]).toContain(says);
    });
  }
});

describe('rules under a field', () => {
  it('an unknown rule is reported once, nothing else about it', () => {
    expect(found(form(['a  str'], []).replace('a  str', 'a  str\n    requird  "{x}"'))).toEqual([
      ['FUD1080', 'requird', expect.stringContaining('`required`') as unknown as string],
    ]);
  });

  it('a rule taking a `pattern` takes a pattern of the project', () => {
    expect(codesOf(form(['a  str', '  pattern email']))).toEqual([]);
    expect(codesOf(form(['a  str', '  pattern nope']))).toEqual(['FUD1084']);
    expect(codesOf(form(['a  str', '  pattern "x"']))).toEqual(['FUD1084']);
  });

  it('a rule on `*` applies to any field', () => {
    const any = app('r', 'rule odd\n  on field *\n  runs both\n  fails odd');
    const people = app('p', 'type Person\n  name  str');
    const text = form(['a  Person', '  odd', 'b  u8[]', '  odd', 'c  bool?', '  odd']);
    expect(codesOf(text, { others: [any, people] })).toEqual([]);
  });

  it('a field of an unknown type is reported once', () => {
    expect(codesOf(form(['a  Ghost']))).toEqual(['FUD1080']);
  });

  it('text placeholders: the parameters its `fails` names', () => {
    const rule = app('r', 'rule between\n  on field u8\n  runs both\n  lo  u8\n  hi  u8\n  fails between lo hi');
    expect(codesOf(form(['a  u8', '  between 1 9  "From {lo} to {hi}."']), { others: [rule] })).toEqual([]);
    expect(codesOf(form(['a  u8', '  between 1 9  "{lo}{n}"']), { others: [rule] })).toEqual(['FUD1085']);
    expect(codesOf(form(['a  u8', '  between 1 300']), { others: [rule] })).toEqual(['FUD1084']);
  });

  it('arguments against optional, list and map parameters', () => {
    const rule = app('r', 'rule odd\n  on field str\n  runs both\n  maybe  u8?\n  some  str[]\n  pairs  map str str\n  fails odd');
    const use = (args: string): readonly string[] => codesOf(form(['a  str', `  odd ${args}`]), { others: [rule] });
    expect(use('1 [] x')).toEqual(['FUD1084']);
    expect(use('1 "x" x')).toEqual(['FUD1084']);
    expect(use('300 [] x')).toEqual(['FUD1084']);
    const fine = app('s', 'rule fine\n  on field str\n  runs both\n  maybe  u8?\n  some  str[]\n  fails fine');
    expect(codesOf(form(['a  str', '  fine 1 []', '  fine 2 x']), { others: [fine] })).toEqual([]);
  });

  it('a text with no placeholder, and `{}` that names nothing', () => {
    expect(codesOf(form(['a  str', '  required  "Plain."']))).toEqual([]);
    expect(codesOf(form(['a  str', '  required  "{}"']))).toEqual(['FUD1085']);
  });
});

describe('`require` and `when` (FUD1095)', () => {
  const ok: readonly string[] = [
    'require a  name == "x"',
    'require a  name != "x" and age > 3',
    'require a  age >= 18 or active',
    'require a  not active',
    'require a  born < born',
    'require a  id == "x"',
    'require a  length name > 2',
    'require a  length tags <= 3',
    'require a  tags contains name',
    'require a  scores contains 3',
    'require a  name contains "x"',
    'require a  valid acceso',
    'require a  empty acceso.clave',
    'require a  (active)',
    'require a  acceso.clave == acceso.repetir  on acceso.clave',
    'require a  active == true',
    'when active\n      require b  not empty name',
  ];
  for (const line of ok) {
    it(`accepts ${line.split('\n')[0]}`, () => {
      expect(codesOf(form(FIELDS, [line]))).toEqual([]);
    });
  }

  const bad: readonly (readonly [string, string, string])[] = [
    ['require a  ghost == "x"', 'ghost', '`ghost`'],
    ['require a  acceso.ghost', 'acceso.ghost', '`acceso.ghost`'],
    ['require a  name.x', 'name.x', '`name.x`'],
    ['require a  active on ghost', 'ghost', '`ghost`'],
    ['require a  name == 3', 'name == 3', '`==`'],
    ['require a  acceso == acceso', 'acceso == acceso', '`==`'],
    ['require a  name < "b"', 'name < "b"', '`<`'],
    ['require a  active > false', 'active > false', '`>`'],
    ['require a  tags contains 3', 'tags contains 3', '`contains`'],
    ['require a  age contains 3', 'age contains 3', '`contains`'],
    ['require a  length active > 1', 'length active', '`length`'],
    ['require a  name and active', 'name', '`and`'],
    ['require a  active or age', 'age', '`or`'],
    ['require a  not name', 'name', '`not`'],
    ['require a  name', 'name', '`require`'],
    ['require a  length tags', 'length tags', '`require`'],
    ['when name\n      require b  active', 'name', '`when`'],
    ['when active\n      require b  age', 'age', '`require`'],
  ];
  for (const [line, covered, says] of bad) {
    it(`reports ${line.split('\n')[0]} once`, () => {
      const [only, ...rest] = found(form(FIELDS, [line]));
      expect(rest).toEqual([]);
      expect(only!.slice(0, 2)).toEqual(['FUD1095', covered]);
      expect(only![2]).toContain(says);
    });
  }

  it('a part already reported is not reported again by what holds it', () => {
    expect(codesOf(form(FIELDS, ['require a  not ghost']))).toEqual(['FUD1095']);
    expect(codesOf(form(FIELDS, ['require a  ghost and other']))).toEqual(['FUD1095', 'FUD1095']);
    expect(codesOf(form(FIELDS, ['require a  length ghost > 1']))).toEqual(['FUD1095']);
    expect(codesOf(form(FIELDS, ['require a  1 == ghost']))).toEqual(['FUD1095']);
    expect(codesOf(form(FIELDS, ['require a  (name == 1) or active']))).toEqual(['FUD1095']);
  });

  it('a map field compares with itself and nothing else', () => {
    expect(codesOf(form(['m  map str str', 'n  map str i32'], ['require a  m == m']))).toEqual([]);
    expect(codesOf(form(['m  map str str', 'n  map str i32'], ['require a  m == n']))).toEqual(['FUD1095']);
  });

  it('a `require` or `when` whose expression the parser refused is skipped, not looked into', () => {
    const text = form(FIELDS, ['require a  name ==', 'when\n      require b  ghost']);
    const source: ApiSource = { id: 'x', path: '/x.fudapi', file: parseApi(text).value, origin: 'app' };
    const diagnostics = validateApi(source, createApiIndex([source]), {});
    expect(diagnostics.map((d) => [d.code, slice(text, d.span)])).toEqual([['FUD1095', 'ghost']]);
  });

  it('paths resolve in the scope of the summary: the group, inside a group', () => {
    const text = lines('form f', '  name  str', '  g  group', '    a  str', '    summary', '      require x  a != name');
    expect(found(text).map(([code, covered]) => [code, covered])).toEqual([['FUD1095', 'name']]);
    expect(codesOf(lines('form f', '  g  group', '    a  str', '    b  str', '    summary', '      require x  a == b'))).toEqual([]);
  });

  it('a rule in a summary is checked like any use', () => {
    const group = app('g', 'rule all-or-none\n  on group\n  runs both\n  fails all-or-none');
    expect(codesOf(form(['g  group', '  a  str', '  summary', '    all-or-none 1']), { others: [group] })).toEqual(['FUD1084']);
    expect(codesOf(form(['a  str'], ['requird']))).toEqual(['FUD1080']);
  });
});
