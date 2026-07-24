/**
 * SDD-19 acceptance criteria §6.1–§6.3: filesystem routing — path→pattern mapping,
 * specificity ordering, and collision detection.
 */

import { describe, it, expect } from 'vitest';
import { routesFromFiles } from '../src/routing.js';
import { FUD_MALFORMED_PARAM, FUD_ROUTE_COLLISION } from '../src/diagnostics.js';

/** Convenience: map file → pattern for the resolved routes. */
function patterns(files: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of routesFromFiles(files).routes) {
    out[r.file] = r.pattern;
  }
  return out;
}

describe('routing — path → pattern (crit. #1)', () => {
  it('maps index, nested index and param segments', () => {
    expect(patterns(['index.fud', 'customer/index.fud', 'customer/[id].fud', 'about.fud'])).toEqual({
      'index.fud': '/',
      'customer/index.fud': '/customer',
      'customer/[id].fud': '/customer/:id',
      'about.fud': '/about',
    });
  });

  it('handles nested params and multiple segments', () => {
    const { routes } = routesFromFiles(['blog/[year]/[slug].fud']);
    expect(routes[0]?.pattern).toBe('/blog/:year/:slug');
    expect(routes[0]?.params).toEqual(['year', 'slug']);
  });

  it('normalizes backslash separators', () => {
    expect(patterns(['customer\\[id].fud'])).toEqual({ 'customer\\[id].fud': '/customer/:id' });
  });
});

describe('routing — specificity order (crit. #2)', () => {
  it('lists a static route before a param route at the same depth', () => {
    const { routes } = routesFromFiles(['customer/[id].fud', 'customer/new.fud']);
    expect(routes.map((r) => r.pattern)).toEqual(['/customer/new', '/customer/:id']);
  });

  it('is deterministic regardless of input order', () => {
    const a = routesFromFiles(['customer/[id].fud', 'customer/new.fud', 'index.fud']);
    const b = routesFromFiles(['index.fud', 'customer/new.fud', 'customer/[id].fud']);
    expect(a.routes.map((r) => r.pattern)).toEqual(b.routes.map((r) => r.pattern));
  });
});

describe('routing — collisions and malformed params (crit. #3)', () => {
  it('reports two files that resolve to the same pattern', () => {
    const { routes, diagnostics } = routesFromFiles(['products/index.fud', 'products.fud']);
    // Both map to `/products`; only the first (sorted) survives.
    expect(routes.map((r) => r.pattern)).toEqual(['/products']);
    expect(diagnostics.map((d) => d.code)).toContain(FUD_ROUTE_COLLISION);
  });

  it('reports an empty param segment and drops it, without throwing', () => {
    const { diagnostics } = routesFromFiles(['x/[].fud']);
    expect(diagnostics.map((d) => d.code)).toContain(FUD_MALFORMED_PARAM);
  });

  it('reports a duplicated param name in one path', () => {
    const { diagnostics } = routesFromFiles(['[id]/[id].fud']);
    expect(diagnostics.filter((d) => d.code === FUD_MALFORMED_PARAM)).toHaveLength(1);
  });

  it('ignores non-.fud files', () => {
    const { routes } = routesFromFiles(['index.fud', 'readme.md', 'styles.css']);
    expect(routes.map((r) => r.pattern)).toEqual(['/']);
  });
});
