/**
 * SDD-19 §3.2 / §6.15: options resolution — defaults, base normalization, and the
 * absolute-manifestUrl validation (FUD0365).
 */

import { describe, it, expect } from 'vitest';
import { resolveOptions } from '../src/options.js';
import { FUD_MANIFEST_URL_NOT_ABSOLUTE } from '../src/diagnostics.js';

describe('resolveOptions — defaults', () => {
  it('fills the defaults with base "/"', () => {
    const { options, diagnostics } = resolveOptions();
    expect(diagnostics).toEqual([]);
    expect(options).toEqual({
      routesDir: 'routes',
      base: '/',
      manifestUrl: '/fudic-routes.json',
      prerender: true,
      paramFallback: 'lazy',
      routes: {},
    });
  });

  it('normalizes a base without a trailing slash and derives the manifest url', () => {
    const { options } = resolveOptions({}, '/app');
    expect(options.base).toBe('/app/');
    expect(options.manifestUrl).toBe('/app/fudic-routes.json');
  });

  it('applies user overrides', () => {
    const { options } = resolveOptions({
      routesDir: 'pages',
      prerender: false,
      paramFallback: 'notFound',
      routes: { '/admin': { mode: 'exclude' } },
    });
    expect(options.routesDir).toBe('pages');
    expect(options.prerender).toBe(false);
    expect(options.paramFallback).toBe('notFound');
    expect(options.routes).toEqual({ '/admin': { mode: 'exclude' } });
  });
});

describe('resolveOptions — manifestUrl validation (FUD0365)', () => {
  it('accepts a root-absolute path', () => {
    expect(resolveOptions({ manifestUrl: '/m.json' }).diagnostics).toEqual([]);
  });

  it('accepts a full URL with a scheme', () => {
    expect(resolveOptions({ manifestUrl: 'https://cdn.test/m.json' }).diagnostics).toEqual([]);
  });

  it('rejects a relative manifestUrl', () => {
    const { diagnostics } = resolveOptions({ manifestUrl: 'fudic-routes.json' });
    expect(diagnostics.map((d) => d.code)).toEqual([FUD_MANIFEST_URL_NOT_ABSOLUTE]);
  });
});
