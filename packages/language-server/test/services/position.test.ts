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
  hrefContextAt,
  linksOf,
  sectionContextAt,
  tagContextAt,
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
