/**
 * `coversPath` — the one comparison the Service Worker and the stub must agree on (SDD-68 §4.8):
 * whether a path a call invalidated covers the page the browser is on.
 */

import { describe, expect, it } from 'vitest';
import { coversPath, DATA_STALE_EVENT } from '../src/index.js';

describe('coversPath', () => {
  it('a concrete path covers exactly itself', () => {
    expect(coversPath('/usuarios', '/usuarios')).toBe(true);
    expect(coversPath('/usuarios', '/usuarios/1')).toBe(false);
    expect(coversPath('/usuarios', '/')).toBe(false);
  });

  it('a colon that is not a parameter is compared as text', () => {
    // No `/:` in it: it is not a pattern, however it looks.
    expect(coversPath('/a:b', '/a:b')).toBe(true);
    expect(coversPath('/a:b', '/ax')).toBe(false);
  });

  it('a parameter matches any non-empty segment', () => {
    expect(coversPath('/blog/:slug', '/blog/hola')).toBe(true);
    expect(coversPath('/blog/:slug', '/blog/')).toBe(false);
  });

  it('the literal segments of a pattern must match', () => {
    expect(coversPath('/blog/:slug', '/news/hola')).toBe(false);
    expect(coversPath('/u/:id/edit', '/u/7/edit')).toBe(true);
    expect(coversPath('/u/:id/edit', '/u/7/view')).toBe(false);
  });

  it('a pattern never covers a path of another length', () => {
    expect(coversPath('/blog/:slug', '/blog')).toBe(false);
    expect(coversPath('/blog/:slug', '/blog/a/b')).toBe(false);
  });
});

describe('DATA_STALE_EVENT', () => {
  it('is namespaced like the other messages of the framework', () => {
    expect(DATA_STALE_EVENT).toBe('fudic:data-stale');
  });
});
