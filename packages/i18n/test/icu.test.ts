import { describe, expect, it } from 'vitest';
import { compileMessage, shapeOf, type CompiledMessage } from '../src/index.js';

function ok(text: string): CompiledMessage {
  const result = compileMessage(text, 'en');
  expect(result.diagnostics).toEqual([]);
  return result.value;
}

describe('compileMessage: what it compiles (§4.2, §4.3)', () => {
  it.each<[string, string, CompiledMessage]>([
    ['the empty text', '', []],
    ['plain text', 'Hola', ['Hola']],
    ['a hole', 'Hola {name}!', ['Hola ', { hole: 'name' }, '!']],
    ['a hole with spaces inside the braces', '{ name }', [{ hole: 'name' }]],
    ['a hole named with letters, digits, _ and $', '{ñ_1$}', [{ hole: 'ñ_1$' }]],
    ['# outside a plural: a literal', 'a # b', ['a # b']],
    ['a < that opens no tag', 'a < b <x>', ['a < b <x>']],
    ['a tag', '<0>x</0>', [{ tag: 0, children: ['x'] }]],
    ['an empty tag pair', '<0></0>', [{ tag: 0, children: [] }]],
    ['a self-closing tag', 'a<1/>b', ['a', { tag: 1 }, 'b']],
    ['tags inside tags', '<0>a<1>b</1></0>', [{ tag: 0, children: ['a', { tag: 1, children: ['b'] }] }]],
    [
      'criterion 3: a phrase with a tag and two holes',
      'Hola <0>{name}</0>, tienes {count} mensajes',
      ['Hola ', { tag: 0, children: [{ hole: 'name' }] }, ', tienes ', { hole: 'count' }, ' mensajes'],
    ],
    [
      'criterion 15: holes and tags in another order',
      '{count} mensajes para <0>{name}</0>',
      [{ hole: 'count' }, ' mensajes para ', { tag: 0, children: [{ hole: 'name' }] }],
    ],
  ])('%s', (_case, text, expected) => {
    expect(ok(text)).toEqual(expected);
  });

  it('a plural, with =N, categories and #', () => {
    expect(ok('{count, plural, =0 {none} one {# item} other {# items}}')).toEqual([
      {
        plural: 'count',
        cases: { '=0': ['none'], one: [{ pound: 'count' }, ' item'] },
        other: [{ pound: 'count' }, ' items'],
      },
    ]);
  });

  it('=N takes negative and decimal numbers', () => {
    expect(ok('{n, plural, =-1 {a} =1.5 {b} other {c}}')).toEqual([
      { plural: 'n', cases: { '=-1': ['a'], '=1.5': ['b'] }, other: ['c'] },
    ]);
  });

  it('every CLDR category is a plural case', () => {
    const [part] = ok('{n,plural,zero{0}one{1}two{2}few{3}many{4}other{5}}');

    expect(part).toEqual({
      plural: 'n',
      cases: { zero: ['0'], one: ['1'], two: ['2'], few: ['3'], many: ['4'] },
      other: ['5'],
    });
  });

  it('a select, where # is a literal', () => {
    expect(ok('{g, select, female {ella #} other {elle}}')).toEqual([
      { select: 'g', cases: { female: ['ella #'] }, other: ['elle'] },
    ]);
  });

  it('# inside a select nested in a plural refers to the plural', () => {
    expect(ok('{n, plural, other {{g, select, a {# a} other {#}}}}')).toEqual([
      {
        plural: 'n',
        cases: {},
        other: [{ select: 'g', cases: { a: [{ pound: 'n' }, ' a'] }, other: [{ pound: 'n' }] }],
      },
    ]);
  });

  it('# inside a tag inside a plural refers to the plural', () => {
    expect(ok('{n, plural, other {<0>#</0>}}')).toEqual([
      { plural: 'n', cases: {}, other: [{ tag: 0, children: [{ pound: 'n' }] }] },
    ]);
  });

  it('# refers to the innermost plural', () => {
    expect(ok('{a, plural, other {{b, plural, other {#}} #}}')).toEqual([
      {
        plural: 'a',
        cases: {},
        other: [{ plural: 'b', cases: {}, other: [{ pound: 'b' }] }, ' ', { pound: 'a' }],
      },
    ]);
  });

  describe('ICU quoting (§4.2)', () => {
    it.each([
      ["'' is an apostrophe", "It''s", "It's"],
      ['a lone apostrophe before a letter is itself', "l'eau", "l'eau"],
      ['an apostrophe at the end is itself', "trailing'", "trailing'"],
      ["'{' is a brace", "x '{' y", 'x { y'],
      ["'}' is a brace", "x '}' y", 'x } y'],
      ['a quoted run', "'{literal}'", '{literal}'],
      ["'' inside a quoted run is an apostrophe", "'{a''b}'", "{a'b}"],
      ['a quoted run without its closing apostrophe goes to the end', "'{unterminated", '{unterminated'],
      ["'#' is a hash", "'#'", '#'],
      ["'<' quotes a tag", "'<0>'", '<0>'],
    ])('%s', (_case, text, literal) => {
      expect(ok(text)).toEqual([literal]);
    });

    it('a quoted # inside a plural is not the value', () => {
      expect(ok("{n, plural, other {'#' #}}")).toEqual([
        { plural: 'n', cases: {}, other: ['# ', { pound: 'n' }] },
      ]);
    });

    it('a quoted run joins the literal around it', () => {
      expect(ok("a'{b}'c{x}")).toEqual(['a{b}c', { hole: 'x' }]);
    });
  });
});

