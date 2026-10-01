/**
 * SDD-49 criterion 3: selectors, read far enough to ask whether one can match anything on a
 * page (`parseSelectorList`, `splitSelectorList`).
 *
 * The direction of every doubt is fixed: what is not understood is `null`, and a `null` list
 * keeps its rule. So the `null` cases are as much the contract as the readings.
 */

import { describe, expect, it } from 'vitest';
import {
  parseSelectorList,
  splitSelectorList,
  type ComplexSelector,
  type CompoundSelector,
} from '../../src/css/selectors.js';

function list(prelude: string): readonly ComplexSelector[] {
  const parsed = parseSelectorList(prelude);
  expect(parsed, prelude).not.toBeNull();
  return parsed!;
}

function one(prelude: string): ComplexSelector {
  const parsed = list(prelude);
  expect(parsed).toHaveLength(1);
  return parsed[0]!;
}

function compound(prelude: string): CompoundSelector {
  const c = one(prelude);
  expect(c.compounds).toHaveLength(1);
  return c.compounds[0]!;
}

const EMPTY = { classes: [], ids: [], attributes: [], anyOf: [], pseudo: [] };

describe('lists, compounds and combinators', () => {
  it('splits a list at its top-level commas', () => {
    const parsed = list('h1, h2 ,h3');
    expect(parsed.map((c) => c.compounds[0]!.type)).toEqual(['h1', 'h2', 'h3']);
  });

  it('reads the four combinators, descendant by whitespace', () => {
    const c = one('ul > li + p ~ a  span\n\tem');
    expect(c.compounds.map((x) => x.type)).toEqual(['ul', 'li', 'p', 'a', 'span', 'em']);
    expect(c.combinators).toEqual(['>', '+', '~', ' ', ' ']);
  });

  it('reads combinators written without spaces', () => {
    expect(one('a>b+c~d').combinators).toEqual(['>', '+', '~']);
  });

  it('reads a whole compound', () => {
    expect(compound('DIV.a.b#main[hidden]:hover')).toEqual({
      ...EMPTY,
      type: 'div',
      classes: ['a', 'b'],
      ids: ['main'],
      attributes: [{ name: 'hidden' }],
      pseudo: ['hover'],
    });
  });

  it('`*` and `&` have no type', () => {
    expect(compound('*')).toEqual(EMPTY);
    expect(compound('&')).toEqual(EMPTY);
    expect(compound('*.a')).toEqual({ ...EMPTY, classes: ['a'] });
    expect(compound('&.a')).toEqual({ ...EMPTY, classes: ['a'] });
    expect(compound('.a&')).toEqual({ ...EMPTY, classes: ['a'] });
  });

  it('drops the leading combinator of a relative selector', () => {
    for (const [prelude, type] of [
      ['> li', 'li'],
      ['+ p', 'p'],
      ['~ a', 'a'],
    ] as const) {
      const c = one(prelude);
      expect(c.compounds.map((x) => x.type)).toEqual([type]);
      expect(c.combinators).toEqual([]);
    }
  });
});

describe('attributes', () => {
  it('reads a name without a value, lower case', () => {
    expect(compound('[Data-X]').attributes).toEqual([{ name: 'data-x' }]);
    expect(compound('[ x ]').attributes).toEqual([{ name: 'x' }]);
  });

  it.each(['=', '~=', '|=', '^=', '$=', '*='] as const)('reads the operator `%s`', (operator) => {
    expect(compound(`[lang${operator}en]`).attributes).toEqual([{ name: 'lang', value: 'en', operator }]);
  });

  it('reads a string value and an ident value', () => {
    expect(compound('[type="text"]').attributes).toEqual([{ name: 'type', value: 'text', operator: '=' }]);
    expect(compound("[type = 'a b' ]").attributes).toEqual([{ name: 'type', value: 'a b', operator: '=' }]);
    expect(compound('[type=Text]').attributes).toEqual([{ name: 'type', value: 'Text', operator: '=' }]);
  });

  it('resolves the escapes of a string value', () => {
    expect(compound('[title="a\\"b\\41 c"]').attributes).toEqual([
      { name: 'title', value: 'a"bAc', operator: '=' },
    ]);
  });

  it('the `s` flag keeps the value; the `i` flag keeps only the name', () => {
    expect(compound('[type="a" s]').attributes).toEqual([{ name: 'type', value: 'a', operator: '=' }]);
    expect(compound('[type="a" S ]').attributes).toEqual([{ name: 'type', value: 'a', operator: '=' }]);
    expect(compound('[type="a" i]').attributes).toEqual([{ name: 'type' }]);
  });
});

