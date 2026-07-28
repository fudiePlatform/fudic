/**
 * Unit coverage of the dev URL/manifest helpers (SDD-20 §4.11): in dev every route is
 * served by the edge, so the manifest declares them `ssr` and nothing is prerendered on
 * every save.
 */

import { describe, it, expect } from 'vitest';
import { devManifest, devModuleUrl, devUrl } from '../src/dev.js';
import { type RouteBuild } from '../src/discover.js';

const build = (pattern: string, mode: 'sw' | 'excluded'): RouteBuild =>
  ({
    route: { file: '', pattern, params: [] },
    absPath: '',
    analysis: { isPage: true, hasLoad: false, hasPaths: false },
    decision: { mode, prerender: false, enumerate: false, prerenderedHtml: false },
  }) as unknown as RouteBuild;

describe('devManifest', () => {
  it('lists non-excluded routes as ssr, skipping excluded ones', () => {
    const manifest = devManifest([build('/a', 'sw'), build('/x', 'excluded')]);
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0]).toEqual({ pattern: '/a', mode: 'ssr' });
    expect(manifest.csp.sw).toContain('unsafe-eval');
  });
});

describe('devUrl / devModuleUrl', () => {
  it('joins base and name, collapsing a double slash', () => {
    expect(devUrl('/', 'fudic-sw.js')).toBe('/fudic-sw.js');
    expect(devUrl('/app/', 'fudic-sw.js')).toBe('/app/fudic-sw.js');
  });

  it('maps a \\0-virtual id to its /@id/__x00__ dev URL', () => {
    expect(devModuleUrl('/', '\0fudic-sw')).toBe('/@id/__x00__fudic-sw');
  });
});
