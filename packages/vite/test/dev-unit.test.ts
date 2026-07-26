/**
 * Unit coverage of the dev URL/manifest helpers (SDD-19 §4.10): the excluded-route skip,
 * the double-slash collapse, and the virtual-id → dev-URL mapping — the branches the live
 * dev-server test (dev.test.ts) does not reach.
 */

import { describe, it, expect } from 'vitest';
import { devManifest, devModuleUrl, devUrl } from '../src/dev.js';
import { type RouteBuild } from '../src/discover.js';

const build = (pattern: string, mode: 'incremental' | 'excluded'): RouteBuild =>
  ({
    route: { file: '', pattern, params: [] },
    absPath: '',
    analysis: { isPage: true, hasLoad: false, hasPaths: false },
    decision: { mode, prerender: false, enumerate: false, dynamic: true },
  }) as unknown as RouteBuild;

describe('devManifest', () => {
  it('lists non-excluded routes as incremental with dev chunk URLs, skipping excluded', () => {
    const manifest = devManifest([build('/a', 'incremental'), build('/x', 'excluded')], '/');
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ pattern: '/a', dynamic: true });
    expect(manifest[0]!.chunk).toContain('/@id/__x00__fudic-wrapper:/a');
  });
});

describe('devUrl / devModuleUrl', () => {
  it('joins base and name, collapsing a double slash', () => {
    expect(devUrl('/', 'fudic-sw.js')).toBe('/fudic-sw.js');
    expect(devUrl('/app/', 'fudic-sw.js')).toBe('/app/fudic-sw.js');
  });

  it('maps a \\0-virtual id to its /@id/__x00__ dev URL', () => {
    expect(devModuleUrl('/', '\0fudic-ww')).toBe('/@id/__x00__fudic-ww');
  });
});