describe('pseudo-classes and pseudo-elements', () => {
  it('`:is()`, `:where()` and `:matches()` are `anyOf`', () => {
    for (const name of ['is', 'where', 'matches', 'IS', '-webkit-any', '-moz-any']) {
      const c = compound(`:${name}(.a, h1 > p)`);
      expect(c.pseudo).toEqual([]);
      expect(c.anyOf).toHaveLength(1);
      expect(c.anyOf[0]!.map((x) => x.compounds.length)).toEqual([1, 2]);
      expect(c.anyOf[0]![0]!.compounds[0]!.classes).toEqual(['a']);
    }
  });

  it('every other pseudo is filed by name, lower case, its arguments not read', () => {
    expect(compound('a:not(.x):has(> img):HOVER:nth-child(2n + 1)::before').pseudo).toEqual([
      'not',
      'has',
      'hover',
      'nth-child',
      'before',
    ]);
    expect(compound(':host(.x)').pseudo).toEqual(['host']);
    expect(compound(':root').pseudo).toEqual(['root']);
  });

  it('`:is` without arguments, and `::is()`, are plain pseudos', () => {
    expect(compound('a:is').pseudo).toEqual(['is']);
    expect(compound('a::is(.b)')).toEqual({ ...EMPTY, type: 'a', pseudo: ['is'] });
  });

  it('arguments may hold strings, escapes and nested parentheses', () => {
    expect(compound('a:not([title=")"]):has(:is(b)):x(\\))').pseudo).toEqual(['not', 'has', 'x']);
  });

  it('`::slotted(x)` is `slotted`', () => {
    const c = compound('::slotted(p.note)');
    expect(c.slotted?.compounds[0]).toEqual({ ...EMPTY, type: 'p', classes: ['note'] });
    expect(c.pseudo).toEqual([]);
  });

  it('`::part(a b)` is `part`, as written', () => {
    expect(compound('x-tabs::part( tab active )').part).toBe('tab active');
  });
});

describe('identifiers', () => {
  it('resolves an escaped character: `.md\\:flex` is `md:flex`', () => {
    expect(compound('.md\\:flex').classes).toEqual(['md:flex']);
  });

  it('resolves a hexadecimal escape and the one space that ends it', () => {
    expect(compound('.\\31 0').classes).toEqual(['10']);
    expect(compound('.a\\31').classes).toEqual(['a1']);
    expect(compound('\\61 b').type).toBe('ab');
  });

  it('reads a non-ASCII and an underscore or hyphen start', () => {
    expect(compound('.ñandú._x.-y').classes).toEqual(['ñandú', '_x', '-y']);
  });

  it('drops the comments of a prelude, also where whitespace may be', () => {
    const c = one('ul /* list */>/**/li');
    expect(c.compounds.map((x) => x.type)).toEqual(['ul', 'li']);
    expect(c.combinators).toEqual(['>']);
    expect(one('a/* x */b').combinators).toEqual([' ']);
    // A `/*` inside a string is not a comment.
    expect(compound('[title="/*"]').attributes).toEqual([{ name: 'title', value: '/*', operator: '=' }]);
  });

  it('a comma inside a string or parentheses does not split the list', () => {
    expect(list('[title="a,b"], :is(a, b), x\\,y')).toHaveLength(3);
  });
});

describe('what it does not understand is null', () => {
  it.each([
    ['a percentage', '50%'],
    ['an empty selector in the list', 'a,,b'],
    ['a trailing comma', 'a, b,'],
    ['an empty prelude', '   '],
    ['a namespace on a type', 'ns|a'],
    ['a namespace on `*`', '*|a'],
    ['a namespace on an attribute', '[*|x]'],
    ['an empty namespace on an attribute', '[|x]'],
    ['a named namespace on an attribute', '[ns|x]'],
    ['the column combinator', 'col || td'],
    ['a doubled `+`', 'a ++ b'],
    ['a doubled `~`', 'a ~~ b'],
    ['a dangling combinator', 'a >'],
    ['two compounds glued by an unknown character', 'a!b'],
    ['an empty `::slotted()`', '::slotted()'],
    ['`::slotted` without arguments', '::slotted'],
    ['`::slotted()` with two selectors', '::slotted(a, b)'],
    ['an empty `::part()`', '::part(  )'],
    ['`::part` without arguments', '::part'],
    ['an `:is()` it cannot read', ':is(50%)'],
    ['an unclosed string', '[title="x]'],
    ['an unclosed comment', 'a /* x'],
    ['an unclosed parenthesis', ':not(a'],
    ['an invalid attribute operator', '[x!=a]'],
    ['an attribute that never closes', '[x'],
    ['an attribute value that never closes', '[x=a'],
    ['an attribute value that is not an ident', '[x=1]'],
    ['an attribute flag other than i or s', '[x=a b]'],
    ['text after the attribute flag', '[x=a i j]'],
    ['a class with no name', 'a.'],
    ['an id with no name', 'a#1'],
    ['a pseudo with no name', 'a:'],
    ['an escape at the very end', '.a\\'],
  ])('%s: `%s`', (_, prelude) => {
    expect(parseSelectorList(prelude)).toBeNull();
  });
});

describe('splitSelectorList', () => {
  it('keeps each selector as the author wrote it', () => {
    expect(splitSelectorList('h1,  h2 > p , [t="a,b"], :is(a, b), a\\,b')).toEqual([
      'h1',
      '  h2 > p ',
      ' [t="a,b"]',
      ' :is(a, b)',
      ' a\\,b',
    ]);
  });

  it('is null when a string never closes', () => {
    expect(splitSelectorList('a, [t="x')).toBeNull();
  });
});
