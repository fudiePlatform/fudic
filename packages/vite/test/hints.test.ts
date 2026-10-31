/**
 * SDD-70 §3.10 — the early hints of a route as `Link` values (`src/hints.ts`).
 */

import { describe, expect, it } from 'vitest';
import { linkValue, routeHints } from '../src/hints.js';

describe('linkValue', () => {
  it('a sheet carries `as=style`, a module does not', () => {
    expect(linkValue({ href: '/assets/a.css', rel: 'preload', as: 'style' })).toBe('</assets/a.css>; rel=preload; as=style');
    expect(linkValue({ href: '/m.js', rel: 'modulepreload' })).toBe('</m.js>; rel=modulepreload');
  });
});

describe('routeHints', () => {
  it('sheets first, then modules; an empty entry is skipped and a repeated one hinted once', () => {
    expect(
      routeHints(
        [{ href: '/assets/a.css', rel: 'preload', as: 'style' }],
        ['', '/main.js', '/_fudic/core/hydrate.js', '/main.js'],
      ),
    ).toEqual([
      '</assets/a.css>; rel=preload; as=style',
      '</main.js>; rel=modulepreload',
      '</_fudic/core/hydrate.js>; rel=modulepreload',
    ]);
  });

  it('nothing to hint is an empty list', () => {
    expect(routeHints([], ['', ''])).toEqual([]);
  });
});
