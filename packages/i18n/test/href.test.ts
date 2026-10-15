import { describe, expect, it } from 'vitest';
import { $href } from '../src/runtime/index.js';

const LOCALES = ['es', 'en'] as const;
const href = (value: unknown): unknown => $href(value, 'en', LOCALES);

describe('$href (§4.8)', () => {
  it.each([
    ['/about', '/en/about'],
    ['/', '/en/'],
    ['/about?x=1#y', '/en/about?x=1#y'],
    ['/blog/a', '/en/blog/a'],
    ['/a.b/c?x.y', '/en/a.b/c?x.y'],
    ['/about#a.b', '/en/about#a.b'],
    ['/esx/about', '/en/esx/about'],
    ['/english', '/en/english'],
    ['/_fudicx', '/en/_fudicx'],
  ])('%s → %s', (value, expected) => {
    expect(href(value)).toBe(expected);
  });

  it.each([
    ['a relative link', 'about'],
    ['another origin', '//cdn/x'],
    ['an absolute URL', 'https://example.com/about'],
    ['a framework URL', '/_fudic/x'],
    ['a link already in the page language', '/en/about'],
    ['a link to another language (a switcher)', '/es/about'],
    ['the bare language prefix', '/en'],
    ['the bare language prefix with a query', '/es?x=1'],
    ['a file', '/doc.pdf'],
    ['a nested file', '/files/report.v2.pdf?dl=1'],
    ['an empty string', ''],
    ['a fragment', '#top'],
  ])('leaves %s as it is', (_case, value) => {
    expect(href(value)).toBe(value);
  });

  it('leaves what is not a string untouched, by reference', () => {
    const url = new URL('https://example.com/about');

    expect(href(url)).toBe(url);
    expect(href(42)).toBe(42);
    expect(href(null)).toBeNull();
    expect(href(undefined)).toBeUndefined();
  });

  it('uses the locales it is given', () => {
    expect($href('/fr/about', 'en', ['en', 'fr'])).toBe('/fr/about');
    expect($href('/fr/about', 'en', ['en'])).toBe('/en/fr/about');
  });
});
