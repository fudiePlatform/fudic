/**
 * SDD-19 §6.4–§6.7: SSG mode resolution — the escalera that decides static (mode 1)
 * vs incremental (mode 2), default-safe to incremental.
 */

import { describe, it, expect } from 'vitest';
import { resolveMode } from '../src/mode.js';

describe('resolveMode — inference', () => {
  it('static inferred: no params, no load → prerender, dynamic:false (crit. #4)', () => {
    expect(resolveMode(false, { hasLoad: false, hasPaths: false }, 'lazy')).toEqual({
      mode: 'static',
      prerender: true,
      enumerate: false,
      dynamic: false,
    });
  });

  it('incremental inferred: params, no paths() → dynamic:true, no prerender (crit. #5)', () => {
    expect(resolveMode(true, { hasLoad: true, hasPaths: false }, 'lazy')).toEqual({
      mode: 'incremental',
      prerender: false,
      enumerate: false,
      dynamic: true,
    });
  });

  it('paths() warm: params + paths + lazy → prerender+enumerate and a dynamic entry (crit. #6)', () => {
    expect(resolveMode(true, { hasLoad: true, hasPaths: true }, 'lazy')).toEqual({
      mode: 'static',
      prerender: true,
      enumerate: true,
      dynamic: true,
    });
  });

  it('paths() with notFound fallback: no dynamic entry for unknown ids (crit. #6)', () => {
    expect(resolveMode(true, { hasLoad: true, hasPaths: true }, 'notFound')).toEqual({
      mode: 'static',
      prerender: true,
      enumerate: true,
      dynamic: false,
    });
  });

  it('default-safe: no params but load present → incremental (crit. #7)', () => {
    expect(resolveMode(false, { hasLoad: true, hasPaths: false }, 'lazy')).toEqual({
      mode: 'incremental',
      prerender: false,
      enumerate: false,
      dynamic: true,
    });
  });
});

describe('resolveMode — overrides', () => {
  it('exclude wins over inference', () => {
    expect(resolveMode(false, { hasLoad: false, hasPaths: false, override: 'exclude' }, 'lazy').mode).toBe(
      'excluded',
    );
  });

  it('forced incremental on an otherwise-static route', () => {
    expect(resolveMode(false, { hasLoad: false, hasPaths: false, override: 'incremental' }, 'lazy')).toEqual({
      mode: 'incremental',
      prerender: false,
      enumerate: false,
      dynamic: true,
    });
  });

  it('forced static on a non-param route prerenders a single file', () => {
    expect(resolveMode(false, { hasLoad: true, hasPaths: false, override: 'static' }, 'lazy')).toEqual({
      mode: 'static',
      prerender: true,
      enumerate: false,
      dynamic: false,
    });
  });

  it('forced static on a param route without paths() prerenders nothing (no enumeration)', () => {
    expect(resolveMode(true, { hasLoad: true, hasPaths: false, override: 'static' }, 'lazy')).toEqual({
      mode: 'static',
      prerender: false,
      enumerate: false,
      dynamic: false,
    });
  });
});
