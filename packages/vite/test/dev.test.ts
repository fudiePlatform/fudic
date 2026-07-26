/**
 * SDD-19 §4.10 end-to-end: a real Vite dev server serves the runtime artifacts that
 * `generateBundle` produces in build. The manifest is served from `manifestUrl` with
 * every route incremental (mode-1 rendered on-demand, not prerendered per save), and the
 * three bootstraps are served at stable root URLs — the Service Worker with a
 * `Service-Worker-Allowed` header so it can claim root scope.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

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
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'about.fud'), PAGE);
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
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
  it('serves the manifest with every route incremental and dev chunk URLs', async () => {
    const res = await fetch(`${origin}/fudic-routes.json`);
    expect(res.headers.get('content-type')).toContain('application/json');
    const manifest = (await res.json()) as Array<Record<string, unknown>>;
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ pattern: '/about', dynamic: true });
    expect(manifest[0]!['chunk']).toContain('/@id/__x00__fudic-wrapper:/about');
  });

  it('serves the Service Worker at a root URL with Service-Worker-Allowed', async () => {
    const res = await fetch(`${origin}/fudic-sw.js`);
    expect(res.headers.get('service-worker-allowed')).toBe('/');
    const code = await res.text();
    expect(code).toContain('createRouter');
  });

  it('serves the Web Worker and main bootstraps at root URLs', async () => {
    const ww = await (await fetch(`${origin}/fudic-ww.js`)).text();
    expect(ww).toContain('installRenderWorker');
    const main = await (await fetch(`${origin}/fudic-main.js`)).text();
    expect(main).toContain('registerRenderServiceWorker');
    expect(main).toContain('fudic-sw.js'); // main points at the root SW URL
  });
});
