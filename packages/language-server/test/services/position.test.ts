/**
 * What is under the cursor (SDD-24 §4.2, §6.3–§6.6).
 *
 * The empty `href=""` is the case that shapes this module: it is where completion is asked
 * for, and it has no value parts at all, so the span has to come from the attribute itself.
 */

import { describe, expect, it } from 'vitest';
import type { Attribute } from '@fudic/compiler';
import { parseFud } from '../../src/parse.js';
import {
  attributeOf,
  attributeValueSpan,
  classContextAt,
  directiveContextAt,
  hrefContextAt,
  isEmptyDocument,
  linksOf,
  sectionContextAt,
  tagContextAt,
  tagNameAt,
  wordContextAt,
} from '../../src/services/position.js';
import { component, LAYOUT, NESTED_LAYOUT, PAGE, route } from '../_support.js';

const doc = (source: string) => parseFud(source).document;

describe('linksOf', () => {
  it('lists the component links of a component', () => {
    const links = linksOf(doc(component('app-card', ['./app-badge.fud', './site-nav.fud'])));

    expect(links.map((link) => link.rel)).toEqual(['component', 'component']);
  });

  it('adds the layout link of a route', () => {
    const links = linksOf(doc(route('../layouts/_layout.fud', ['../components/app-badge.fud'])));

    expect(links.map((link) => link.rel)).toEqual(['component', 'layout']);
  });

  it('adds the parent link of a nested layout, and nothing for a plain one', () => {
    expect(linksOf(doc(NESTED_LAYOUT)).map((link) => link.rel)).toEqual(['layout']);
    expect(linksOf(doc(LAYOUT))).toEqual([]);
    expect(linksOf(doc(PAGE))).toEqual([]);
  });
});

