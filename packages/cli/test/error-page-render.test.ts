/**
 * SDD-87 §3.6, criterion 20, and SDD-88 criterion 18: the page `fudic g error-page` writes, in
 * the app `fudic new` writes, compiles without a diagnostic and, painted by a real dev server of
 * that app under `/admin/`, is a document of the app's layout that links home with no way back,
 * and back with one. The page writes `data.home` and `data.back` as they come: both carry the base.
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
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

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

/** The files of `fudic new admin --locale es` plus its `g error-page`, as the CLI writes them. */
async function generated(): Promise<Record<string, string>> {
  const fs = new MemoryFs({}, '/w');
  for (const argv of [
    ['new', 'admin', '--locale', 'es', '--no-install', '--no-git', '--no-sw', '--cwd', '/w'],
    ['g', 'error-page', '--cwd', '/w/admin'],
  ]) {
    const capture = captureStreams();
    const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
    if (code !== 0) throw new Error(`fudic ${argv.join(' ')}: ${capture.stdout()}${capture.stderr()}`);
  }
  // The whole app but its configuration for a real install: the dev server below brings its own.
  const skip = new Set(['package.json', 'vite.config.ts', 'tsconfig.json', 'vitest.config.ts']);
  const app = fs.paths().filter((p) => p.startsWith('admin/') && !skip.has(p.slice('admin/'.length)));
  return Object.fromEntries(app.map((p) => [p.slice('admin/'.length), fs.at(p)]));
}

let files: Record<string, string>;

beforeAll(async () => {
  files = await generated();
}, 60000);

describe('the generated error page compiles (criterion 20, SDD-88 criterion 18)', () => {
  it('a route that links the layout of fudic new, with no diagnostic at all', () => {
    const page = files['src/routes/_error.fud']!;
    expect(page.startsWith('<link rel="layout" href="../layouts/_layout.fud">\n')).toBe(true);
    expect(page).not.toContain('<!DOCTYPE');
    expect(parseFud(page).doc.type).toBe('route-document');
    expect(parseFud(page).diagnostics).toEqual([]);
  });
});

describe('painted under /admin/ (criterion 20, SDD-88 criterion 18)', () => {
  let server: ViteDevServer;
  let origin: string;
  const page = async (path: string, referer?: string): Promise<string> =>
    (await fetch(`${origin}${path}`, { headers: { accept: 'text/html', ...(referer !== undefined ? { referer } : {}) } })).text();
  /** Each `<a>` of the page's own markup (the layout of `fudic new` links nothing): its href and its text. */
  const links = (html: string): string[][] => [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/gu)].map((m) => [m[1]!, m[2]!]);
  /** What a document carries before its body: the shell its layout writes. */
  const shell = (html: string): string =>
    html
      .slice(0, html.indexOf('<body'))
      .replace(/<title>[^<]*<\/title>/u, '')
      // Each page has the sheet of the guide pieces it adopts: the same link, its own hash.
      .replace(/(\/@fudic\/sheet\/guide)-[\w-]+\.css/gu, '$1.css');

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-error-page-render-'));
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
    await server?.close();
  });

  it('is the document of the layout, the same shell as a page of the app', async () => {
    const error = await page('/admin/x');
    const home = await page('/admin/');
    expect(error.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(error).toContain('<html lang="es"');
    // The layout's <head> (its meta), as the home page has it.
    expect(error).toContain('<meta name="viewport"');
    expect(home).toContain('<meta name="viewport"');
    expect(shell(error)).toBe(shell(home));
  });

  it('with no way back, a link home: /admin/', async () => {
    const html = await page('/admin/x');
    expect(html).toContain('404 · Not Found');
    expect(html).toContain('<title>404 · Not Found</title>');
    expect(links(html)).toEqual([['/admin/', 'Home']]);
  });

  it('coming from /admin/y, a link back to /admin/y, and none home', async () => {
    expect(links(await page('/admin/x', `${origin}/admin/y`))).toEqual([['/admin/y', 'Back']]);
  });
});
