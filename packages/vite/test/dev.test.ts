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
<head><title>About</title><link rel="component" href="../components/dev-widget.fud"></head>
<body><h1>About us</h1><dev-widget></dev-widget></body>
</html>
`;

/** A hydratable component: it has a `@client` region, so it gets a client module. */
const WIDGET = `@code {
  @client {
    import { signal } from '@fudic/core';
    const hits = signal(0);
    function bump() { hits.set(hits() + 1); }
  }
}

<dev-widget>
  <template shadowrootmode="open">
    <button @click="@bump">@hits()</button>
  </template>
</dev-widget>
`;

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-dev-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'about.fud'), PAGE);
  writeFileSync(join(root, 'src', 'components', 'dev-widget.fud'), WIDGET);
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
    expect((await server.transformRequest('/fudic-main.js'))?.code).toContain('installHydration');
    expect((await server.transformRequest('/fudic-sw.js'))?.code).toContain('createRouter');
    // A name that is not a bootstrap still falls through to Vite's own resolution.
    await expect(server.transformRequest('/nope.js')).rejects.toThrow(/Failed to load url/u);
  });

  it('SDD-17 §4.7.1 publishes each component’s client module at a stable URL per tag', async () => {
    // In a build this module is an emitted chunk whose URL the manifest derives. In dev it
    // exists only as `<path>.fud?client`, an id nothing serves — so without this the URL
    // the runtime asks for is a 404 and dev cannot hydrate, whatever the runtime does.
    const res = await fetch(`${origin}/@fudic/h/dev-widget.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    const code = await res.text();
    expect(code).toContain('customElements.define("dev-widget"');
    // Served through the module pipeline, so its bare imports are already rewritten.
    expect(code).not.toContain("from '@fudic/core'");
  });

  it('the same URL resolves in the module graph, and an unknown tag is nobody’s', async () => {
    expect((await server.transformRequest('/@fudic/h/dev-widget.js'))?.code).toContain(
      'customElements.define',
    );
    // A tag no route renders has no client module: the request is not the plugin's.
    expect((await fetch(`${origin}/@fudic/h/no-such-tag.js`)).status).toBe(404);
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
