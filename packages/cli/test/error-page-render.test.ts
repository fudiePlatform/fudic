/**
 * SDD-87 §3.6, criterion 20: the page `fudic g error-page` writes compiles without a diagnostic,
 * and painted by a real dev server of an app under `/admin/` links home with no way back, and
 * back with one. The page writes `data.home` and `data.back` as they come: both carry the base.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fudic } from '@fudic/vite';
import { parseFud } from '../src/parse.js';
import { renderTemplate } from '../src/templates.js';

const PAGE = renderTemplate('_error.fud', { lang: 'es' });

/** The runtime a painted page imports, aliased to its `dist`: a temp root has no `node_modules`. */
const dist = (pkg: string, entry = 'index.js'): string => fileURLToPath(new URL(`../../${pkg}/dist/${entry}`, import.meta.url));
const alias: Record<string, string> = {
  '@fudic/ssr': dist('ssr'),
  '@fudic/transport': dist('transport'),
  '@fudic/core': dist('core'),
  '@fudic/dom': dist('dom'),
  '@fudic/http/server': dist('http', 'server/index.js'),
  '@fudic/http/wire/frames': dist('http', 'wire/frames.js'),
};

describe('the generated error page compiles (criterion 20)', () => {
  it('with no diagnostic at all', () => {
    expect(parseFud(PAGE).diagnostics).toEqual([]);
    expect(PAGE).toContain('<html lang="es">');
  });
});

describe('painted under /admin/ (criterion 20)', () => {
  let server: ViteDevServer;
  let origin: string;
  const page = async (path: string, referer?: string): Promise<string> =>
    (await fetch(`${origin}${path}`, { headers: { accept: 'text/html', ...(referer !== undefined ? { referer } : {}) } })).text();
  /** Each `<a>` of the page: its href and its text. */
  const links = (html: string): string[][] => [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/gu)].map((m) => [m[1]!, m[2]!]);

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-error-page-render-'));
    const files: Record<string, string> = {
      'fudic.json': JSON.stringify({ id: 'admin', kind: 'app', prefix: 'adm' }),
      'src/routes/index.fud': '<!DOCTYPE html>\n<html lang="es">\n<head><title>Inicio</title></head>\n<body><p>inicio</p></body>\n</html>\n',
      'src/routes/_error.fud': PAGE,
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    server = await createServer({
      root,
      base: '/admin/',
      logLevel: 'silent',
      resolve: { alias },
      plugins: [fudic({ liveCheck: false })],
      server: { port: 0 },
    });
    await server.listen();
    origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
    await page('/admin/'); // the first request loads the server: here, not inside a case's 5 s
  }, 120000);

  afterAll(async () => {
    await server.close();
  });

  it('with no way back, a link home: /admin/', async () => {
    const html = await page('/admin/x');
    expect(html).toContain('404 · Not Found');
    expect(links(html)).toEqual([['/admin/', 'Home']]);
  });

  it('coming from /admin/y, a link back to /admin/y, and none home', async () => {
    expect(links(await page('/admin/x', `${origin}/admin/y`))).toEqual([['/admin/y', 'Back']]);
  });
});
