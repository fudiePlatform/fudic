/**
 * The URL guard (SDD-51 §3.7, §3.8, decision 140): one pure function every adapter calls, so
 * the server and the browser write the same string to the byte (criterion 16).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserDom as dom } from '../src/browser.js';
import { guardUrl, INERT_URL, isTrustedUrl, safeUrl, trustedUrl } from '../src/url.js';

describe('safeUrl — what a view may produce', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:x',
    '  javascript:x',
    'java\tscript:x',
    'java\nscript:x',
    '\u0001javascript:x',
    'vbscript:x',
    'miapp:abrir',
  ])('makes %j inert', (url) => {
    expect(safeUrl('a', 'href', url)).toBe(INERT_URL);
  });

  it.each(['https://a.b', 'http://a.b', 'mailto:a@b', 'tel:+34', '/x', 'x/y', '#a', '?q', 'y/z', ''])(
    'leaves %j alone',
    (url) => {
      expect(safeUrl('a', 'href', url)).toBe(url);
    },
  );

  it.each(['//evil.example/x', '/\\evil.example/x', '\\/evil.example/x', '\\\\evil.example/x', ' //evil.example'])(
    'makes %j inert: two slashes either way round are another origin (§3.8)',
    (url) => {
      expect(safeUrl('a', 'href', url)).toBe(INERT_URL);
      expect(safeUrl('script', 'src', url)).toBe(INERT_URL);
    },
  );

  it('lets a data: image through where an image loads, and nowhere else', () => {
    const png = 'data:image/png;base64,AAAA';
    expect(safeUrl('img', 'src', png)).toBe(png);
    expect(safeUrl('IMG', 'SRC', png)).toBe(png);
    expect(safeUrl('a', 'href', png)).toBe(INERT_URL);
    expect(safeUrl('img', 'src', 'data:text/html,x')).toBe(INERT_URL);
  });

  it('stringifies what is not a string, without a mark', () => {
    expect(safeUrl('a', 'href', 42)).toBe('42');
  });
});

describe('safeUrl — the attributes that hold a list', () => {
  it('reads a srcset candidate by candidate, a data: URL and its commas whole (§3.8)', () => {
    const list = 'data:image/png;base64,AAAA 1x, /b.png 2x,/c.png';
    expect(safeUrl('img', 'srcset', list)).toBe(list);
    expect(safeUrl('source', 'srcset', 'a.png,b.png')).toBe('a.png,b.png');
    expect(safeUrl('link', 'imagesrcset', '/a.png 1x')).toBe('/a.png 1x');
    expect(safeUrl('img', 'srcset', '/a.png 1x, javascript:x 2x')).toBe(INERT_URL);
    expect(safeUrl('img', 'srcset', '/a.png, //evil.example/b.png')).toBe(INERT_URL);
    expect(safeUrl('img', 'srcset', '')).toBe('');
  });

  it('reads a ping URL by URL', () => {
    expect(safeUrl('a', 'ping', '/a  https://b.c/d')).toBe('/a  https://b.c/d');
    expect(safeUrl('a', 'ping', '/a javascript:x')).toBe(INERT_URL);
  });
});

describe('trustedUrl — the exception, marked on the value (criterion 17)', () => {
  it('is written as it is, whatever its scheme', () => {
    const url = trustedUrl('miapp:abrir');
    expect(isTrustedUrl(url)).toBe(true);
    expect(safeUrl('a', 'href', url)).toBe('miapp:abrir');
    expect(String(url)).toBe('miapp:abrir');
    expect(url.fudicTrustedUrl).toBe('miapp:abrir');
  });

  it('is told apart by the mark, not by the look', () => {
    expect(isTrustedUrl({ fudicTrustedUrl: 'miapp:abrir' })).toBe(false);
    expect(isTrustedUrl(null)).toBe(false);
    expect(isTrustedUrl('miapp:abrir')).toBe(false);
  });
});

describe('guardUrl — and the warning in development', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('says so when it replaces a value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(guardUrl('a', 'href', 'javascript:x')).toBe(INERT_URL);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('says nothing for a safe value, for the inert value itself, or outside development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(guardUrl('a', 'href', '/x')).toBe('/x');
    expect(guardUrl('a', 'href', INERT_URL)).toBe(INERT_URL);
    vi.stubEnv('DEV', false);
    expect(guardUrl('a', 'href', 'javascript:x')).toBe(INERT_URL);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is what the browser adapter writes', () => {
    const el = dom.element('a') as Element;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    dom.setUrl(el, 'href', 'javascript:x');
    expect(el.getAttribute('href')).toBe(INERT_URL);
    dom.setUrl(el, 'href', trustedUrl('miapp:abrir'));
    expect(el.getAttribute('href')).toBe('miapp:abrir');
  });
});
