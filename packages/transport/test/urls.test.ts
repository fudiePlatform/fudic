/**
 * SDD-27 §5.4: the manifest carries names, not URLs, and this is the one place that turns
 * one into the other. What these tests pin is the arithmetic — the same arithmetic the
 * build uses to NAME the files, which is why `safeName` lives next to it.
 */

import { describe, it, expect } from 'vitest';
import { createUrlResolver, DATA_PREFIX, LINK_DIR, CLIENT_DIR } from '../src/urls.js';
import { safeName, type RouteRecord } from '../src/manifest.js';

const BUILD = '605477d3';

const record = (over: Partial<RouteRecord> = {}): RouteRecord => ({
  pattern: '/blog/:slug',
  mode: 'sw',
  deps: ['app-badge', 'site-nav'],
  ...over,
});

describe('safeName', () => {
  it('turns a pattern into a filesystem-safe base name', () => {
    expect(safeName('/blog/:slug')).toBe('blog-slug');
    expect(safeName('/about')).toBe('about');
    expect(safeName('/blog')).toBe('blog');
  });

  it('names the root `index`, because the empty string is not a file name', () => {
    expect(safeName('/')).toBe('index');
    expect(safeName('')).toBe('index');
    expect(safeName('///')).toBe('index');
  });
});

describe('createUrlResolver', () => {
  const urls = createUrlResolver('/', BUILD);

  it('derives the render chunk from the pattern and the build id', () => {
    expect(urls.renderUrl(record())).toBe(`/${LINK_DIR}/blog-slug-${BUILD}.js`);
    expect(urls.renderUrl(record({ pattern: '/' }))).toBe(`/${LINK_DIR}/index-${BUILD}.js`);
  });

  it('returns null for a route the Service Worker cannot render', () => {
    // No `deps` is not "no components": it is "only the server serves this one". An
    // enumerated `ssg` route is exactly that, and its mode is NOT `ssr`.
    const enumerated: RouteRecord = { pattern: '/blog/:slug', mode: 'ssg' };
    expect(urls.renderUrl(enumerated)).toBeNull();
  });

  it('distinguishes an empty dependency list from an absent one', () => {
    expect(urls.renderUrl(record({ deps: [] }))).toBe(`/${LINK_DIR}/blog-slug-${BUILD}.js`);
  });

  it('derives a component render chunk and its hydration chunk from the same name', () => {
    expect(urls.depUrl('app-badge')).toBe(`/${LINK_DIR}/app-badge-${BUILD}.js`);
    expect(urls.hydrateUrl('app-badge')).toBe(`/${CLIENT_DIR}/app-badge-${BUILD}.js`);
  });

  it('derives the data endpoint with its `:param` placeholders intact', () => {
    // Unfilled on purpose: whoever holds the match fills them with `fillParams`.
    expect(urls.dataUrl('/blog/:slug')).toBe(`/${DATA_PREFIX}/blog/:slug`);
    expect(urls.dataUrl('/')).toBe(`/${DATA_PREFIX}/`);
  });

  it('applies a non-root base without doubling the slash', () => {
    const scoped = createUrlResolver('/app/', BUILD);
    expect(scoped.renderUrl(record())).toBe(`/app/${LINK_DIR}/blog-slug-${BUILD}.js`);
    expect(scoped.depUrl('site-nav')).toBe(`/app/${LINK_DIR}/site-nav-${BUILD}.js`);
    expect(scoped.hydrateUrl('site-nav')).toBe(`/app/${CLIENT_DIR}/site-nav-${BUILD}.js`);
    expect(scoped.dataUrl('/blog')).toBe(`/app/${DATA_PREFIX}/blog`);
  });

  it('moves every URL when the build id moves', () => {
    const next = createUrlResolver('/', 'deadbeef');
    expect(next.depUrl('app-badge')).toBe(`/${LINK_DIR}/app-badge-deadbeef.js`);
    expect(next.hydrateUrl('app-badge')).toBe(`/${CLIENT_DIR}/app-badge-deadbeef.js`);
  });
});
