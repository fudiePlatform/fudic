/**
 * SDD-74 §4.5 and criteria 16 and 18 — the texts of a `.fudapi` as messages, and the module of
 * a locale written with them translated.
 */

import { describe, expect, it } from 'vitest';
import { messageKey, type CompiledMessage } from '@fudic/i18n';
import { createApiIndex, emitModule, extractApiMessages, type ApiLocale, type ApiMessage } from '../src/index.js';
import { PERSON } from './emit/_project.js';
import { USER_FORM } from './helpers.js';
import { app, BUILT_INS } from './project.js';

const lines = (...l: string[]): string => l.join('\n');
const slice = (source: string, s: { start: number; end: number }): string => source.slice(s.start, s.end);
const messages = (source: string): readonly ApiMessage[] => extractApiMessages(source, 'forms/person.fudapi').value;

describe('criterion 16: extractApiMessages over forms/person.fudapi', () => {
  const found = messages(PERSON);

  it('one message per text, in source order, every one from the .fudapi', () => {
    expect(found.map((m) => [m.context, m.source])).toEqual([
      ['person.name.required', 'Escribe el nombre.'],
      ['person.email.required', 'Escribe el email.'],
      ['person.email.pattern', 'Ese email no parece válido.'],
      ['person.email.email-taken', 'Ese email ya lo usa otra persona.'],
      ['person.age.required', 'Escribe la edad.'],
      ['person.age.min', 'Tiene que tener al menos {n} años.'],
      ['person.age.max', 'Como mucho {n} años.'],
    ]);
    for (const m of found) {
      expect(m.origin).toBe('fudapi');
      expect(m.tags).toBe(0);
      expect(m.key).toBe(messageKey(m.context, m.source));
      expect(slice(PERSON, m.span)).toBe(JSON.stringify(m.source));
    }
    expect(extractApiMessages(PERSON, 'forms/person.fudapi').diagnostics).toEqual([]);
  });

  it('`min 18 "…{n}…"` has the hole n, filled by the rule’s argument', () => {
    const min = found.find((m) => m.context === 'person.age.min')!;
    expect(min.holes.map((h) => [h.name, slice(PERSON, h.expr)])).toEqual([['n', '18']]);
  });

  it('a text with no hole has no holes', () => {
    expect(found.find((m) => m.context === 'person.name.required')!.holes).toEqual([]);
  });

  it('two equal texts in two fields: two keys', () => {
    const source = lines('form f', '  a  str', '    required  "Obligatorio."', '  b  str', '    required  "Obligatorio."');
    const [a, b] = messages(source);
    expect([a!.context, b!.context]).toEqual(['f.a.required', 'f.b.required']);
    expect(a!.key).not.toBe(b!.key);
    expect([a!.at, b!.at]).toEqual([0, 1]);
  });
});

