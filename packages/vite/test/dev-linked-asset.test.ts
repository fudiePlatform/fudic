/**
 * BUG-40 §4.4, criterion 8: development serves the linked file at the URL the build
 * publishes it under, with the bytes the build would publish.
 *
 * Dev has no bundle to put an asset in, so without this middleware the sheet the page links
 * is a 404 in `pnpm dev` and correct in `dist` — or the other way round. That difference is
 * the kind that is found last, and it is found by a person, in a browser.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { LinkedAssets } from '../src/linked-assets.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="../styles/tokens.css">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">
<head><title>Inicio</title></head>
<h1>Inicio</h1>
`;

const TOKENS = '/* the document half of the system */\n:root  {\n  --gap:  8px;\n}\n';

let server: ViteDevServer;
let origin: string;
let sheetPath: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-dev-asset-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'layouts'), { recursive: true });
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), ROUTE);
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  sheetPath = join(root, 'src', 'styles', 'tokens.css');
  writeFileSync(sheetPath, TOKENS);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    server: { port: 0 },
  });
  await server.listen();
  origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
}, 120000);

afterAll(async () => {
  await server.close();
});

/** The page, rendered on demand — which is also what registers the sheet. */
async function sheetUrl(): Promise<string> {
  const html = await (await fetch(`${origin}/`, { headers: { accept: 'text/html' } })).text();
  const found = /<link rel="stylesheet" href="([^"]+)"/u.exec(html);
  if (found === null) {
    throw new Error(`no stylesheet link in the rendered page:\n${html}`);
  }
  return found[1]!;
}

describe('vite dev — a linked stylesheet', () => {
  it('names it exactly as the build would: the hash is the bytes, not the bundle', async () => {
    expect(await sheetUrl()).toBe(new LinkedAssets('/').url(sheetPath));
  });

  it('serves it, with its content type and the bytes the build publishes', async () => {
    const res = await fetch(`${origin}${await sheetUrl()}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
    // Compacted, not a re-read of the source: dev and the output are the same file.
    expect(await res.text()).toBe(':root{--gap:8px;}');
  });

  it('answers it with a query too, the way a browser may ask', async () => {
    const res = await fetch(`${origin}${await sheetUrl()}?t=1`);
    expect(res.status).toBe(200);
  });

  it('leaves a URL it never named to the rest of the middlewares', async () => {
    expect((await fetch(`${origin}/assets/tokens-00000000.css`)).status).toBe(404);
  });
});
