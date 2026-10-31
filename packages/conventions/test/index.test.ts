import { describe, expect, it } from 'vitest';

import * as conventions from '../src/index.js';

describe('@fudic/conventions', () => {
  it('names the project directories', () => {
    expect(conventions.SRC_DIR).toBe('src');
    expect(conventions.ROUTES_DIR).toBe('src/routes');
    expect(conventions.COMPONENTS_DIR).toBe('src/components');
    expect(conventions.LAYOUTS_DIR).toBe('src/layouts');
    expect(conventions.LOCALES_DIR).toBe('src/locales');
  });

  it('holds 8 KB of a page stream when the route says nothing (SDD-70 §3.9)', () => {
    expect(conventions.STREAM_BUFFER).toBe(8192);
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

  it('names the server-function and error-page prefixes, inside the runtime directory', () => {
    // SDD-56 §4.1 and §4.8: both sides derive these URLs, so they live here once.
    expect(conventions.FN_PREFIX).toBe('/_fudic/fn');
    // The data endpoint's, which vite and transport each kept a copy of until then.
    expect(conventions.DATA_PREFIX).toBe('/_fudic/data');
    // And what it answers with (SDD-70 §3.7).
    expect(conventions.DATA_FRAMES_TYPE).toBe('application/fud+frames');
    expect(conventions.ERROR_PREFIX).toBe('/_fudic/error');
  });

  it('names the file of the global chain', () => {
    // SDD-60 §3.5: its `chain` is the outermost level of every function's chain.
    expect(conventions.HTTP_FILE).toBe('src/http.fudapi');
    expect(conventions.SERVER_DIR).toBe('src/server');
    expect(conventions.BROWSER_DIR).toBe('src/browser');
  });

  it('names the error page', () => {
    // SDD-56 §3.6: a file of `src/routes/` with no URL of its own.
    expect(conventions.ERROR_FILE).toBe('_error.fud');
  });

  it('names the invalidation message the page posts to its Service Worker', () => {
    // SDD-56 §4.9: the stub posts it and the worker answers it; one string for both ends.
    expect(conventions.INVALIDATE_MESSAGE).toBe('fudic:invalidate');
  });

  it('exports those names and nothing else', () => {
    // The door stays shut (BUG-20 §3.4). A ninth export is not a smaller change than a
    // second package: it is how a convention package turns into a drawer of shared strings,
    // so growing the surface has to be a deliberate edit to this list.
    //
    // `RUNTIME_CACHE_PREFIX` is the eighth, and it is the deliberate edit SDD-45 §4.9 asked
    // for: the sweep walks the origin looking for OTHER versions of the runtime cache, and
    // the family name cannot be sliced back off one — a prerelease has hyphens of its own.
    //
    // `FN_PREFIX` and `ERROR_PREFIX` are SDD-56's (§4.1, §4.8): the client stub, the dev
    // server and the Service Worker all derive the same URLs from them. `INVALIDATE_MESSAGE`
    // is the one the stub and the Service Worker share (§4.9). `ERROR_FILE` is `_error.fud`,
    // which the plugin routes around and the editor gives the problem's `data` (§3.6, §4.16).
    //
    // `DATA_STALE_EVENT` and `coversPath` are SDD-68's (§3.3, §4.8): the stub tells the page
    // its data is stale with the first, and decides that it is with the second — the same
    // comparison the Service Worker forgets by.
    //
    // `STREAM_BUFFER` is SDD-70's (§3.9): `@fudic/ssr` coalesces up to it and the build writes it into
    // the manifest every other backend streams with.
    expect(Object.keys(conventions).sort()).toEqual([
      'API_DIR',
      'API_TYPES_DIR',
      'BROWSER_DIR',
      'COMPONENTS_DIR',
      'DATA_FRAMES_TYPE',
      'DATA_PREFIX',
      'DATA_STALE_EVENT',
      'ERROR_FILE',
      'ERROR_PREFIX',
      'FN_PREFIX',
      'HTTP_FILE',
      'INVALIDATE_MESSAGE',
      'LAYOUTS_DIR',
      'LOCALES_DIR',
      'ROUTES_DIR',
      'RUNTIME_CACHE_PREFIX',
      'RUNTIME_DIR',
      'SERVER_DIR',
      'SRC_DIR',
      'STREAM_BUFFER',
      'coversPath',
      'runtimeCacheName',
      'runtimeMarkerUrl',
    ]);
  });
});
