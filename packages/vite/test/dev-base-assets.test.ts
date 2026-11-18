/**
 * The assets a layout links load in dev under a `base` (found while testing SDD-88): Vite's dev
 * HTML transform joins `base` onto every root-absolute URL, and the linked assets were already
 * written with it, so `/admin/admin/…` answered 404. Every page links a layout now, so every
 * page of an app under a base lost its sheet and its icon in dev.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
<head>
  <link rel="stylesheet" href="../app.css">
  <link rel="icon" href="../logo.svg">
  @RenderHead()
</head>
<body><main>@RenderBody()</main></body>
</html>
`;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-dev-base-'));
  roots.push(root);
  const files: Record<string, string> = {
    'fudic.json': '{"id":"app"}',
    'src/app.css': 'main { color: rebeccapurple; }\n',
    'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>\n',
    'src/layouts/_layout.fud': LAYOUT,
    'src/routes/index.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<head><title>Inicio</title></head>\n<p>inicio</p>\n',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** The status of the page and of every sheet and icon its head links. */
async function linkedUnder(base: string): Promise<{ page: number; links: Record<string, number> }> {
  const server = await createServer({
    root: project(),
    base,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic({ liveCheck: false })],
    server: { port: 0 },
  });
  try {
    await server.listen();
    const origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
    const res = await fetch(`${origin}${base}`, { headers: { accept: 'text/html' } });
    const html = await res.text();
    const hrefs = [...html.matchAll(/<link rel="(?:stylesheet|icon)" href="([^"]+)"/gu)].map((m) => m[1]!);
    const links: Record<string, number> = {};
    for (const href of hrefs) links[href] = (await fetch(new URL(href, `${origin}${base}`))).status;
    return { page: res.status, links };
  } finally {
    await server.close();
  }
}

describe('the assets a layout links, in dev', () => {
  it('under /admin/: the sheet and the icon load, once under the base', async () => {
    const { page, links } = await linkedUnder('/admin/');
    expect(page).toBe(200);
    const hrefs = Object.keys(links);
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      expect(href.startsWith('/admin/'), href).toBe(true);
      expect(href.startsWith('/admin/admin/'), href).toBe(false);
      expect(links[href], href).toBe(200);
    }
  }, 120000);

  it('at /: the same, as before', async () => {
    const { page, links } = await linkedUnder('/');
    expect(page).toBe(200);
    expect(Object.keys(links).length).toBeGreaterThanOrEqual(2);
    for (const [href, status] of Object.entries(links)) expect(status, href).toBe(200);
  }, 120000);
});
