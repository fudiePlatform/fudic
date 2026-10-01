/**
 * SDD-19 §4.1/§4.2/§6.4: route discovery over the real fixtures. Only the page is a
 * route (the components under the dir are skipped), and a default for a missing
 * route is flagged (FUD0364).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';

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
    expect(diagnostics.map((d) => d.code)).toContain('FUD0364');
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

describe('discoverRoutes — what parsing the routes said (SDD-35 §1.1)', () => {
  it('keeps every parse diagnostic, naming the file it is about', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-discover-parse-'));
    mkdirSync(join(dir, 'routes'), { recursive: true });
    const broken = join(dir, 'routes', 'broken.fud');
    writeFileSync(broken, '<!DOCTYPE html>\n<html><head><title>x</title></head><body><p>hi</q></p></body></html>\n');
    writeFileSync(join(dir, 'routes', 'fine.fud'), '<!DOCTYPE html>\n<html><head><title>x</title></head><body></body></html>\n');
    const { routes, parse } = discoverRoutes(dir, resolveOptions({ routesDir: 'routes' }).options);
    // A route that does not parse is still a route: discovery reports, it does not drop.
    expect(routes.map((r) => r.route.pattern).sort()).toEqual(['/broken', '/fine']);
    expect(parse).toEqual([expect.objectContaining({ code: 'FUD0051', file: broken, severity: 'error' })]);
  });

  it('a project whose routes parse has nothing to say', () => {
    expect(discoverRoutes(root, resolveOptions({ routesDir: 'fixtures' }).options).parse).toEqual([]);
  });
});
