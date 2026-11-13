/** SDD-84 §3.7: the app's headers as the manifest carries them, and the rule of `assets.headers`. */

import { describe, expect, it } from 'vitest';
import {
  assetDecisionsFor,
  assetHeadersFor,
  fillPlaceholders,
  globMatches,
  orderAssetRules,
  pageHeadersFor,
  PLACEHOLDERS,
  wantsNonce,
  type ManifestHeaders,
} from '../src/headers.js';
import { LINKER_NEEDS } from '../src/linker.js';
import { HEADERS } from './helpers.js';

const NO_NONCE: ManifestHeaders = { ...HEADERS, page: { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } };

describe('placeholders', () => {
  it('has one today, the nonce', () => {
    expect(PLACEHOLDERS).toEqual(['nonce']);
  });

  it('fills every {nonce} and leaves the text alone without a value', () => {
    expect(fillPlaceholders("script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'", { nonce: 'abc' })).toBe(
      "script-src 'nonce-abc'; style-src 'nonce-abc'",
    );
    expect(fillPlaceholders("script-src 'nonce-{nonce}'", {})).toBe("script-src 'nonce-{nonce}'");
  });

  it('asks for a nonce only when some page value holds {nonce}', () => {
    expect(wantsNonce(HEADERS)).toBe(true);
    expect(wantsNonce(NO_NONCE)).toBe(false);
  });

  it('gives the page headers of one response, filled', () => {
    const headers = pageHeadersFor(HEADERS, { nonce: 'n1' });
    expect(headers.get('content-security-policy')).toContain("'nonce-n1'");
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(headers.get('strict-transport-security')).toContain('max-age=63072000');
  });
});

describe('assets.headers', () => {
  it('matches `*` inside a segment and `**` across them', () => {
    expect(globMatches('/assets/**', '/assets/a/b.png')).toBe(true);
    expect(globMatches('/fonts/*', '/fonts/a.woff2')).toBe(true);
    expect(globMatches('/fonts/*', '/fonts/a/b.woff2')).toBe(false);
    expect(globMatches('/**', '/favicon.ico')).toBe(true);
    expect(globMatches('/a.b', '/aXb')).toBe(false);
  });

  it('orders a path without wildcards first, then by literal characters, a tie in file order', () => {
    const rules = [{ pattern: '/**' }, { pattern: '/a/*' }, { pattern: '/b/*' }, { pattern: '/legacy.js' }, { pattern: '/assets/**' }];
    expect(orderAssetRules(rules).map((r) => r.pattern)).toEqual(['/legacy.js', '/assets/**', '/a/*', '/b/*', '/**']);
  });

  it('takes each header from the most specific rule that matches, by name in any case', () => {
    const headers: ManifestHeaders = {
      ...HEADERS,
      assets: orderAssetRules([
        { pattern: '/**', headers: { 'Cache-Control': 'no-cache', 'X-Frame': 'deny' } },
        { pattern: '/assets/**', headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        { pattern: '/legacy.js', headers: { 'Cache-Control': '' } },
      ]),
    };
    expect(assetHeadersFor(headers, '/assets/x-1a2b.js')).toEqual({ 'cache-control': 'public, max-age=31536000, immutable', 'X-Frame': 'deny' });
    expect(assetHeadersFor(headers, '/favicon.ico')).toEqual({ 'Cache-Control': 'no-cache', 'X-Frame': 'deny' });
    // An empty value sends nothing, and says so to whoever has to stop the host's own.
    expect(assetHeadersFor(headers, '/legacy.js')).toEqual({ 'X-Frame': 'deny' });
    expect(assetDecisionsFor(headers, '/legacy.js')).toEqual({ 'Cache-Control': '', 'X-Frame': 'deny' });
  });
});

describe('the linker', () => {
  it('declares that it evaluates text (SDD-84 §3.4)', () => {
    expect(LINKER_NEEDS).toEqual([{ loads: 'eval', piece: 'the Service Worker linker' }]);
  });
});
