/**
 * SDD-49 §4.10, criterion 38: `vite dev` flattens and prunes exactly as the build does, and
 * serves each pruned copy from memory under `/@fudic/sheet/`.
 *
 * The sheet a page links and every file its `@import`s flatten in are inputs of the page's
 * module: editing either has to prune the page again on the next navigation, or dev keeps
 * serving the CSS of a file that no longer says that.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="../styles/main.css">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">
<head><title>Inicio</title></head>
<h1 class="title">Inicio</h1>
`;

/** The sheet the layout links: one rule the page uses, one it does not. */
const MAIN = '@import "./parts.css";\nh1 { margin: 0; }\ntable { border: 0; }\n';

/** The file it imports. */
const PARTS = '.title { color: red; }\n';

let server: ViteDevServer;
let origin: string;
let stylesDir: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-dev-sheets-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'layouts'), { recursive: true });
  stylesDir = join(root, 'src', 'styles');
  mkdirSync(stylesDir, { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), ROUTE);
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  writeFileSync(join(stylesDir, 'main.css'), MAIN);
  writeFileSync(join(stylesDir, 'parts.css'), PARTS);
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

/** Navigate to the page and return the `href` its `<head>` links. */
async function sheetUrl(): Promise<string> {
  const html = await (await fetch(`${origin}/`, { headers: { accept: 'text/html' } })).text();
  const found = /<link rel="stylesheet" href="([^"]+)"/u.exec(html);
  if (found === null) {
    throw new Error(`no stylesheet link in the rendered page:\n${html}`);
  }
  return found[1]!;
}

/** The CSS the middleware answers for the page's sheet. */
async function sheetText(): Promise<string> {
  const res = await fetch(`${origin}${await sheetUrl()}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/css');
  return res.text();
}

/**
 * The next navigation after an edit is the one the criterion speaks of — but the file
 * watcher is asynchronous, and a navigation that races it is not «the next». So it is
 * asked until the page answers differently, with a deadline that turns «never» into a
 * failure.
 */
const NEXT_NAVIGATION = { timeout: 15000, interval: 100 };

describe('vite dev — the pruned sheets of a page (SDD-49 §4.10)', () => {
  // The first page of a dev server waits for the project's first typecheck (SDD-35 §4.5),
  // which under a full parallel run is more than the default five seconds.
  it('links the pruned copy under /@fudic/sheet/, not under /assets/', async () => {
    expect(await sheetUrl()).toMatch(/^\/@fudic\/sheet\/main-[\w-]{8}\.css$/u);
  }, 60_000);

  it('serves that copy: the import flattened in, the rule nobody uses gone', async () => {
    const css = await sheetText();
    expect(css).toContain('.title{color:red;}');
    expect(css).toContain('h1{margin:0;}');
    expect(css).not.toContain('table');
    expect(css).not.toContain('@import');
  });

  it('prunes again after an edit to a file the sheet IMPORTS', async () => {
    const before = await sheetUrl();
    writeFileSync(join(stylesDir, 'parts.css'), '.title { color: blue; }\n.unused { color: red; }\n');
    // A new prune is new bytes, and the name is the hash of the bytes.
    await expect.poll(sheetUrl, NEXT_NAVIGATION).not.toBe(before);
    const css = await sheetText();
    expect(css).toContain('.title{color:blue;}');
    expect(css).not.toContain('.unused');
  }, 30000);

  it('prunes again after an edit to the sheet itself', async () => {
    writeFileSync(
      join(stylesDir, 'main.css'),
      '@import "./parts.css";\nh1 { margin: 1px; }\nmain { padding: 0; }\n',
    );
    await expect.poll(sheetText, NEXT_NAVIGATION).toContain('h1{margin:1px;}');
    const css = await sheetText();
    expect(css).toContain('h1{margin:1px;}');
    expect(css).toContain('main{padding:0;}');
    expect(css).not.toContain('margin:0');
  }, 30000);
});
