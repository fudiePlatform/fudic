/**
 * SDD-84 §4.2 end-to-end: `vite build` reads the three `.headers`, carries them in the manifest
 * and in the server module, prerenders without a nonce when the page asks for none, leaves what
 * the output needs for the editor, checks the cache rules against the build, and stops on an
 * error in a file instead of falling back to its template.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build, type Rollup } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HEADERS_TEMPLATES } from '@fudic/config';
import { NONCE_TOKEN } from '@fudic/transport';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body><h1>About us</h1></body>
</html>
`;

interface OutFile {
  readonly fileName: string;
  readonly source?: string | Uint8Array;
}

interface Built {
  readonly root: string;
  readonly output: readonly OutFile[];
  readonly warnings: readonly string[];
}

/** A project with `/about`, `files` written at its root, built. */
async function buildApp(files: Readonly<Record<string, string>>, write = false): Promise<Built> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-headers-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'about.fud'), PAGE);
  writeFileSync(join(root, 'public', 'favicon.ico'), '');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  const warnings: string[] = [];
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write,
      outDir: join(root, 'dist'),
      minify: false,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  })) as unknown as { output: OutFile[] };
  return { root, output: result.output, warnings };
}

const text = (built: Built, fileName: string): string => {
  const source = built.output.find((o) => o.fileName === fileName)!.source!;
  return typeof source === 'string' ? source : new TextDecoder().decode(source);
};

const NO_NONCE = "Content-Security-Policy:\n  script-src 'self' 'unsafe-inline'\nReferrer-Policy: strict-origin-when-cross-origin\n";

let template: Built;
let noNonce: Built;

beforeAll(async () => {
  template = await buildApp({ 'sw.json': JSON.stringify({ shell: [] }), 'fudic.json': JSON.stringify({ id: 'test' }) }, true);
  noNonce = await buildApp({
    'page.headers': NO_NONCE,
    'assets.headers': '/**\n  Cache-Control: public, max-age=31536000, immutable\n/nada/**\n  X-A: 1\n',
  });
}, 240_000);

describe('vite build — the headers of the app (SDD-84)', () => {
  it('criterion 3: without any file, the manifest and the server carry the templates', () => {
    const manifest = JSON.parse(text(template, 'fudic-routes.json')) as { headers: { page: Record<string, string>; sw: Record<string, string>; assets: unknown[] } };
    expect(manifest.headers.page['Content-Security-Policy']).toContain("script-src 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' https:");
    expect(Object.keys(manifest.headers.page)).toEqual([
      'Content-Security-Policy',
      'Referrer-Policy',
      'Cross-Origin-Opener-Policy',
      'Strict-Transport-Security',
    ]);
    expect(manifest.headers.sw).toEqual({ 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'" });
    expect(manifest.headers.assets).toEqual([
      { pattern: '/assets/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      { pattern: '/**', headers: { 'Cache-Control': 'no-cache' } },
    ]);
    const server = readFileSync(join(template.root, '.fudic', 'edge', 'server.mjs'), 'utf8');
    expect(server).toContain(`headers: ${JSON.stringify(manifest.headers)},`);
    expect(server).toContain('files: {"manifest":"/fudic-routes.json","worker":"/fudic-sw.js"},');
    // The template is quiet about the build: a new app has nothing to fix.
    expect(template.warnings.filter((w) => /FUD15[45]\d/u.test(w))).toEqual([]);
    expect(HEADERS_TEMPLATES.page).toContain('{nonce}');
  });

  it('leaves what the output needs for the editor', () => {
    const needs = JSON.parse(readFileSync(join(template.root, '.fudic', 'csp-needs.json'), 'utf8')) as Record<string, unknown>;
    expect(needs['sw.headers']).toEqual([{ loads: 'eval', piece: 'the Service Worker linker' }]);
    expect(needs).toHaveProperty(['page.headers']);
  });

  it('criterion 15: without {nonce}, the prerendered page carries no nonce and no token', () => {
    const html = text(noNonce, 'about/index.html');
    expect(html).toContain('<h1>About us</h1>');
    expect(html).not.toContain(NONCE_TOKEN);
    expect(html).not.toContain('nonce=');
    expect(noNonce.warnings.some((w) => w.includes('FUD1545'))).toBe(false);
  });

  it('criterion 19: immutable on /** warns FUD1552 naming a file without a hash; a rule of nothing is a hint, not said', () => {
    const long = noNonce.warnings.filter((w) => w.includes('FUD1552'));
    expect(long).toHaveLength(1);
    expect(long[0]).toMatch(/favicon\.ico|fudic-|index\.html/u);
    expect(noNonce.warnings.some((w) => w.includes('FUD1553'))).toBe(false);
  });

  it('an error in a .headers stops the build, and the file never falls back to its template', async () => {
    await expect(buildApp({ 'page.headers': 'Content-Type: text/plain\n' })).rejects.toThrow(/FUD1542/u);
  });

  it('a .headers silenced by its own fud-disable says nothing (criterion 21, the build’s part)', async () => {
    const silenced = await buildApp({
      'page.headers': `${NO_NONCE}# fud-disable-next-line FUD1549: no back link here\nX-Ignored: 1\n`,
      'assets.headers': '# fud-disable-next-line FUD1552: tested\n/**\n  Cache-Control: immutable\n',
    });
    expect(silenced.warnings.some((w) => w.includes('FUD1552'))).toBe(false);
    expect(existsSync(join(silenced.root, '.fudic', 'csp-needs.json'))).toBe(false);
  });
});
