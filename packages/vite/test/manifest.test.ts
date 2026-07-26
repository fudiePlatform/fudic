/**
 * SDD-19 §4.7: manifest assembly. Every non-excluded route becomes a `dynamic:true`
 * entry (Slice-1 incremental), preserving the specificity order the routes carry.
 */

import { describe, it, expect } from 'vitest';
import { buildManifest } from '../src/manifest.js';
import { type RouteBuild } from '../src/discover.js';
import { type RouteMode } from '../src/mode.js';

function routeBuild(pattern: string, mode: RouteMode): RouteBuild {
  return {
    route: { file: `${pattern}.fud`, pattern, params: [] },
    absPath: `/abs${pattern}.fud`,
    analysis: { isPage: true, hasLoad: false, hasPaths: false },
    decision: { mode, prerender: false, enumerate: false, dynamic: mode !== 'excluded' },
  };
}

describe('buildManifest', () => {
  it('emits a dynamic entry per non-excluded route, in order', () => {
    const routes = [
      routeBuild('/customer/new', 'static'),
      routeBuild('/customer/:id', 'incremental'),
      routeBuild('/admin', 'excluded'),
    ];
    expect(buildManifest(routes, (r) => `chunk${r.route.pattern}.js`)).toEqual([
      { pattern: '/customer/new', dynamic: true, chunk: 'chunk/customer/new.js' },
      { pattern: '/customer/:id', dynamic: true, chunk: 'chunk/customer/:id.js' },
    ]);
  });

  it('is empty when every route is excluded', () => {
    expect(buildManifest([routeBuild('/x', 'excluded')], () => 'x')).toEqual([]);
  });
});
