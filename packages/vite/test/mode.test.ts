/**
 * SDD-20 §6.21–§6.23: mode resolution. One authority — the page — with the filesystem
 * facts as the default when it declares nothing.
 */

import { describe, it, expect } from 'vitest';
import { resolveMode, type PageFacts } from '../src/mode.js';
import { NO_STRATEGY, type StrategyDecl } from '../src/strategy.js';
import { FUD_SSG_WITHOUT_PATHS, FUD_STRATEGY_AND_DEFAULT } from '../src/diagnostics.js';

function facts(over: Partial<PageFacts> = {}): PageFacts {
  return { hasLoad: false, hasPaths: false, strategy: NO_STRATEGY, ...over };
}

function declared(strategy: StrategyDecl): PageFacts['strategy'] {
  return { declared: true, strategy, diagnostics: [] };
}

describe('resolveMode — the defaults (§4.8.3)', () => {
  it('no params, no load → ssg, prerendered', () => {
    expect(resolveMode(false, facts(), 'lazy').decision).toEqual({
      mode: 'ssg',
      prerender: true,
      enumerate: false,
      prerenderedHtml: true,
    });
  });

  it('no params but load present → sw (the data is not build-known)', () => {
    expect(resolveMode(false, facts({ hasLoad: true }), 'lazy').decision).toEqual({
      mode: 'sw',
      prerender: false,
      enumerate: false,
      prerenderedHtml: false,
    });
  });

  it('params without paths() → sw, nothing to enumerate', () => {
    expect(resolveMode(true, facts({ hasLoad: true }), 'lazy').decision.mode).toBe('sw');
  });

  it('params + paths() + lazy → prerender the enumerated ids AND render unknown ones', () => {
    expect(resolveMode(true, facts({ hasLoad: true, hasPaths: true }), 'lazy').decision).toEqual({
      mode: 'sw',
      prerender: true,
      enumerate: true,
      prerenderedHtml: true,
    });
  });

  it('params + paths() + notFound → pure ssg: an unknown id is a 404', () => {
    expect(resolveMode(true, facts({ hasLoad: true, hasPaths: true }), 'notFound').decision).toEqual({
      mode: 'ssg',
      prerender: true,
      enumerate: true,
      prerenderedHtml: true,
    });
  });

  it('never infers ssr: it has to be declared', () => {
    expect(resolveMode(false, facts({ hasLoad: true }), 'lazy').decision.mode).not.toBe('ssr');
  });
});

describe('resolveMode — the page is the authority (§4.8.2)', () => {
  it('a declared mode wins over the inference', () => {
    const result = resolveMode(false, facts({ strategy: declared({ mode: 'ssr' }) }), 'lazy');
    expect(result.decision).toEqual({
      mode: 'ssr',
      prerender: false,
      enumerate: false,
      prerenderedHtml: false,
    });
  });

  it('a declared sw route is not prerendered even when it could be', () => {
    const result = resolveMode(
      true,
      facts({ hasPaths: true, strategy: declared({ mode: 'sw' }) }),
      'lazy',
    );
    expect(result.decision.prerender).toBe(false);
  });

  it('a declared ssg param route without paths() falls back to sw with FUD0398', () => {
    const result = resolveMode(true, facts({ strategy: declared({ mode: 'ssg' }) }), 'lazy');
    expect(result.decision.mode).toBe('sw');
    expect(result.diagnostics[0]?.code).toBe(FUD_SSG_WITHOUT_PATHS);
  });

  it('a config default only fills in for a page that declares nothing', () => {
    expect(resolveMode(false, facts({ fallback: 'ssr' }), 'lazy').decision.mode).toBe('ssr');
    const both = resolveMode(
      false,
      facts({ fallback: 'ssr', strategy: declared({ mode: 'ssg' }) }),
      'lazy',
    );
    expect(both.decision.mode).toBe('ssg'); // the page wins
    expect(both.diagnostics[0]?.code).toBe(FUD_STRATEGY_AND_DEFAULT);
  });

  it('exclude drops the route entirely', () => {
    expect(resolveMode(false, facts({ fallback: 'exclude' }), 'lazy').decision.mode).toBe('excluded');
  });
});