describe('attributeValueSpan', () => {
  const spanOf = (source: string, attribute = 'href') => {
    const [link] = linksOf(doc(source));
    const found = attributeOf(link!.element, attribute);
    return found === undefined ? undefined : attributeValueSpan(source, found);
  };

  it('is the text inside the quotes', () => {
    const source = `<link rel="component" href="./app-badge.fud">\n${component('app-x')}`;
    const value = spanOf(source);

    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('is an empty span for href="" — a position, not a range', () => {
    const source = `<link rel="component" href="">\n${component('app-x')}`;
    const value = spanOf(source);

    expect(value?.start).toBe(value?.end);
    expect(source[(value?.start ?? 0) - 1]).toBe('"');
  });

  it('reaches to the end of an unquoted value', () => {
    const source = `<link rel=component href=./app-badge.fud>\n${component('app-x')}`;
    const value = spanOf(source);

    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('reaches to the end of an unterminated value: a half-typed href still completes', () => {
    // The AST cannot be talked into this shape — the parser's recovery always finds some later
    // quote to close on — but a span that ends before its quote does is exactly what a
    // recovered attribute may hand over, and the value must still be the text the user typed.
    const source = 'href="./app-badge.fud';
    const attribute: Attribute = {
      type: 'attribute',
      name: 'href',
      value: [],
      span: { start: 0, end: source.length },
    };

    const value = attributeValueSpan(source, attribute);
    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('is undefined for an attribute with no value at all', () => {
    const source = `<link rel="component" href>\n${component('app-x')}`;

    expect(spanOf(source)).toBeUndefined();
  });

  it('is undefined for an attribute this element does not have', () => {
    const source = `<link rel="component" href="./x.fud">\n${component('app-x')}`;

    expect(spanOf(source, 'media')).toBeUndefined();
  });
});

describe('hrefContextAt', () => {
  const source = `<link rel="component" href="./app-badge.fud">\n${component('app-x')}`;
  const at = source.indexOf('./app-badge.fud');

  it('answers inside the value', () => {
    const context = hrefContextAt(source, doc(source), at + 3);

    expect(context?.rel).toBe('component');
    expect(context?.text).toBe('./app-badge.fud');
  });

  it('answers at both ends, because a completion is asked for at a boundary', () => {
    expect(hrefContextAt(source, doc(source), at)).toBeDefined();
    expect(hrefContextAt(source, doc(source), at + './app-badge.fud'.length)).toBeDefined();
  });

  it('says nothing outside any href', () => {
    expect(hrefContextAt(source, doc(source), 2)).toBeUndefined();
    expect(hrefContextAt(source, doc(source), source.length - 2)).toBeUndefined();
  });

  it('recognizes the layout link of a route', () => {
    const routeSource = route('../layouts/_layout.fud');
    const offset = routeSource.indexOf('../layouts');

    expect(hrefContextAt(routeSource, doc(routeSource), offset + 1)?.rel).toBe('layout');
  });

  it('skips a link with no href instead of guessing', () => {
    const hrefless = `<link rel="component">\n${component('app-x')}`;

    expect(hrefContextAt(hrefless, doc(hrefless), 12)).toBeUndefined();
  });
});

describe('tagContextAt', () => {
  it.each([
    ['<', ''],
    ['<app-', 'app-'],
    ['<div>text <app-bad', 'app-bad'],
  ])('after %s completes %s', (prefix, expected) => {
    const context = tagContextAt(prefix, prefix.length);

    expect(context?.text).toBe(expected);
    expect(context?.span.end).toBe(prefix.length);
    expect(context?.span.start).toBe(prefix.length - expected.length);
  });

  it.each([['plain text'], ['<div> '], ['@if (x) {']])('says nothing at %s', (source) => {
    expect(tagContextAt(source, source.length)).toBeUndefined();
  });
});

describe('tagNameAt', () => {
  it.each([
    // The cursor anywhere in the name, and both ends of it, in an opening and a closing tag.
    ['<app-badge>', 1, 'app-badge'],
    ['<app-badge>', 5, 'app-badge'],
    ['<app-badge>', 10, 'app-badge'],
    ['</app-badge>', 4, 'app-badge'],
    ['<div><app-badge tone="x">', 8, 'app-badge'],
  ])('reads %s at %i as %s', (source, offset, expected) => {
    const name = tagNameAt(source, offset);

    expect(name?.text).toBe(expected);
    expect(source.slice(name?.span.start, name?.span.end)).toBe(expected);
  });

  it.each([
    // Not on a name at all: the delimiter itself, and whitespace.
    ['<app-badge>', 0],
    ['<app-badge> ', 12],
    // A word that opens nothing: plain text, a path, and an attribute value.
    ['plain text', 3],
    ['see a/app-badge', 10],
    ['<div class="app-badge">', 15],
  ])('says nothing in %s at %i', (source, offset) => {
    expect(tagNameAt(source, offset)).toBeUndefined();
  });
});

describe('sectionContextAt', () => {
  it.each([
    ['@section ', ''],
    ['@section na', 'na'],
    ['<div></div>\n@section\tnav', 'nav'],
  ])('after %s completes %s', (prefix, expected) => {
    expect(sectionContextAt(prefix, prefix.length)?.text).toBe(expected);
  });

  it.each([['@section'], ['@sections nav'], ['@if (x) {']])('says nothing at %s', (source) => {
    expect(sectionContextAt(source, source.length)).toBeUndefined();
  });
});

describe('classContextAt (BUG-15 §6.2)', () => {
  it.each([
    ['<span class:', ''],
    ['<span class:suc', 'suc'],
    ['<span class="badge" class:', ''],
    ['<span\n  class="badge"\n  class:in', 'in'],
    ['<span class:a="@(x)" class:b-c', 'b-c'],
  ])('reads %s as the partial name %s', (prefix, expected) => {
    const context = classContextAt(prefix, prefix.length);

    // The span covers what was typed after the colon and nothing else: the prefix stays,
    // it is what opens the context.
    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // Same shape, different answer: their names come from somewhere else entirely (§7).
    ['<span style:'],
    ['<span bus:'],
    // The static attribute, not the directive.
    ['<span class="'],
    ['<span class="bad'],
    // Somebody else's string.
    ['<div title="class:'],
    ["<div title='class:fo"],
    // Markup text, not an attribute.
    ['<p>class:'],
    ['<p>hello class:foo'],
    ['class:'],
    // A name that merely ends in `class`.
    ['<span subclass:'],
    ['<span data-class:'],
  ])('says nothing at %s', (source) => {
    expect(classContextAt(source, source.length)).toBeUndefined();
  });

  it('is the context again in the tag that follows a quoted one', () => {
    const source = '<div title="class:x"></div>\n<span class:su';

    expect(classContextAt(source, source.length)?.text).toBe('su');
  });
});

describe('wordContextAt (SDD-28 §5.3)', () => {
  it.each([
    ['app-button', 'app-button'],
    ['<div>\n  app-b', 'app-b'],
    ['<div></div>\ntext app', 'app'],
  ])('reads %s as the word %s', (prefix, expected) => {
    const context = wordContextAt(prefix, prefix.length);

    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // A word a `<` opens belongs to tagContextAt, not here.
    ['<app-b'],
    // Inside an open tag a word is an attribute name, and those are the projection's.
    ['<app-button ton'],
    ['<div class="a" hidd'],
    // Not a word at all: whitespace, a delimiter, and something that starts with a digit.
    ['<div> '],
    ['<div>'],
    ['123'],
  ])('says nothing at %s', (source) => {
    expect(wordContextAt(source, source.length)).toBeUndefined();
  });

  it('is a word again once the tag is closed', () => {
    const source = '<div class="a">app';

    expect(wordContextAt(source, source.length)?.text).toBe('app');
  });
});

describe('directiveContextAt (SDD-28 §5.4)', () => {
  it.each([
    ['@', '@'],
    ['@i', '@i'],
    ['<div>\n  @fore', '@fore'],
  ])('reads %s as %s, the `@` included', (prefix, expected) => {
    const context = directiveContextAt(prefix, prefix.length);

    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // `@@` is the escape of decision 1, and a `@` after a word is text, not a directive.
    ['@@'],
    ['@@i'],
    ['hola@ejemplo'],
    ['x@'],
    ['plain'],
  ])('says nothing at %s', (source) => {
    expect(directiveContextAt(source, source.length)).toBeUndefined();
  });
});

describe('isEmptyDocument', () => {
  it.each([
    [''],
    ['   '],
    ['\n\n  \t\n'],
    // Nothing but the word being typed: still a file nobody has written yet, and the only
    // state in which a skeleton is ever asked for.
    ['x'],
    ['rou'],
    ['  app-b\n'],
  ])('is true for %j', (source) => {
    expect(isEmptyDocument(source)).toBe(true);
  });

  it.each([['<div></div>'], ['@* a comment *@'], ['two words'], ['@code {}']])(
    'is false for %j',
    (source) => {
      expect(isEmptyDocument(source)).toBe(false);
    },
  );
});
