/**
 * SDD-20 §4.2: manifest assembly — mode, linkable chunk, topological deps, the
 * generated data endpoint and the prerendered HTML template.
 */

import { describe, it, expect } from 'vitest';
import { buildManifest, type ManifestInputs } from '../src/manifest.js';
import { type RouteBuild } from '../src/discover.js';
import { type ModeDecision } from '../src/mode.js';
import { NO_STRATEGY, type StrategyAnalysis } from '../src/strategy.js';
import { FUD_TWO_TTLS } from '../src/diagnostics.js';

function routeBuild(
  pattern: string,
  decision: Partial<ModeDecision> & Pick<ModeDecision, 'mode'>,
  over: { hasLoad?: boolean; strategy?: StrategyAnalysis } = {},
): RouteBuild {
  return {
    route: { file: `${pattern}.fud`, pattern, params: pattern.includes(':') ? ['id'] : [] },
    absPath: `/abs${pattern}.fud`,
    analysis: {
      role: 'page' as const,
      isPage: true,
      hasLoad: over.hasLoad ?? false,
      hasPaths: false,
      strategy: over.strategy ?? NO_STRATEGY,
    },
    decision: { prerender: false, enumerate: false, prerenderedHtml: false, ...decision },
  };
}

const INPUTS: ManifestInputs = {
  build: 'b1',
  base: '/',
  serviceWorker: true,
  linkChunkOf: (rb) => `/sw/c${rb.route.pattern}.js`,
  depsOf: () => ['/sw/c/dep.js'],
  esmOf: (rb) => `/assets/c${rb.route.pattern}.js`,
};

describe('buildManifest', () => {
  it('emits one record per non-excluded route, preserving specificity order', () => {
    const { file } = buildManifest(
      [
        routeBuild('/about', { mode: 'ssg', prerenderedHtml: true }),
        routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true }),
        routeBuild('/admin', { mode: 'excluded' }),
      ],
      INPUTS,
    );
    expect(file.build).toBe('b1');
    expect(file.csp.document).toContain('{nonce}');
    expect(file.routes.map((r) => r.pattern)).toEqual(['/about', '/blog/:slug']);
  });

  it('a sw route carries its chunk, its topological deps and the generated data endpoint', () => {
    const { file } = buildManifest([routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true })], INPUTS);
    expect(file.routes[0]).toEqual({
      pattern: '/blog/:slug',
      mode: 'sw',
      chunk: '/sw/c/blog/:slug.js',
      deps: ['/sw/c/dep.js'],
      data: '/_fudic/data/blog/:slug',
      dataPolicy: { policy: 'cache-first', ttl: null },
      esm: '/assets/c/blog/:slug.js',
    });
  });

  it('a route without load gets no data endpoint', () => {
    const { file } = buildManifest([routeBuild('/now', { mode: 'sw' })], INPUTS);
    expect(file.routes[0]?.data).toBeUndefined();
  });

  it('an ssg route carries the URL of its prerendered HTML', () => {
    const { file } = buildManifest(
      [routeBuild('/about', { mode: 'ssg', prerender: true, prerenderedHtml: true })],
      INPUTS,
    );
    expect(file.routes[0]).toMatchObject({ mode: 'ssg', html: '/about/index.html' });
  });

  it('the data ttl comes from the declared strategy', () => {
    const strategy: StrategyAnalysis = {
      declared: true,
      strategy: { data: { ttl: '5m', policy: 'stale-while-revalidate' } },
      diagnostics: [],
    };
    const { file } = buildManifest(
      [routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true, strategy })],
      INPUTS,
    );
    expect(file.routes[0]?.dataPolicy).toEqual({ policy: 'stale-while-revalidate', ttl: 300_000 });
  });

  it('persist takes the data TTL, and a second one is reported (FUD0396)', () => {
    const strategy: StrategyAnalysis = {
      declared: true,
      strategy: { data: { ttl: '5m' }, page: { cache: 'persist', ttl: '1h' } },
      diagnostics: [],
    };
    const { file, diagnostics } = buildManifest(
      [routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true, strategy })],
      INPUTS,
    );
    expect(file.routes[0]?.page).toEqual({ cache: 'persist', ttl: 300_000 });
    expect(diagnostics[0]?.code).toBe(FUD_TWO_TTLS);
  });

  it('without a Service Worker a sw route degrades to ssr — the server renders it', () => {
    const { file } = buildManifest([routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true })], {
      ...INPUTS,
      serviceWorker: false,
    });
    expect(file.routes[0]).toMatchObject({ mode: 'ssr' });
    expect(file.routes[0]?.chunk).toBeUndefined();
  });

  it('is empty when every route is excluded', () => {
    expect(buildManifest([routeBuild('/x', { mode: 'excluded' })], INPUTS).file.routes).toEqual([]);
  });
});
