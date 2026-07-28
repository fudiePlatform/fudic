/**
 * SDD-20 §4.11: the dev/preview server is the edge. Unit coverage of the pieces that do
 * it — first-hit pattern matching, param extraction, the render context and the data
 * endpoint — without a dev server (dev.test.ts drives the real one).
 */

import { describe, it, expect } from 'vitest';
import {
  matchRouteBuild,
  paramsOf,
  edgeContext,
  drainStream,
  renderRouteHtml,
  loadRouteData,
  type RenderModule,
} from '../src/serve.js';
import { type RouteBuild } from '../src/discover.js';
import { NO_STRATEGY } from '../src/strategy.js';

const build = (pattern: string, params: string[] = [], mode = 'ssg'): RouteBuild =>
  ({
    route: { file: `${pattern}.fud`, pattern, params },
    absPath: `/root/routes${pattern}.fud`,
    analysis: { isPage: true, hasLoad: false, hasPaths: false, strategy: NO_STRATEGY },
    decision: { mode, prerender: mode === 'ssg', enumerate: false, prerenderedHtml: mode === 'ssg' },
  }) as RouteBuild;

// Ordered by descending specificity, as `discoverRoutes` returns them.
const builds = [build('/customer/new'), build('/customer/:id', ['id'], 'sw'), build('/')];

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
    expect(matchRouteBuild([build('/admin', [], 'excluded')], '/admin')).toBeNull();
  });
});

describe('paramsOf / edgeContext', () => {
  it('extracts and decodes the params a concrete path fills', () => {
    expect(paramsOf('/customer/:id', '/customer/42')).toEqual({ id: '42' });
    expect(paramsOf('/blog/:slug', '/blog/hello%20world')).toEqual({ slug: 'hello world' });
    expect(paramsOf('/about', '/about')).toEqual({});
  });

  it('builds the context the chunk receives', () => {
    const ctx = edgeContext('/customer/:id', '/customer/42', 'n0');
    expect(ctx.origin).toBe('edge');
    expect(ctx.params).toEqual({ id: '42' });
    expect(ctx.nonce).toBe('n0');
    expect(ctx.url.pathname).toBe('/customer/42');
  });
});

describe('drainStream / renderRouteHtml / loadRouteData', () => {
  const streamOf = (...pieces: string[]): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(controller) {
        for (const p of pieces) controller.enqueue(new TextEncoder().encode(p));
        controller.close();
      },
    });

  it('joins every chunk of the byte stream into one string', async () => {
    expect(await drainStream(streamOf('<!DOCTYPE html>', '<p>hola</p>'))).toBe(
      '<!DOCTYPE html><p>hola</p>',
    );
  });

  it('runs the same wrapper the Service Worker links, with the concrete context', async () => {
    const seen: Array<Record<string, string>> = [];
    const load = async (id: string): Promise<RenderModule> => {
      expect(id).toBe('\0fudic-wrapper:/customer/:id');
      return {
        render: (ctx) => {
          seen.push(ctx.params as Record<string, string>);
          return streamOf(`<h1 nonce="${ctx.nonce}">${ctx.url.pathname}</h1>`);
        },
      };
    };
    const html = await renderRouteHtml(
      load,
      '\0fudic-wrapper:/customer/:id',
      '/customer/:id',
      '/customer/42',
      'n1',
    );
    expect(html).toBe('<h1 nonce="n1">/customer/42</h1>');
    expect(seen).toEqual([{ id: '42' }]);
  });

  it('runs @server load for the data endpoint, and returns {} when there is none', async () => {
    const withData: RenderModule = {
      render: () => streamOf(''),
      data: async (ctx) => ({ id: (ctx.params as Record<string, string>)['id'] }),
    };
    expect(await loadRouteData(async () => withData, 'id', '/customer/:id', '/customer/7')).toEqual({
      id: '7',
    });
    const without: RenderModule = { render: () => streamOf('') };
    expect(await loadRouteData(async () => without, 'id', '/about', '/about')).toEqual({});
  });
});
