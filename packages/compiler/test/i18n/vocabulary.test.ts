import { compileMessage } from '@fudic/i18n';
import { describe, expect, it } from 'vitest';
import { atConstructs } from '../../src/constructs.js';
import { parseDocument, type ElementNode } from '../../src/html/index.js';
import {
  LETTER,
  PHRASING,
  escapeIcu,
  normalizeSpace,
  staticAttr,
  translatableAttr,
  translateNo,
} from '../../src/i18n/vocabulary.js';

/** The first element of `html`. */
function el(html: string): ElementNode {
  const node = parseDocument(html, { atConstructs }).value.children.find((c) => c.type === 'element');
  if (node?.type !== 'element') throw new Error(`no element in ${html}`);
  return node;
}

/** Whether attribute `name` of the first element of `html` is translatable. */
function translatable(html: string, name: string): boolean {
  const element = el(html);
  const attr = element.attributes.find((a) => a.name === name);
  if (attr === undefined) throw new Error(`no ${name} in ${html}`);
  return translatableAttr(element, attr);
}

describe('LETTER and PHRASING (§4.1, §4.2)', () => {
  it('a letter of any script is a letter; digits and signs are not', () => {
    for (const text of ['a', 'Ñ', 'ж', '中', 'ا']) expect(LETTER.test(text)).toBe(true);
    for (const text of ['', ' ', '42', '—', '…', '+-*/', '😀']) expect(LETTER.test(text)).toBe(false);
  });

  it('the phrasing elements of §4.2, and no block element', () => {
    expect([...PHRASING].sort()).toEqual(
      ['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'output', 'q', 's', 'samp', 'slot', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'].sort(),
    );
    for (const block of ['p', 'div', 'li', 'button', 'label', 'img', 'input']) expect(PHRASING.has(block)).toBe(false);
  });
});

describe('translatableAttr (§4.1.2)', () => {
  it.each(['title', 'alt', 'placeholder', 'aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext'])(
    '%s is translated on any element',
    (name) => {
      expect(translatable(`<div ${name}="x"></div>`, name)).toBe(true);
      expect(translatable(`<my-thing ${name}="x"></my-thing>`, name)).toBe(true);
    },
  );

  it('matches names and elements in any case', () => {
    expect(translatable('<IMG ALT="x">', 'ALT')).toBe(true);
    expect(translatable('<TH ABBR="x"></TH>', 'ABBR')).toBe(true);
  });

  it.each([
    ['abbr on th', '<th abbr="x"></th>', 'abbr', true],
    ['abbr on td', '<td abbr="x"></td>', 'abbr', false],
    ['label on option', '<option label="x"></option>', 'label', true],
    ['label on optgroup', '<optgroup label="x"></optgroup>', 'label', true],
    ['label on track', '<track label="x">', 'label', true],
    ['label on div', '<div label="x"></div>', 'label', false],
    ['download on a', '<a download="x"></a>', 'download', true],
    ['download on area', '<area download="x">', 'download', true],
    ['download on img', '<img download="x">', 'download', false],
  ])('%s', (_case, html, name, expected) => {
    expect(translatable(html, name)).toBe(expected);
  });

  it.each([
    ['submit', true],
    ['button', true],
    ['reset', true],
    ['SUBMIT', true],
    [' submit ', true],
    ['text', false],
    ['hidden', false],
  ])('value on <input type="%s"> → %s', (type, expected) => {
    expect(translatable(`<input type="${type}" value="Enviar">`, 'value')).toBe(expected);
  });

  it('value on an input with no type, a dynamic type, or on another element is not translated', () => {
    expect(translatable('<input value="x">', 'value')).toBe(false);
    expect(translatable('<input type=@kind value="x">', 'value')).toBe(false);
    expect(translatable('<button type="submit" value="x"></button>', 'value')).toBe(false);
    expect(translatable('<option value="x"></option>', 'value')).toBe(false);
  });

  it('content only on <meta name="description">', () => {
    expect(translatable('<meta name="description" content="x">', 'content')).toBe(true);
    expect(translatable('<meta name="Description" content="x">', 'content')).toBe(true);
    expect(translatable('<meta name="keywords" content="x">', 'content')).toBe(false);
    expect(translatable('<meta content="x">', 'content')).toBe(false);
    expect(translatable('<div name="description" content="x"></div>', 'content')).toBe(false);
  });

  it.each(['class', 'id', 'href', 'name', 'style', 'data-title', 'translate'])('%s is not in the list', (name) => {
    expect(translatable(`<div ${name}="x"></div>`, name)).toBe(false);
  });

  it('a bus:(expr) attribute, whose name is an expression, is not text', () => {
    const element = el('<div bus:(evt)="@h"></div>');
    const [attr] = element.attributes;

    expect(typeof attr!.name).not.toBe('string');
    expect(translatableAttr(element, attr!)).toBe(false);
  });
});

