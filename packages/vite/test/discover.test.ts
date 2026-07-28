/**
 * SDD-19 §4.1/§4.2/§6.4: route discovery over the real fixtures. Only the page is a
 * route (the components under the dir are skipped), and a default for a missing
 * route is flagged (FUD0364).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';
import { FUD_UNKNOWN_ROUTE_OVERRIDE } from '../src/diagnostics.js';

// The compiler fixtures (home.fud + its component siblings) act as a routes dir.
const root = fileURLToPath(new URL('../../compiler', import.meta.url));

describe('discoverRoutes', () => {
  it('keeps only the page as a route; components are skipped', () => {
    const { routes } = discoverRoutes(root, resolveOptions({ routesDir: 'fixtures' }).options);
    expect(routes.map((r) => r.route.pattern)).toEqual(['/home']);
    expect(routes[0]?.analysis.isPage).toBe(true);
  });

  it('flags a route default that matches no route (FUD0364)', () => {
    const { diagnostics } = discoverRoutes(
      root,
      resolveOptions({ routesDir: 'fixtures', defaults: { '/nope': { mode: 'exclude' } } }).options,
    );
    expect(diagnostics.map((d) => d.code)).toContain(FUD_UNKNOWN_ROUTE_OVERRIDE);
  });

  it('returns no routes when the dir is absent', () => {
    const { routes } = discoverRoutes(root, resolveOptions({ routesDir: 'no-such-dir' }).options);
    expect(routes).toEqual([]);
  });

  it('applies a matching route default to the mode decision', () => {
    const { routes } = discoverRoutes(
      root,
      resolveOptions({ routesDir: 'fixtures', defaults: { '/home': { mode: 'sw' } } }).options,
    );
    expect(routes[0]?.decision.mode).toBe('sw');
  });

  it('marks an excluded route as excluded', () => {
    const { routes } = discoverRoutes(
      root,
      resolveOptions({ routesDir: 'fixtures', defaults: { '/home': { mode: 'exclude' } } }).options,
    );
    expect(routes[0]?.decision.mode).toBe('excluded');
  });
});
