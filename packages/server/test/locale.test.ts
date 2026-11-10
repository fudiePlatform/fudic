/** The language of a URL as the server answers it (SDD-58 §4.5). */

import { describe, expect, it } from 'vitest';
import { errorLocaleOf, localeOfPath, localeRedirect, negotiate, prefixPattern, withoutLocalePrefix } from '../src/index.js';

const TWO = ['es', 'en'] as const;

describe('prefixPattern', () => {
  it('prefixes with two or more locales, `/` included; leaves it with one', () => {
    expect(prefixPattern('/about', 'en', TWO)).toBe('/en/about');
    expect(prefixPattern('/', 'en', TWO)).toBe('/en');
    expect(prefixPattern('/about', 'es', ['es'])).toBe('/about');
  });
});

describe('localeOfPath', () => {
  it('the prefix with two or more, the only one with one, none without', () => {
    expect(localeOfPath('/en/about', TWO)).toBe('en');
    expect(localeOfPath('/fr/about', TWO)).toBeUndefined();
    expect(localeOfPath('/about', ['es'])).toBe('es');
    expect(localeOfPath('/about', [])).toBeUndefined();
    expect(localeOfPath('/about', undefined)).toBeUndefined();
  });
});

describe('errorLocaleOf / withoutLocalePrefix', () => {
  it('the URL’s prefix, else the page it comes from, else none', () => {
    expect(errorLocaleOf('/en/_fudic/error/404', '/es/x', TWO)).toBe('en');
    expect(errorLocaleOf('/_fudic/error/404', '/es/x', TWO)).toBe('es');
    expect(errorLocaleOf('/_fudic/error/404', undefined, TWO)).toBeUndefined();
  });

  it('takes the prefix off, and leaves `/` for a bare one', () => {
    expect(withoutLocalePrefix('/en/_fudic/error/404', TWO)).toBe('/_fudic/error/404');
    expect(withoutLocalePrefix('/en', TWO)).toBe('/');
    expect(withoutLocalePrefix('/about', TWO)).toBe('/about');
    expect(withoutLocalePrefix('/en/about', ['en'])).toBe('/en/about');
    expect(withoutLocalePrefix('/en/about', undefined)).toBe('/en/about');
  });
});

describe('negotiate', () => {
  it('the same tag first, by quality; then the same base language', () => {
    expect(negotiate('es;q=0.5, en;q=0.9', TWO)).toBe('en');
    expect(negotiate('en-GB', ['es', 'en-US'])).toBe('en-US');
    expect(negotiate('EN', TWO)).toBe('en');
  });

  it('in the order written when the quality ties, never what q=0 refuses, a parameter that is not q ignored', () => {
    expect(negotiate('en, es', TWO)).toBe('en');
    expect(negotiate('en;q=0, es', TWO)).toBe('es');
    expect(negotiate('en;level=1;q=0.4, es;q=0.3', TWO)).toBe('en');
  });

  it('the first locale when nothing fits, or there is no header', () => {
    expect(negotiate('fr, ,de', TWO)).toBe('es');
    expect(negotiate(undefined, TWO)).toBe('es');
  });
});

describe('localeRedirect', () => {
  const isPage = (path: string): boolean => path === '/es/about';

  it('`/` and a page asked without its prefix go to it in the language that fits', () => {
    expect(localeRedirect('/', 'en', TWO, isPage)).toBe('en/');
    expect(localeRedirect('/about', 'en', TWO, isPage)).toBe('en/about');
  });

  it('a prefixed URL, a file, the framework’s own, Vite’s and a URL that is no page are left alone', () => {
    expect(localeRedirect('/en/about', 'en', TWO, isPage)).toBe(false);
    expect(localeRedirect('/about.css', 'en', TWO, () => true)).toBe(false);
    expect(localeRedirect('/_fudic/data/about', 'en', TWO, () => true)).toBe(false);
    expect(localeRedirect('/@vite/client', 'en', TWO, () => true)).toBe(false);
    expect(localeRedirect('/nope', 'en', TWO, isPage)).toBe(false);
  });

  it('with fewer than two locales there is no prefix to send anyone to', () => {
    expect(localeRedirect('/', 'en', ['es'], isPage)).toBe(false);
    expect(localeRedirect('/', 'en', undefined, isPage)).toBe(false);
  });
});
