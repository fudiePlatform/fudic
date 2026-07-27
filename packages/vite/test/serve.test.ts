/**
 * SDD-19 §4.10: the dev server renders a route on demand. Unit coverage of the pieces
 * that do it — first-hit pattern matching over the discovered routes, and running a
 * wrapper module through an injected loader — without a dev server (dev.test.ts drives
 * the real one).
 */

import { describe, it, expect } from 'vitest';
import { matchRouteBuild, drainStream, renderRouteHtml } from '../src/serve.js';
import { type RouteBuild } from '../src/discover.js';

const build = (pattern: string, params: string[] = [], mode = 'static'): RouteBuild =>
  ({
    route: { file: `${pattern}.fud`, pattern, params },
    absPath: `/root/routes${pattern}.fud`,
    analysis: { isPage: true, hasLoad: false, hasPaths: false },
    decision: { mode, prerender: mode === 'static', enumerate: false, dynamic: mode !== 'static' },
  }) as RouteBuild;

// Ordered by descending specificity, as `discoverRoutes` returns them.
const builds = [build('/customer/new'), build('/customer/:id', ['id'], 'incremental'), build('/')];

describe('matchRouteBuild', () => {
  it('matches a static route exactly', () => {
    expect(matchRouteBuild(builds, '/customer/new')?.route.pattern).toBe('/customer/new');
    expect(matchRouteBuild(builds, '/')?.route.pattern).toBe('/');
  });

  it('matches a param route and prefers the more specific static one (first hit)', () => {
    expect(matchRouteBuild(builds, '/customer/42')?.route.pattern).toBe('/customer/:id');
    expect(matchRouteBuild(builds, '/customer/new')?.route.pattern).toBe('/customer/new');
  });

  it('ignores the query string and trailing/duplicate slashes', () => {
    expect(matchRouteBuild(builds, '/customer/42?tab=1')?.route.pattern).toBe('/customer/:id');
    expect(matchRouteBuild(builds, '/customer/42/')?.route.pattern).toBe('/customer/:id');
  });

  it('returns null for an unknown path and for a different segment count', () => {
    expect(matchRouteBuild(builds, '/nope')).toBeNull();
    expect(matchRouteBuild(builds, '/customer/42/edit')).toBeNull();
  });

  it('skips an excluded route', () => {
    const excluded = [build('/admin', [], 'excluded')];
    expect(matchRouteBuild(excluded, '/admin')).toBeNull();
  });
});

describe('drainStream / renderRouteHtml', () => {
  const streamOf = (...pieces: string[]): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(controller) {
        for (const p of pieces) controller.enqueue(new TextEncoder().encode(p));
        controller.close();
      },
    });

  it('joins every chunk of the byte stream into one string', async () => {
    expect(await drainStream(streamOf('<!DOCTYPE html>', '<p>hola</p>'))).toBe('<!DOCTYPE html><p>hola</p>');
  });

  it('runs the wrapper module the Web Worker would run, with the concrete route', async () => {
    const seen: string[] = [];
    const load = async (id: string): Promise<{ default: (route: string) => ReadableStream<Uint8Array> }> => {
      expect(id).toBe('\0fudic-wrapper:/customer/:id');
      return {
        default: (route: string) => {
          seen.push(route);
          return streamOf(`<h1>${route}</h1>`);
        },
      };
    };
    const html = await renderRouteHtml(load, '\0fudic-wrapper:/customer/:id', '/customer/42');
    expect(html).toBe('<h1>/customer/42</h1>');
    expect(seen).toEqual(['/customer/42']); // the RAW route, params extracted inside the chunk
  });
});
