/**
 * Unit coverage of the dev URL/manifest helpers (SDD-20 §4.11): in dev every route is
 * served by the edge, so the manifest declares them `ssr` and nothing is prerendered on
 * every save.
 */

import { describe, it, expect } from 'vitest';
import { devManifest, devModuleUrl, devUrl, withInlineSourceMap } from '../src/dev.js';
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

/**
 * BUG-36 — the dev middleware serves modules Vite's own never sees, so the piece that turns
 * a map into something a browser reads has to be here.
 */
describe('withInlineSourceMap', () => {
  const map = { version: 3, sources: ['a.fud'], sourcesContent: ['<p>a</p>'], mappings: 'AAAA' };

  it('appends the map as a base64 data URI the browser can read back', () => {
    const out = withInlineSourceMap('const a = 1;', map);
    const encoded = out.slice(out.indexOf('base64,') + 'base64,'.length).trim();
    expect(out).toContain('//# sourceMappingURL=data:application/json;base64,');
    expect(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))).toEqual(map);
    // The code is untouched and comes first: the comment is appended, not woven in.
    expect(out.startsWith('const a = 1;\n')).toBe(true);
  });

  it('leaves the code alone when there is no map to attach', () => {
    // What a generated module returns — `fudic-main.js` is written by the emit and maps back
    // to no source at all, so a comment here would point at nothing.
    expect(withInlineSourceMap('const a = 1;', null)).toBe('const a = 1;');
    expect(withInlineSourceMap('const a = 1;', undefined)).toBe('const a = 1;');
  });

  it('and when the map has no mappings, which describes nothing at a parse of cost', () => {
    expect(withInlineSourceMap('const a = 1;', { ...map, mappings: '' })).toBe('const a = 1;');
  });
});
