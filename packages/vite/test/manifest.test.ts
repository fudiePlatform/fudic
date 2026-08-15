/**
 * SDD-20 §4.2 + SDD-27 §5.4: manifest assembly — mode, topological dep NAMES, the
 * generated data endpoint and the prerendered HTML template.
 */

import { describe, it, expect } from 'vitest';
import { buildManifest, type ManifestInputs } from '../src/manifest.js';
import { type RouteBuild } from '../src/discover.js';
import { type ModeDecision } from '../src/mode.js';
import { NO_STRATEGY, type StrategyAnalysis } from '../src/strategy.js';
import { FUD_TTL_INVALID, FUD_TWO_TTLS } from '../src/diagnostics.js';

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
  depsOf: () => ['dep'],
};

describe('buildManifest — what a hydration chunk imports (SDD-17 §4.7)', () => {
  it('states it per tag, because a shared chunk keeps a content hash', () => {
    const { file } = buildManifest([routeBuild('/', { mode: 'ssg' })], {
      ...INPUTS,
      hydrateDeps: { 'app-counter': ['assets/element-DUSE73WP.js'] },
    });
    expect(file.hydrate).toEqual({ 'app-counter': ['assets/element-DUSE73WP.js'] });
  });

  it('says nothing when there is nothing to say', () => {
    // An empty object in the file would read as "asked and answered nothing"; the key is
    // absent instead, which is what the Service Worker's `?? []` already means.
    expect(buildManifest([routeBuild('/', { mode: 'ssg' })], INPUTS).file.hydrate).toBeUndefined();
    expect(
      buildManifest([routeBuild('/', { mode: 'ssg' })], { ...INPUTS, hydrateDeps: {} }).file.hydrate,
    ).toBeUndefined();
  });
});

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

  it('a sw route carries its topological dep NAMES and its data policy — no URLs', () => {
    const { file } = buildManifest([routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true })], INPUTS);
    expect(file.routes[0]).toEqual({
      pattern: '/blog/:slug',
      mode: 'sw',
      deps: ['dep'],
      dataPolicy: { policy: 'cache-first', ttl: null },
    });
    expect(file.base).toBe('/');
  });

  it('a route without load gets no data policy, which is what says it has no endpoint', () => {
    const { file } = buildManifest([routeBuild('/now', { mode: 'sw' })], INPUTS);
    expect(file.routes[0]?.dataPolicy).toBeUndefined();
    expect(file.routes[0]?.deps).toEqual(['dep']); // still renderable
  });

  it('BUG-02 §6.3 no record names an HTML file: the manifest is the client contract', () => {
    const { file } = buildManifest(
      [
        routeBuild('/about', { mode: 'ssg', prerender: true, prerenderedHtml: true }),
        routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true }),
        routeBuild('/account', { mode: 'ssr' }),
      ],
      INPUTS,
    );
    for (const record of file.routes) {
      expect(record).not.toHaveProperty('html');
    }
  });

  it('BUG-02 §6.4 an ssg route gets deps and — with load — its data policy', () => {
    const { file } = buildManifest(
      [routeBuild('/about', { mode: 'ssg', prerender: true, prerenderedHtml: true }, { hasLoad: true })],
      INPUTS,
    );
    expect(file.routes[0]).toMatchObject({
      pattern: '/about',
      mode: 'ssg',
      deps: ['dep'],
      dataPolicy: { policy: 'cache-first', ttl: null },
    });
  });

  it('an ENUMERATED ssg route gets no deps key: paramFallback "notFound" means 404', () => {
    // `lazy` makes an enumerated route `sw`; `ssg` + `enumerate` is exactly the
    // declaration that an id outside paths() must not be rendered locally. The SW does
    // not carry the enumeration, so the only way to honour that is to give it no chunk.
    const { file } = buildManifest(
      [routeBuild('/customer/:id', { mode: 'ssg', prerender: true, enumerate: true, prerenderedHtml: true })],
      INPUTS,
    );
    expect(file.routes[0]).toMatchObject({ pattern: '/customer/:id', mode: 'ssg' });
    expect(file.routes[0]?.deps).toBeUndefined();
  });

  it('BUG-02 a route whose chunk was not emitted keeps its record, without deps', () => {
    // FUD0399: only the server can serve it. The router asks for what it HAS, so an
    // absent `chunk` is a decision, not a crash.
    const { file } = buildManifest([routeBuild('/about', { mode: 'ssg', prerenderedHtml: true })], {
      ...INPUTS,
      depsOf: () => null,
    });
    expect(file.routes[0]).toMatchObject({ pattern: '/about', mode: 'ssg' });
    expect(file.routes[0]?.deps).toBeUndefined();
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

  it('an unparseable data ttl is reported (FUD0392) and the default policy stands', () => {
    const strategy: StrategyAnalysis = {
      declared: true,
      strategy: { data: { ttl: 'a fortnight' } },
      diagnostics: [],
    };
    const { file, diagnostics } = buildManifest(
      [routeBuild('/blog/:slug', { mode: 'sw' }, { hasLoad: true, strategy })],
      INPUTS,
    );
    expect(diagnostics[0]?.code).toBe(FUD_TTL_INVALID);
    // The route stays reachable: a bad TTL is a diagnostic, never a dropped record.
    expect(file.routes[0]?.dataPolicy).toEqual({ policy: 'cache-first', ttl: null });
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
    expect(file.routes[0]?.deps).toBeUndefined();
  });

  it('is empty when every route is excluded', () => {
    expect(buildManifest([routeBuild('/x', { mode: 'excluded' })], INPUTS).file.routes).toEqual([]);
  });
});