describe('compileMessage: what it refuses, as FUD1024 inside the text', () => {
  it.each<[string, string, number, number, string]>([
    ["an unclosed hole", 'Hola {name', 10, 10, "expected '}' or ','"],
    ["a '{' at the end", '{', 1, 1, 'expected an argument name'],
    ["a hole without a name", 'a {} b', 3, 4, 'expected an argument name'],
    ["a '}' with nothing open", 'a } b', 2, 3, "unmatched '}'"],
    ['a case body that never closes', '{n, plural, other {x', 20, 20, "missing '}'"],
    ['a plural that never closes', '{n, plural, other {x}', 21, 21, "missing '}'"],
    ['a select that never closes', '{g, select, other {x} ', 22, 22, "missing '}'"],
    ['a tag that never closes', '<0>x', 4, 4, 'missing </0>'],
    ['a closing tag with nothing open', 'x</0>', 1, 5, 'unexpected </0>'],
    ['a closing tag of another number', '<0>x</1>', 4, 8, 'unexpected </1>'],
    ['a closing self-closing tag', '<0>x</0/>', 4, 9, 'unexpected </0/>'],
    ['an argument type outside the subset', '{x, number}', 4, 10, '"number" is not a supported argument type: use plural or select'],
    ['a missing argument type', '{x, }', 4, 5, 'expected plural or select'],
    ["a missing ',' after the type", '{x, plural other {a}}', 11, 12, "expected ','"],
    ["a missing '{' before a case", '{x, plural, one a}', 16, 17, "expected '{'"],
    ['a plural selector that is not a category', '{x, plural, foo {a} other {b}}', 12, 15, '"foo" is not a plural category: use =N, zero, one, two, few, many or other'],
    ["'=' without a number", '{x, plural, = {a} other {b}}', 12, 13, "expected a number after '='"],
    ["'=' in a select", '{x, select, =1 {a} other {b}}', 12, 13, 'expected a case'],
    ['a repeated case', '{x, plural, one {a} one {b} other {c}}', 20, 23, 'the case "one" is repeated'],
    ['a repeated other', '{x, select, other {a} other {b}}', 22, 27, 'the case "other" is repeated'],
    ['a select without other', '{x, select, a {a}}', 0, 18, 'the select of "x" has no "other" case'],
    ['a plural without other', 'Hi {x, plural, one {a}}!', 3, 23, 'the plural of "x" has no "other" case'],
    ['an error deep inside', '{n, plural, other {<0>{g, select, a {x}}</0>}}', 22, 40, 'the select of "g" has no "other" case'],
  ])('%s', (_case, text, start, end, reason) => {
    const { value, diagnostics } = compileMessage(text, 'en');

    expect(value).toEqual([text]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      severity: 'error',
      code: 'FUD1024',
      message: `the "en" translation of this message is invalid: ${reason}`,
      span: { start, end },
    });
    expect(end).toBeLessThanOrEqual(text.length);
  });

  it('names the locale it was given', () => {
    expect(compileMessage('{', 'fr').diagnostics[0]?.message).toContain('the "fr" translation');
  });

  it('never throws, whatever the text', () => {
    for (const text of ['{{{', '}}}', '<<<', "'''", '{a,plural,', '{a,select,other{', '</', '<0/>', '#{a}#']) {
      expect(() => compileMessage(text, 'en')).not.toThrow();
    }
  });
});

describe('shapeOf: what a translation must keep', () => {
  it('holes sorted, plural and select arguments included, # not; tags sorted as numbers', () => {
    const message = ok(
      '<10/>{count, plural, one {<0>#</0> {name}} other {{g, select, a {<2/>} other {x}}}} <1>{b}</1>',
    );

    expect(shapeOf(message)).toEqual({ holes: ['b', 'count', 'g', 'name'], tags: [0, 1, 2, 10] });
  });

  it('a repeated hole or tag counts once', () => {
    expect(shapeOf(ok('{a} {a} <0/> <0/>'))).toEqual({ holes: ['a'], tags: [0] });
  });

  it('plain text has neither', () => {
    expect(shapeOf(ok('Hola'))).toEqual({ holes: [], tags: [] });
  });

  it('the order of holes and tags does not change the shape (criterion 13)', () => {
    expect(shapeOf(ok('{count} mensajes para <0>{name}</0>'))).toEqual(
      shapeOf(ok('Hola <0>{name}</0>, tienes {count} mensajes')),
    );
  });
});
