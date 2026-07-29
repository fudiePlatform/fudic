/**
 * The role of a `.fud` (SDD-24 §4.5, decision 51 and SDD-21).
 *
 * Read from the document, never from the file name: `_layout.fud` is a convention of the
 * CLI, and the `href` completion filters by what a file IS.
 */

import { describe, expect, it } from 'vitest';
import { layoutHrefOf, roleOf, tagOf } from '../src/mode.js';
import { parseFud } from '../src/parse.js';
import { component, LAYOUT, NESTED_LAYOUT, PAGE, route } from './_support.js';

const doc = (source: string) => parseFud(source).document;

describe('roleOf', () => {
  it.each([
    ['a component', component('app-badge'), 'component'],
    ['a standalone page', PAGE, 'page'],
    ['a route', route('../layouts/_layout.fud'), 'route'],
    ['a layout', LAYOUT, 'layout'],
  ])('reads %s', (_label, source, expected) => {
    expect(roleOf(doc(source))).toBe(expected);
  });
});

describe('tagOf', () => {
  it('is the host tag of a component', () => {
    expect(tagOf(doc(component('app-badge')))).toBe('app-badge');
  });

  it.each([
    ['a page', PAGE],
    ['a route', route('../layouts/_layout.fud')],
    ['a layout', LAYOUT],
  ])('is empty for %s: it is not reached by being written as an element', (_label, source) => {
    expect(tagOf(doc(source))).toBe('');
  });
});

describe('layoutHrefOf', () => {
  it('is the href of a route', () => {
    expect(layoutHrefOf(doc(route('../layouts/_layout.fud')))).toBe('../layouts/_layout.fud');
  });

  it('is the parent href of a nested layout (decision 87)', () => {
    expect(layoutHrefOf(doc(NESTED_LAYOUT))).toBe('./_root.fud');
  });

  it.each([
    ['a component', component('app-badge')],
    ['a page', PAGE],
    ['a plain layout', LAYOUT],
  ])('is empty for %s', (_label, source) => {
    expect(layoutHrefOf(doc(source))).toBe('');
  });
});