describe('extractApiMessages: every kind of text (§4.5)', () => {
  it('a group, its summary, a `require` and a `require` inside `when`, with the path of each', () => {
    const contexts = messages(USER_FORM).map((m) => m.context);
    expect(contexts).toContain('userForm.acceso.clave.min-length');
    expect(contexts).toContain('userForm.acceso.summary.mismatch');
    expect(contexts).toContain('userForm.summary.same-as-name');
    expect(contexts).toContain('userForm.summary.key-has-name');

    const when = lines('form f', '  a  str', '  summary', '    when a == "x"', '      require y  not empty a  "Falta y."', '      require z  a != "w"');
    expect(messages(when).map((m) => [m.context, m.source])).toEqual([['f.summary.y', 'Falta y.']]);
  });

  it('a rule named in a summary, with and without its text', () => {
    const source = lines('form f', '  a  str', '  summary', '    all-or-none  "Todo o nada."', '    other');
    expect(messages(source).map((m) => [m.context, m.source])).toEqual([['f.summary.all-or-none', 'Todo o nada.']]);
  });

  it('a `range`: its holes are filled by the field’s type', () => {
    const source = lines('form f', '  age  u8', '    range "Entre {min} y {max}."');
    const [range] = messages(source);
    expect(range!.context).toBe('f.age.range');
    expect(range!.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([['min', 'u8'], ['max', 'u8']]);
  });

  it('the detail of a middleware’s `fails`; one without detail is no text', () => {
    const source = lines('middleware csrf', '  server', '  fails cross-site 403 "Petición de otro sitio."', '  fails gone 410');
    const found = messages(source);
    expect(found.map((m) => [m.context, m.source])).toEqual([['csrf.cross-site', 'Petición de otro sitio.']]);
    expect(found[0]!.holes).toEqual([]);
  });

  it('a rule without a text, a rule’s own `fails` and the rest of the file: no message', () => {
    const source = lines('rule r', '  on field str', '  runs both', '  fails r', 'type A', '  x  str', 'form f', '  a  str', '    required');
    expect(messages(source)).toEqual([]);
  });

  it('a rule with several arguments: its holes are filled by all of them', () => {
    const source = lines('form f', '  a  u8', '    between 1 9  "De {low} a {high}, {low} incluido."');
    const [m] = messages(source);
    expect(m!.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([['low', '1 9'], ['high', '1 9']]);
  });

  it('the same words under the same path are one key with one ordinal', () => {
    const source = lines('form f', '  a  str', '    required  "x"', '    required  "x"');
    const found = messages(source);
    expect(found.map((m) => m.at)).toEqual([0, 0]);
  });

  it('the source is ICU: quotes, braces that are no hole and tag-like text are escaped', () => {
    const source = lines('form f', '  a  str', '    required  "It\'s {n} or { 2 } <1> </2> a<b"');
    expect(messages(source)[0]!.source).toBe("It''s {n} or '{' 2 '}' '<'1> '<'/2> a<b");
  });

  it('broken input never throws: the parser’s diagnostics come back with what it read', () => {
    const { value, diagnostics } = extractApiMessages('form f\n  a  str\n    required  "ok"\nfrob', 'x.fudapi');
    expect(value.map((m) => m.source)).toEqual(['ok']);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1062']);
  });
});

describe('criterion 18: the module of a locale', () => {
  const FILE = lines(
    'middleware guard',
    '  server',
    '  fails denied 403 "No puedes."',
    'form f',
    '  name  str = ""',
    '    required  "Escribe el nombre."',
    '  age  u8',
    '    min 18  "Al menos {n} años."',
    '    range "Entre {min} y {max}."',
    '  summary',
    '    require y  not empty name  "Falta el nombre."',
    '',
  );
  const source = app('forms/f', FILE);
  const index = createApiIndex([...BUILT_INS, source]);

  /** A locale that answers from a table by source text. */
  const locale = (table: Readonly<Record<string, CompiledMessage>>): ApiLocale => ({
    translate: (m) => table[m.source],
  });

  const EN: Record<string, CompiledMessage> = {
    'No puedes.': ["You can't."],
    'Escribe el nombre.': ['Write the name.'],
    'Al menos {n} años.': ['At least ', { hole: 'n' }, ' years old.'],
    'Entre {min} y {max}.': ['Between ', { hole: 'min' }, ' and ', { hole: 'max' }, '.'],
    'Falta el nombre.': ['The name is missing.'],
  };

  it('each text written in the locale, on both sides', () => {
    for (const side of ['server', 'browser'] as const) {
      const text = emitModule(source, index, {}, side, locale(EN));
      for (const translated of ['You can\'t.', 'Write the name.', 'At least {n} years old.', 'Between 0 and 255.', 'The name is missing.']) {
        expect(text, side).toContain(translated);
      }
      expect(text).not.toContain('Escribe el nombre.');
    }
  });

  it('without i18n, the same bytes as before; with a locale that has nothing, the same too', () => {
    const plain = emitModule(source, index, {}, 'server');
    expect(plain).toContain('Escribe el nombre.');
    expect(plain).toContain('Al menos {n} años.');
    expect(emitModule(source, index, {}, 'server', locale({}))).toBe(plain);
    expect(emitModule(source, index, {}, 'browser', locale({}))).toBe(emitModule(source, index, {}, 'browser'));
  });

  it('a text without translation stays as written; the others are translated', () => {
    const { ['Escribe el nombre.']: _, ...rest } = EN;
    const text = emitModule(source, index, {}, 'server', locale(rest));
    expect(text).toContain('Escribe el nombre.');
    expect(text).toContain('At least {n} years old.');
  });

  it.each([
    ['a plural', [{ plural: 'n', cases: {}, other: ['many'] }]],
    ['a select', [{ select: 'n', cases: {}, other: ['x'] }]],
    ['a tag', [{ tag: 0 }]],
    ['a hole the text does not have', ['At least ', { hole: 'm' }]],
    ['a #', [{ pound: 'n' }]],
  ] as const)('a translation with %s is more than a template: the text stays as written', (_what, compiled) => {
    const text = emitModule(source, index, {}, 'server', locale({ ...EN, 'Al menos {n} años.': compiled as CompiledMessage }));
    expect(text).toContain('Al menos {n} años.');
    expect(text).toContain('Write the name.');
  });

  it('the locale is asked with the message the extraction gives', () => {
    const asked: ApiMessage[] = [];
    emitModule(source, index, {}, 'server', { translate: (m) => (asked.push(m), undefined) });
    expect(asked).toEqual(extractApiMessages(FILE, 'forms/f.fudapi').value);
  });
});
