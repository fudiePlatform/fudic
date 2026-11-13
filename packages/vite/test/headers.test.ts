/**
 * SDD-84 §4.2: the three `.headers` in the build — as the manifest carries them, as dev serves
 * them, and the checks that need the output (criteria 13, 14, 18 and 19, the build's part).
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEADERS_TEMPLATES, readHeaders, type ConfigIo, type CspNeed, type HeadersRead } from '@fudic/config';
import { LINKER_NEEDS } from '@fudic/transport';
import {
  builtFilesOf,
  checkAssets,
  checkEmitted,
  CSP_NEEDS_FILE,
  cspNeedsJson,
  dedupe,
  devHeadersOf,
  isHashedName,
  manifestHeadersOf,
  pageCspOf,
  policyOf,
  publicFilesOf,
  writeCspNeeds,
} from '../src/headers.js';

/** The headers of an app whose files are `files` (by name); the others, their templates. */
function app(files: Readonly<Record<string, string>> = {}, sw = true): HeadersRead {
  const io: ConfigIo = {
    exists: (path) => path.slice(path.lastIndexOf('/') + 1) in files,
    read: (path) => files[path.slice(path.lastIndexOf('/') + 1)]!,
  };
  return readHeaders('/app', io, { kind: 'app', sw });
}

const codes = (diagnostics: readonly { readonly code: string }[]): readonly string[] => diagnostics.map((d) => d.code);
const polyfill: CspNeed = { loads: 'inline-script', piece: 'the style polyfill' };
const policy: CspNeed = { loads: 'policy', policy: 'fudic', piece: 'the Trusted Types policy' };
/** What a hydrating page of the template needs. */
const hydrating: readonly CspNeed[] = [polyfill, policy];

