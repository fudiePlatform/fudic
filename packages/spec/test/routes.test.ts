/**
 * The pages a `page` header and a flow's URLs name, read off the routes folder (SDD-82 §3.1).
 */

import { describe, expect, it } from 'vitest';
import { findRoute, matchesPattern, routeFiles } from '../src/index.js';
import { memoryFs } from './terms.js';

const R = '/ws/src/routes';
const fs = memoryFs({
  [`${R}/index.fud`]: '',
  [`${R}/usuarios.fud`]: '',
  [`${R}/usuarios.fudspec`]: '',
  [`${R}/usuarios.fixture.ts`]: '',
  [`${R}/usuarios/nuevo.fud`]: '',
  [`${R}/blog/index.fud`]: '',
  [`${R}/blog/[slug].fud`]: '',
  [`${R}/_error.fud`]: '',
  [`${R}/_partials/x.fud`]: '',
});

describe('routeFiles', () => {
  const routes = routeFiles(fs, R);

  it('finds every page, its route as on disk, its pattern and its params', () => {
    expect(routes.map((r) => [r.route, r.pattern, r.params, r.path.slice(R.length)])).toEqual([
      ['/blog/[slug]', '/blog/:slug', ['slug'], '/blog/[slug].fud'],
      ['/blog', '/blog', [], '/blog/index.fud'],
      ['/', '/', [], '/index.fud'],
      ['/usuarios/nuevo', '/usuarios/nuevo', [], '/usuarios/nuevo.fud'],
      ['/usuarios', '/usuarios', [], '/usuarios.fud'],
    ]);
  });

  it('leaves out what starts with `_`, files and folders', () => {
    expect(routes.some((r) => r.path.includes('_'))).toBe(false);
  });

  it('is empty without a routes folder', () => {
    expect(routeFiles(memoryFs({}), R)).toEqual([]);
  });
});

describe('findRoute', () => {
  const routes = routeFiles(fs, R);

  it.each([
    ['/usuarios', '/usuarios.fud'],
    ['/blog/[slug]', '/blog/[slug].fud'],
    ['/', '/index.fud'],
    ['/index', '/index.fud'],
    ['/blog', '/blog/index.fud'],
    ['/blog/index', '/blog/index.fud'],
  ])('%s is %s', (route, path) => {
    expect(findRoute(routes, route)?.path).toBe(`${R}${path}`);
  });

  it.each(['/nada', '/_error', '/blog/hola'])('%s is no page', (route) => {
    expect(findRoute(routes, route)).toBeUndefined();
  });
});

describe('matchesPattern', () => {
  it.each([
    ['/', '/', true],
    ['/usuarios', '/usuarios', true],
    ['/usuarios', '/usuarios?q=ana#top', true],
    ['/usuarios', '/usuarios/', true],
    ['/blog/:slug', '/blog/hola', true],
    ['/blog/:slug', '/blog', false],
    ['/blog/:slug', '/blog/a/b', false],
    ['/usuarios', '/otra', false],
    ['/', '/x', false],
  ])('%s and %s: %s', (pattern, url, matches) => {
    expect(matchesPattern(pattern, url)).toBe(matches);
  });
});
