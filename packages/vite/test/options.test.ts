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
      // BUG-20 §6.9: the same constant the CLI writes with, spelled out here — a test that
      // imports the constant cannot tell a right default from a wrong one.
      routesDir: 'src/routes',
      base: '/',
      manifestUrl: '/fudic-routes.json',
      prerender: true,
      paramFallback: 'lazy',
      defaults: {},
    });
  });

  it('normalizes a base without a trailing slash and derives the manifest url', () => {
    const { options } = resolveOptions({}, '/app');
    expect(options.base).toBe('/app/');
    expect(options.manifestUrl).toBe('/app/fudic-routes.json');
  });

  it('lets an explicit routesDir win, including the old convention (§6.9)', () => {
    // The escape hatch of §4.6: a project that keeps `routes/` at the root says so once.
    expect(resolveOptions({ routesDir: 'routes' }).options.routesDir).toBe('routes');
  });

  it('applies user overrides', () => {
    const { options } = resolveOptions({
      routesDir: 'pages',
      prerender: false,
      paramFallback: 'notFound',
      defaults: { '/admin': { mode: 'exclude' } },
    });
    expect(options.routesDir).toBe('pages');
    expect(options.prerender).toBe(false);
    expect(options.paramFallback).toBe('notFound');
    expect(options.defaults).toEqual({ '/admin': { mode: 'exclude' } });
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