describe('what the manifest carries', () => {
  it('each file by name, and the rules of assets.headers most specific first', () => {
    const headers = manifestHeadersOf(app().config);
    expect(headers.page['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers.page['Content-Security-Policy']).toContain("script-src 'nonce-{nonce}' 'strict-dynamic'");
    expect(headers.sw).toEqual({ 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'" });
    expect(headers.assets.map((rule) => rule.pattern)).toEqual(['/assets/**', '/**']);
  });

  it('dev, without the page CSP nor HSTS; the rest as it is (criterion 28)', () => {
    const headers = devHeadersOf(manifestHeadersOf(app().config));
    expect(Object.keys(headers.page)).toEqual(['Referrer-Policy', 'Cross-Origin-Opener-Policy']);
    expect(headers.sw).toEqual(manifestHeadersOf(app().config).sw);
  });

  it('the page CSP, or none', () => {
    expect(pageCspOf(manifestHeadersOf(app().config))).toContain("'nonce-{nonce}'");
    expect(pageCspOf(manifestHeadersOf(app({ 'page.headers': 'X-A: 1\n' }).config))).toBeUndefined();
  });
});

describe('what the output needs (§3.4)', () => {
  it('reads the policy of the file, or of its template when there is none', () => {
    const written = 'Content-Security-Policy: script-src \'self\'\n';
    expect(policyOf(app({ 'page.headers': written }), 'page')!.directives.map((d) => d.name)).toEqual(['script-src']);
    expect(policyOf(app(), 'page')!.directives.map((d) => d.name)).toContain('trusted-types');
    expect(policyOf(app({ 'page.headers': 'X-A: 1\n' }), 'page')).toBeUndefined();
  });

  it('criterion 10, the build’s part: what hydrates and the policy does not let in is FUD1545', () => {
    const read = app({ 'page.headers': "Content-Security-Policy: script-src 'self'\n" });
    const [diagnostic] = checkEmitted(read, { page: [polyfill] });
    expect(diagnostic!.code).toBe('FUD1545');
    expect(diagnostic!.message).toContain('the style polyfill');
    expect(diagnostic!.file).toBe('page.headers');
  });

  it('criterion 13: sw.headers without unsafe-eval is FUD1548, naming the linker', () => {
    const read = app({ 'sw.headers': "Content-Security-Policy: script-src 'self'\n" });
    const found = checkEmitted(read, { page: hydrating, sw: LINKER_NEEDS });
    expect(codes(found)).toEqual(['FUD1548']);
    expect(found[0]!.message).toContain('the Service Worker linker');
  });

  it('criterion 14: tomorrow without touching code — a linker that needs nothing makes unsafe-eval FUD1556', () => {
    const found = checkEmitted(app(), { page: hydrating, sw: [] });
    expect(codes(found)).toEqual(['FUD1556']);
    expect(found[0]!.file).toBe('sw.headers');
    // And an app with no page that hydrates: the nonce is kept for nothing.
    expect(codes(checkEmitted(app(), { page: [], sw: LINKER_NEEDS }))).toContain('FUD1556');
  });

  it('the templates let in what the output needs, and an app with no worker checks no sw.headers', () => {
    expect(checkEmitted(app(), { page: hydrating, sw: LINKER_NEEDS })).toEqual([]);
    expect(checkEmitted(app({ 'sw.headers': "Content-Security-Policy: script-src 'self'\n" }), { page: hydrating })).toEqual([]);
  });

  it('leaves them for the editor, each once, by file', () => {
    expect(dedupe([polyfill, polyfill, ...LINKER_NEEDS])).toEqual([polyfill, ...LINKER_NEEDS]);
    expect(JSON.parse(cspNeedsJson({ page: [polyfill, polyfill], sw: LINKER_NEEDS }))).toEqual({
      'page.headers': [polyfill],
      'sw.headers': LINKER_NEEDS,
    });
    expect(JSON.parse(cspNeedsJson({ page: [] }))).toEqual({ 'page.headers': [] });
    const root = mkdtempSync(join(tmpdir(), 'fudic-needs-'));
    writeCspNeeds(root, { page: [polyfill] });
    expect(JSON.parse(readFileSync(join(root, CSP_NEEDS_FILE), 'utf8'))).toEqual({ 'page.headers': [polyfill] });
  });
});

describe('assets.headers against the build (§3.4)', () => {
  const files = builtFilesOf(['assets/main-1a2B3c4D.js', 'fudic-boot.js', 'index.html'], ['/favicon.ico', '/fonts/a.woff2']);
  const rules = (text: string) => app({ 'assets.headers': text }).config.assets;

  it('names the build’s files, hashed by their name, the public ones never', () => {
    expect(files).toEqual([
      { path: '/assets/main-1a2B3c4D.js', hashed: true },
      { path: '/fudic-boot.js', hashed: false },
      { path: '/index.html', hashed: false },
      { path: '/favicon.ico', hashed: false },
      { path: '/fonts/a.woff2', hashed: false },
    ]);
    expect(isHashedName('assets/x-routes')).toBe(false);
    expect(isHashedName('.hidden-12345678')).toBe(true);
  });

  it('the template says nothing', () => {
    // Not even `no-cache` on an unhashed file the worker precaches: that one has to be revalidated.
    expect(checkAssets(rules(HEADERS_TEMPLATES.assets), files, { shell: ['/fudic-boot.js'], cacheFirst: ['/assets/**'] })).toEqual([]);
  });

  it('criterion 18: no-cache on what the worker precaches is FUD1551, on the rule', () => {
    const text = '/**\n  Cache-Control: max-age=60\n/assets/**\n  Cache-Control: no-cache\n';
    const found = checkAssets(rules(text), files, { shell: [], cacheFirst: ['/assets/**'] });
    expect(codes(found)).toEqual(['FUD1551']);
    expect(text.slice(found[0]!.span!.start, found[0]!.span!.end)).toBe('/assets/**');
    // And `no-store` on a hashed shell entry; on an unhashed one it is right, and so is no worker.
    const shell = (path: string) => checkAssets(rules('/**\n  Cache-Control: no-store\n'), files, { shell: [path], cacheFirst: [] });
    expect(codes(shell('/assets/main-1a2B3c4D.js'))).toEqual(['FUD1551']);
    expect(shell('/index.html')).toEqual([]);
    expect(checkAssets(rules(text), files, null)).toEqual([]);
  });

  it('criterion 19: immutable on /** is FUD1552, naming a file without a hash; /nada/** is FUD1553', () => {
    const found = checkAssets(rules('/**\n  Cache-Control: public, immutable\n/nada/**\n  X-A: 1\n'), files, null);
    expect(codes(found)).toEqual(['FUD1552', 'FUD1553']);
    expect(found[0]!.message).toContain('/fudic-boot.js');
    // A day or more of max-age is long too; less is not.
    expect(codes(checkAssets(rules('/**\n  Cache-Control: max-age=86400\n'), files, null))).toEqual(['FUD1552']);
    expect(checkAssets(rules('/**\n  Cache-Control: max-age=600\n'), files, null)).toEqual([]);
  });

  it('a rule that sends nothing, or other headers only, is not a cache to check', () => {
    expect(checkAssets(rules('/**\n  Cache-Control: no-cache\n/legacy.js\n  Cache-Control:\n'), [{ path: '/legacy.js', hashed: false }], null)).toEqual([]);
    expect(checkAssets(rules('/**\n  X-A: 1\n'), files, null)).toEqual([]);
  });

  it('lists the public directory, nested, with forward slashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-public-'));
    mkdirSync(join(dir, 'fonts'));
    writeFileSync(join(dir, 'favicon.ico'), '');
    writeFileSync(join(dir, 'fonts', 'a.woff2'), '');
    expect([...publicFilesOf(dir)].sort()).toEqual(['/favicon.ico', '/fonts/a.woff2']);
    expect(publicFilesOf('')).toEqual([]);
    expect(publicFilesOf(join(dir, 'none'))).toEqual([]);
  });
});
