/**
 * SDD-19 §4.4 end-to-end: a real `vite build` over a param-free page with no `@server
 * load` prerenders it — the route is `ssg` in the manifest
 * and its HTML is emitted as a static file the browser fetches directly. Proves the
 * plugin runs the built RenderChunk at build time and materializes mode-1 SSG.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body>
<h1>About us</h1>
<p>A static page.</p>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-prerender-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'about.fud'), PAGE);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('vite build — static prerender (mode 1)', () => {
  it('marks the route ssg in the manifest, with the URL of its HTML', () => {
    const asset = output.find((o) => o.type === 'asset' && o.fileName === 'fudic-routes.json');
    const manifest = JSON.parse(asset!.source as string) as { routes: Array<Record<string, unknown>> };
    expect(manifest.routes[0]).toMatchObject({
      pattern: '/about',
      mode: 'ssg',
      html: '/about/index.html',
    });
  });

  it('emits the prerendered HTML file at the route path', () => {
    const html = output.find((o) => o.type === 'asset' && o.fileName === 'about/index.html');
    expect(html).toBeDefined();
    const body = html!.source as string;
    expect(body.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(body).toContain('<h1>About us</h1>');
    expect(body).toContain('A static page.');
    // The nonce placeholder, swapped for a fresh one by whoever serves the file (§4.9.3).
    expect(body).toContain('__FUDIC_NONCE__');
  });
});
