/**
 * SDD-19 §6.17 (closing hito): the four fixtures compile through the plugin, home renders
 * in its inferred mode, and the document is served over HTTP and painted with zero client
 * JavaScript (N1 / SSR). We build the fixtures, run home's EDGE chunk — the one that calls
 * the handler of its `load` in process, exactly as the prerender and the preview do — serve the HTML
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
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';
import { EDGE_DIR } from '../src/constants.js';
import { safeName } from '../src/link.js';
import { renderChunkToHtml } from '../src/prerender.js';

const fixtures = fileURLToPath(new URL('../../compiler/fixtures', import.meta.url));

let httpServer: Server;
let html = '';
let servedUrl = '';

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-serve-'));
  writeHttpTypecheckConfig(root);
  const routes = join(root, 'src', 'routes');
  mkdirSync(routes, { recursive: true });
  for (const f of [
    'home.fud',
    'app-card.fud',
    'app-button.fud',
    'app-badge.fud',
    'app-list.fud',
    'app-actions.fud',
    'app-calendar.fud',
  ]) {
    writeFileSync(join(routes, f), readFileSync(join(fixtures, f), 'utf8'));
  }
  // home's `load` is its `.fudapi`'s; the handler reads ./db — a stub with one item so the
  // components render (SDD-60 §3.12).
  writeFileSync(join(routes, 'home.fudapi'), readFileSync(join(fixtures, 'home.fudapi'), 'utf8'));
  mkdirSync(join(root, 'src', 'server'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'server', 'home.ts'),
    [
      "import { load } from 'fudic:routes/home';",
      "import { db } from './db';",
      '',
      "load.handle(async () => ({ title: 'Inicio', items: await db.query('SELECT id, title, description, featured FROM items') }));",
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src', 'server', 'db.ts'),
    "export const db = { query: async (_sql: string) => [{ id: '1', title: 'Uno', description: 'D', featured: true }] };\n",
  );

  // WRITTEN to disk: the edge chunks live outside `outDir` — the whole point of BUG-09 — and
  // only exist when they do. The plugin builds them with the server root that registers the
  // handler of `load` (SDD-60 §4.4), which is what this render runs.
  await build({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic()],
    build: { minify: false },
  });
  html = await renderChunkToHtml(join(root, EDGE_DIR, `${safeName('/home')}.js`), '/home');

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
    expect(fetched).toContain('data-fud-adopt="app-card"');
    expect(fetched).toContain('<app-badge'); // nested component rendered
    expect(fetched).toContain('Uno'); // the loaded item painted server-side
  });

  it('carries no hydration artifacts (SDD-15 client paused)', () => {
    expect(html).not.toContain('fud-chunks'); // the hydration manifest
    expect(html).not.toContain('FudicElement'); // the client custom-element base
    expect(html).not.toContain('customElements.define');
  });
});
