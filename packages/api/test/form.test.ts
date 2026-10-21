import { describe, expect, it } from 'vitest';
import { parseApi, type Decl, type FieldDecl, type FormDecl, type FormGroup, type RequireRule } from '../src/index.js';
import { codes, slice } from './helpers.js';

const lines = (...l: string[]): string => l.join('\n');

function form(source: string): FormDecl {
  const decl = parseApi(source).value.declarations[0] as Decl;
  expect(decl.kind).toBe('form');
  return decl as FormDecl;
}

const field = (f: FormDecl | FormGroup, i = 0): FieldDecl => f.fields[i] as FieldDecl;

/** The `require` lines of a form's `summary`. */
const requires = (source: string): readonly RequireRule[] => form(source).summary!.items as readonly RequireRule[];

describe('forms (SDD §3.6)', () => {
  it('reads the options of a form, a group and a field', () => {
    const source = lines(
      'form f',
      '  validate-on submit',
      '  validity rules',
      '  catches 409 422',
      '  a  str',
      '    validate-on input',
      '    validity interacted',
      '  g  group',
      '    validate-on blur',
      '    validity rules',
      '    b  str',
    );
    expect(codes(source)).toEqual([]);
    const f = form(source);
    expect(f.validateOn!.events.map((e) => e.text)).toEqual(['submit']);
    expect(f.validity!.value.text).toBe('rules');
    expect(f.catches!.statuses.map((s) => s.value)).toEqual([409, 422]);
    expect(field(f).validateOn!.events.map((e) => e.text)).toEqual(['input']);
    expect(field(f).validity!.value.text).toBe('interacted');
    const g = f.fields[1] as FormGroup;
    expect([g.kind, g.validateOn!.events[0]!.text, g.validity!.value.text]).toEqual(['form-group', 'blur', 'rules']);
  });

  it('reads initial values of every kind', () => {
    const f = form(lines('form f', '  a  str = "x"', '  b  i32 = -3', '  c  bool = true', '  d  str[] = []', '  e  str'));
    expect(f.fields.map((m) => (m as FieldDecl).initial?.kind)).toEqual(['string', 'number', 'bool', 'empty-list', undefined]);
  });

  it('reads `range`, rules with arguments and rules without text', () => {
    const source = lines('form f', '  age  u8', '    range "Entre {min} y {max}."', '    min 18 "Mayor de edad."', '    required');
    expect(codes(source)).toEqual([]);
    const age = field(form(source));
    expect(age.range!.text).toBe('Entre {min} y {max}.');
    expect(age.rules.map((r) => [r.name.text, r.args.map((a) => a.kind), r.text?.text])).toEqual([
      ['min', ['number'], 'Mayor de edad.'],
      ['required', [], undefined],
    ]);
  });

  it('a `uuid` field and a group summary rule', () => {
    const source = lines('form f', '  id  uuid', '  g  group', '    a  str', '    summary', '      all-or-none');
    expect(codes(source)).toEqual([]);
    expect((form(source).fields[1] as FormGroup).summary!.items[0]!.kind).toBe('rule-use');
  });

  describe('require', () => {
    it('takes its text before or after `on <field>`', () => {
      const before = requires('form f\n  a  str\n  summary\n    require x  a == "b"  "Text." on a.b');
      expect([before[0]!.text?.text, before[0]!.on!.segments.map((s) => s.text)]).toEqual(['Text.', ['a', 'b']]);
      const after = requires('form f\n  a  str\n  summary\n    require x  a == "b" on a  "Text."');
      expect([after[0]!.text?.text, after[0]!.on!.segments.map((s) => s.text)]).toEqual(['Text.', ['a']]);
    });

    it('a string right after a comparison is part of the expression', () => {
      const [rule] = requires('form f\n  a  str\n  summary\n    require x  a == "b"');
      expect(rule).not.toHaveProperty('text');
      expect(rule!.expr!.kind).toBe('binary');
    });

    it('covers its parts', () => {
      const source = 'form f\n  a  str\n  summary\n    require x  a != "" on a';
      const [rule] = requires(source);
      expect(slice(source, rule!.keyword)).toBe('require');
      expect(slice(source, rule!.code.span)).toBe('x');
      expect(slice(source, rule!.expr!.span)).toBe('a != ""');
      expect(slice(source, rule!.on!.segments[0]!.span)).toBe('a');
    });

    it('`when` holds `require` lines', () => {
      const source = lines('form f', '  a  str', '  summary', '    when a == "x"', '      require y  not empty a', '      require z  a != "w"');
      expect(codes(source)).toEqual([]);
      const when = form(source).summary!.items[0]!;
      expect(when.kind === 'when' && when.rules.map((r) => r.code.text)).toEqual(['y', 'z']);
    });
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a form with no name', 'form', ['FUD1063']],
    ['an empty form', 'form f', ['FUD1073']],
    ['a word after the form name', 'form f x\n  a  str', ['FUD1064']],
    ['`validate-on` alone', 'form f\n  validate-on\n  a  str', ['FUD1063']],
    ['an unknown event', 'form f\n  validate-on blur hover\n  a  str', ['FUD1065']],
    ['a second `validate-on`', 'form f\n  validate-on blur\n  validate-on input\n  a  str', ['FUD1071']],
    ['a line under `validate-on`', 'form f\n  validate-on blur\n    x\n  a  str', ['FUD1065']],
    ['`validity` alone', 'form f\n  validity\n  a  str', ['FUD1063']],
    ['an unknown validity', 'form f\n  validity always\n  a  str', ['FUD1065']],
    ['a word after the validity', 'form f\n  validity rules x\n  a  str', ['FUD1064']],
    ['a second `validity`', 'form f\n  validity rules\n  validity rules\n  a  str', ['FUD1071']],
    ['`catches` alone', 'form f\n  catches\n  a  str', ['FUD1063']],
    ['`catches` a word', 'form f\n  catches x\n  a  str', ['FUD1068']],
    ['`catches` a status out of range', 'form f\n  catches 302\n  a  str', ['FUD1075']],
    ['a second `catches`', 'form f\n  catches 409\n  catches 422\n  a  str', ['FUD1071']],
    // Not a keyword in a group: a field called `catches` whose type is no type.
    ['`catches` in a group', 'form f\n  g  group\n    catches 409\n    a  str', ['FUD1067']],
    ['a field called `summary`', 'form f\n  summary  str', ['FUD1073', 'FUD1076']],
    ['a second `summary`', 'form f\n  a  str\n  summary\n    x\n  summary\n    y', ['FUD1071']],
    ['a line that is no field', 'form f\n  1x  str\n  a  str', ['FUD1065']],
    ['a lone word', 'form f\n  a\n  b  str', ['FUD1065']],
    ['an empty group', 'form f\n  g  group', ['FUD1073']],
    ['a word after `group`', 'form f\n  g  group x\n    a  str', ['FUD1064']],
    ['a field name in the wrong shape', 'form f\n  my-field  str\n  a  str', ['FUD1065']],
    ['`=` with no value', 'form f\n  a  str =', ['FUD1068']],
    ['a word for the initial value', 'form f\n  a  str = x', ['FUD1068']],
    ['a word after the initial value', 'form f\n  a  str = "" x', ['FUD1064']],
    ['a broken field type', 'form f\n  a  str[\n    required\n  b  str', ['FUD1067']],
    ['`range` alone', 'form f\n  a  u8\n    range', ['FUD1063']],
    ['`range` with a word', 'form f\n  a  u8\n    range x', ['FUD1068']],
    ['`range` with two texts', 'form f\n  a  u8\n    range "a" "b"', ['FUD1064']],
    ['a second `range`', 'form f\n  a  u8\n    range "a"\n    range "b"', ['FUD1071']],
    ['a line under `range`', 'form f\n  a  u8\n    range "a"\n      x', ['FUD1065']],
    ['a rule in the wrong shape', 'form f\n  a  str\n    Required', ['FUD1065']],
    ['a line under a rule', 'form f\n  a  str\n    required\n      x', ['FUD1065']],
    ['`require` with no code', 'form f\n  a  str\n  summary\n    require', ['FUD1063']],
    ['`require` with no expression', 'form f\n  a  str\n  summary\n    require x', ['FUD1069']],
    ['`require` with only a text', 'form f\n  a  str\n  summary\n    require x "Text."', ['FUD1069']],
    ['`require` with a bad expression', 'form f\n  a  str\n  summary\n    require x  a ==', ['FUD1069']],
    ['`require` on a bad field', 'form f\n  a  str\n  summary\n    require x  a on 1x', ['FUD1069']],
    ['a line under `require`', 'form f\n  a  str\n  summary\n    require x  a\n      y', ['FUD1065']],
    ['`when` with no expression', 'form f\n  a  str\n  summary\n    when\n      require x  a', ['FUD1069']],
    ['`when` with a bad expression', 'form f\n  a  str\n  summary\n    when a ==\n      require x  a', ['FUD1069']],
    ['a rule under `when`', 'form f\n  a  str\n  summary\n    when a\n      required', ['FUD1065']],
    ['a line in a summary that is no rule', 'form f\n  a  str\n  summary\n    1x', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }

  it('a field whose type cannot be read is dropped, its siblings kept', () => {
    expect(form('form f\n  a  str[\n  b  str').fields.map((m) => m.name.text)).toEqual(['b']);
  });

  it('an unknown event is dropped and the known ones kept', () => {
    expect(form('form f\n  validate-on blur hover\n  a  str').validateOn!.events.map((e) => e.text)).toEqual(['blur']);
  });

  it('`require` and `when` without an expression stay in the tree', () => {
    const items = form('form f\n  a  str\n  summary\n    require x\n    when\n      require y  a').summary!.items;
    expect(items.map((i) => [i.kind, 'expr' in i])).toEqual([
      ['require', false],
      ['when', false],
    ]);
  });
});
