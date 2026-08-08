/**
 * SDD-19 §6.17 (closing hito): the four fixtures compile through the plugin, home renders
 * in its inferred mode, and the document is served over HTTP and painted with zero client
 * JavaScript (N1 / SSR). We build the fixtures, run home's EDGE chunk — the one that calls
 * `@server load` in process, exactly as the prerender and the preview do — serve the HTML
 * over a throwaway HTTP server, fetch it, and assert it is a Declarative-Shadow-DOM
 * document with NO hydration artifacts (SDD-15 client is paused).
 *
 * It used to render the chunk out of the client bundle. Since BUG-09 that chunk carries no
 * `load` — server code does not travel in the client output — so the render came out with
 * no data. The edge pass is where the loading variant lives now.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'vite';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { runEdgePass } from '../src/edge.js';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';
import { nodeIo } from '../src/io.js';
import { materializeBundle, renderChunkToHtml, type BundleItem } from '../src/prerender.js';

const fixtures = fileURLToPath(new URL('../../compiler/fixtures', import.meta.url));
const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

let httpServer: Server;
let html = '';
let servedUrl = '';

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-serve-'));
  const routes = join(root, 'routes');
  mkdirSync(routes, { recursive: true });
  for (const f of ['home.fud', 'app-card.fud', 'app-button.fud', 'app-badge.fud', 'app-list.fud']) {
    writeFileSync(join(routes, f), readFileSync(join(fixtures, f), 'utf8'));
  }
  // home's @server load reads ./db — a stub with one item so the components render.
  writeFileSync(
    join(routes, 'db.ts'),
    "export const db = { query: async () => [{ id: '1', title: 'Uno', description: 'D', featured: true }] };\n",
  );

  const bundleDir = mkdtempSync(join(tmpdir(), 'fudic-serve-out-'));
  await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  });

  // The edge wrappers, built the way the plugin builds them, and run from a temp dir —
  // never from `outDir`, which is the whole point of BUG-09.
  const { routes: builds } = discoverRoutes(root, resolveOptions({}, '/').options);
  const edge = await runEdgePass(root, '/', builds, nodeIo(), { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist }, { sourcemap: false, minify: false });
  const bundle: Record<string, BundleItem> = {};
  for (const chunk of edge.chunks) {
    bundle[chunk.fileName] = { type: 'chunk', code: chunk.code };
  }
  materializeBundle(bundle, bundleDir);
  html = await renderChunkToHtml(join(bundleDir, edge.entries.get('/home')!), '/home');

  // Serve the rendered document over HTTP (no client JS involved in producing it).
  httpServer = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise<void>((r) => httpServer.listen(0, r));
  servedUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}/home`;
}, 120000);

afterAll(() => {
  httpServer?.close();
});

describe('four fixtures served with zero-JS render (§6.17)', () => {
  it('serves a full Declarative-Shadow-DOM document over HTTP', async () => {
    const fetched = await (await fetch(servedUrl)).text();
    expect(fetched).toBe(html); // what we render is exactly what is served
    expect(fetched.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(fetched).toContain('<template shadowrootmode="open"'); // DSD
    expect(fetched).toContain('data-adopt="app-card"');
    expect(fetched).toContain('<app-badge'); // nested component rendered
    expect(fetched).toContain('Uno'); // the loaded item painted server-side
  });

  it('carries no hydration artifacts (SDD-15 client paused)', () => {
    expect(html).not.toContain('fud-chunks'); // the hydration manifest
    expect(html).not.toContain('FudicElement'); // the client custom-element base
    expect(html).not.toContain('customElements.define');
  });
});
