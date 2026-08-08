/**
 * SDD-19 §4.10 end-to-end: a real Vite dev server serves the runtime artifacts that
 * `generateBundle` produces in build. The manifest is served from `manifestUrl` with
 * every route `ssr` (rendered on demand, not prerendered per save), and the
 * two bootstraps are served at stable root URLs — the Service Worker with a
 * `Service-Worker-Allowed` header so it could claim root scope.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';


const PAGE = `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body><h1>About us</h1></body>
</html>
`;

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-dev-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'about.fud'), PAGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    server: { port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address() as AddressInfo;
  origin = `http://localhost:${address.port}`;
}, 120000);

afterAll(async () => {
  await server.close();
});

describe('vite dev server (SDD-19 §4.10)', () => {
  it('serves the manifest with every route rendered by the edge in dev', async () => {
    const res = await fetch(`${origin}/fudic-routes.json`);
    expect(res.headers.get('content-type')).toContain('application/json');
    const manifest = (await res.json()) as { routes: Array<Record<string, unknown>> };
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0]).toEqual({ pattern: '/about', mode: 'ssr' });
  });

  it('serves the Service Worker at a root URL with Service-Worker-Allowed', async () => {
    const res = await fetch(`${origin}/fudic-sw.js`);
    expect(res.headers.get('service-worker-allowed')).toBe('/');
    const code = await res.text();
    expect(code).toContain('createRouter');
  });

  it('does not register the Service Worker in dev (option A, §4.11)', async () => {
    const main = await (await fetch(`${origin}/fudic-main.js`)).text();
    expect(main).not.toContain('registerRenderServiceWorker');
    // And there is no Web Worker bootstrap at all any more.
    expect((await fetch(`${origin}/fudic-ww.js`)).status).toBe(404);
  });

  it('resolves the bootstrap URLs in the module pipeline, not just in the middleware', async () => {
    // What `transformIndexHtml` warms up for every module `<script src>` it sees. That
    // path skips the middlewares, so before this resolved the URL it threw and Vite
    // logged `Pre-transform error: Failed to load url /fudic-main.js`.
    expect((await server.transformRequest('/fudic-main.js'))?.code).toBe('export {};\n');
    expect((await server.transformRequest('/fudic-sw.js'))?.code).toContain('createRouter');
    // A name that is not a bootstrap still falls through to Vite's own resolution.
    await expect(server.transformRequest('/nope.js')).rejects.toThrow(/Failed to load url/u);
  });

  it('renders a navigation on demand (§4.10)', async () => {
    const res = await fetch(`${origin}/about`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('About us'); // the page body, rendered by the wrapper chunk
    expect(html).toContain('/@vite/client'); // dev client injected, so edits reload
  });

  it('leaves a non-route path to the rest of the middlewares', async () => {
    const res = await fetch(`${origin}/nope`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(404);
  });
});
