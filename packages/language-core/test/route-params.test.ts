/**
 * BUG-44 §3.1 — the params a route's `ctx.params` carries, read off its path.
 */

import { describe, expect, it } from 'vitest';
import { routeParams } from '../src/paths.js';

describe('routeParams', () => {
  it('reads one param off a route under `routes/`', () => {
    expect(routeParams('src/routes/blog/[slug].fud')).toEqual(['slug']);
  });

  it('reads several, directory and file alike, in path order', () => {
    expect(routeParams('app/routes/[lang]/blog/[id].fud')).toEqual(['lang', 'id']);
  });

  it('reads none off a route with no bracketed segment', () => {
    expect(routeParams('src/routes/about.fud')).toEqual([]);
  });

  it('reads a path with no `routes/` whole — a path relative to that directory', () => {
    expect(routeParams('blog/[slug].fud')).toEqual(['slug']);
  });

  it('ignores a bracketed directory above `routes/`', () => {
    expect(routeParams('[site]/routes/[slug].fud')).toEqual(['slug']);
  });

  it('counts only the one spelling the router reads as a param', () => {
    expect(routeParams('routes/[...rest].fud')).toEqual([]);
    expect(routeParams('routes/[1x].fud')).toEqual([]);
    expect(routeParams('routes/a[b].fud')).toEqual([]);
  });

  it('reads Windows separators the same', () => {
    expect(routeParams('C:\\app\\src\\routes\\blog\\[slug].fud')).toEqual(['slug']);
  });
});