describe('staticAttr and translateNo', () => {
  it('the static text of an attribute, trimmed and lowercased', () => {
    expect(staticAttr(el('<input TYPE=" Submit ">'), 'type')).toBe('submit');
  });

  it('undefined when absent, empty, dynamic or mixed', () => {
    expect(staticAttr(el('<input>'), 'type')).toBeUndefined();
    expect(staticAttr(el('<input type>'), 'type')).toBeUndefined();
    expect(staticAttr(el('<input type=@t>'), 'type')).toBeUndefined();
    expect(staticAttr(el(`<input type="a @(t)">`), 'type')).toBeUndefined();
  });

  it('skips an attribute whose name is an expression', () => {
    expect(staticAttr(el('<div bus:(evt)="@h" translate="no"></div>'), 'translate')).toBe('no');
  });

  it('translate="no", in any case, and nothing else', () => {
    expect(translateNo(el('<code translate="no"></code>'))).toBe(true);
    expect(translateNo(el('<code translate="NO"></code>'))).toBe(true);
    expect(translateNo(el('<code translate="yes"></code>'))).toBe(false);
    expect(translateNo(el('<code></code>'))).toBe(false);
  });
});

describe('escapeIcu (§4.2)', () => {
  it.each([
    ['plain', 'Hola', 'Hola'],
    ['an apostrophe is doubled', "it's", "it''s"],
    ['a pair of braces is one quoted run', 'a{}b', "a'{}'b"],
    ['each brace run is quoted', '{a}', "'{'a'}'"],
    ['a < before a digit would be a tag', '<0', "'<'0"],
    ['a < before /digit would be a closing tag', '</1>', "'<'/1>"],
    ['a < before anything else is itself', 'a < b <x>', 'a < b <x>'],
    ['a brace next to a tag-like <', '{<0', "'{<'0"],
    ['# is left alone: it is literal outside a plural', '# 1', '# 1'],
  ])('%s', (_case, text, escaped) => {
    expect(escapeIcu(text)).toBe(escaped);
  });

  it('compileMessage gives back exactly the text, for nasty inputs', () => {
    const nasty = [
      "'",
      "''",
      "'{",
      "{'",
      "}'",
      "'}'",
      "'<0>",
      "<'0",
      "a'{b}'c",
      '{{}}',
      '<0></0>',
      '<0/>',
      "'#'",
      "l'{x}",
      "x'''y",
      '</0/>',
      '{a, plural, other {#}}',
      "''{''}''",
    ];
    for (const text of nasty) {
      const { value, diagnostics } = compileMessage(escapeIcu(text), 'es');
      expect(diagnostics, text).toEqual([]);
      expect(value, text).toEqual([text]);
    }
  });

  it('round-trips every string over its special characters', () => {
    const alphabet = ["'", '{', '}', '<', '/', '0', '#', 'a', ' ', '>'];
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i++) {
      let text = '';
      const length = 1 + Math.floor(random() * 10);
      for (let j = 0; j < length; j++) text += alphabet[Math.floor(random() * alphabet.length)];
      const { value, diagnostics } = compileMessage(escapeIcu(text), 'es');
      expect(diagnostics, text).toEqual([]);
      expect(value, text).toEqual([text]);
    }
  });
});

describe('normalizeSpace', () => {
  it('collapses every run of whitespace and trims', () => {
    expect(normalizeSpace('  Hola\n\t  mundo  \r\n')).toBe('Hola mundo');
    expect(normalizeSpace(' a  b ')).toBe('a b');
    expect(normalizeSpace('   ')).toBe('');
  });
});
