import { describe, expect, it } from 'vitest';

import * as conventions from '../src/index.js';

describe('@fudic/conventions', () => {
  it('names the four project directories', () => {
    expect(conventions.SRC_DIR).toBe('src');
    expect(conventions.ROUTES_DIR).toBe('src/routes');
    expect(conventions.COMPONENTS_DIR).toBe('src/components');
    expect(conventions.LAYOUTS_DIR).toBe('src/layouts');
  });

  it('names the runtime directory, outside every app base', () => {
    // The leading `_` is the whole guarantee: no application route can collide with it
    // (SDD-45 §3.1).
    expect(conventions.RUNTIME_DIR).toBe('_fudic');
    expect(conventions.RUNTIME_DIR.startsWith('_')).toBe(true);
  });

  describe('runtimeCacheName', () => {
    it('names the cache by framework version', () => {
      expect(conventions.runtimeCacheName('0.0.1')).toBe('fudic-runtime-0.0.1');
    });

    it('carries no app segment, so two apps of an origin share it', () => {
      // The one deliberate exception to BUG-33 (SDD-45 §4.8). Two applications on the same
      // origin and the same framework version must reach the SAME name, or the cache they
      // are meant to share is two caches.
      expect(conventions.runtimeCacheName('0.0.1')).toBe(conventions.runtimeCacheName('0.0.1'));
      expect(conventions.runtimeCacheName('0.0.1')).not.toBe(conventions.runtimeCacheName('2.0.0'));
    });
  });

  it('names one marker per application, inside the runtime directory', () => {
    // Inside `_fudic/` on purpose: the one prefix no application route can collide with, so
    // a marker can never be mistaken for a page someone deployed.
    expect(conventions.runtimeMarkerUrl('shop')).toBe('/_fudic/marker/shop');
    expect(conventions.runtimeMarkerUrl('shop-admin')).not.toBe(conventions.runtimeMarkerUrl('shop'));
  });

  it('exports those eight names and nothing else', () => {
    // The door stays shut (BUG-20 §3.4). A ninth export is not a smaller change than a
    // second package: it is how a convention package turns into a drawer of shared strings,
    // so growing the surface has to be a deliberate edit to this list.
    //
    // `RUNTIME_CACHE_PREFIX` is the eighth, and it is the deliberate edit SDD-45 §4.9 asked
    // for: the sweep walks the origin looking for OTHER versions of the runtime cache, and
    // the family name cannot be sliced back off one — a prerelease has hyphens of its own.
    expect(Object.keys(conventions).sort()).toEqual([
      'COMPONENTS_DIR',
      'LAYOUTS_DIR',
      'ROUTES_DIR',
      'RUNTIME_CACHE_PREFIX',
      'RUNTIME_DIR',
      'SRC_DIR',
      'runtimeCacheName',
      'runtimeMarkerUrl',
    ]);
  });
});
