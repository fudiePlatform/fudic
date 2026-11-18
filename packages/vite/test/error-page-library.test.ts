/**
 * SDD-87 §3.2, §3.8–§3.10, §4.1–§4.2, criteria 13–16: the error page a library offers, in a real
 * workspace. `discoverRoutes` compiles the page `errorPageOf` gives; the build says where it
 * comes from; two libraries are FUD1570; in dev, a library's page created later is painted on
 * the next request.
 *
 * The libraries are installed as pnpm installs them: links under the workspace root.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, type Logger, type ViteDevServer } from 'vite';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';
import { fudic } from '../src/index.js';
import { errorPageLine } from '../src/plugin.js';
import { runtimeAlias } from './helpers/alias.js';

const manifest = (name: string, deps: readonly string[] = []): string =>
  JSON.stringify({ name, version: '1.0.0', type: 'module', dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) }, null, 2);

/** Every page links a layout (SDD-88): each project of the workspace has this one. */
const LAYOUT = `<!DOCTYPE html>
<html lang="es">
<head>@RenderHead()</head>
<body>@RenderBody()</body>
</html>
`;

/** A library's page links its layout from `src/`; an app's, from `src/routes/`. */
const LIB_LAYOUT = './layouts/_layout.fud';
const APP_LAYOUT = '../layouts/_layout.fud';

/** What the page says is who painted it. */
const errorPage = (who: string, layout = LIB_LAYOUT): string => `<link rel="layout" href="${layout}">
<head><title>@data.status @data.title</title></head>
<h1>${who} @data.status</h1>
<a href=@data.home>Inicio</a>
`;

const INDEX = `<link rel="layout" href="${APP_LAYOUT}">
<head><title>Inicio</title></head>
<p>inicio</p>
`;

/** A workspace: `ui` and `marketing` libraries, and `admin` (depends on `deps`). Its root. */
function workspace(deps: readonly string[], files: Readonly<Record<string, string>> = {}, locales?: readonly string[]): string {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-error-lib-'));
  const tree: Record<string, string> = {
    'libs/ui/package.json': manifest('@acme/ui'),
    'libs/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
    'libs/marketing/package.json': manifest('@acme/marketing'),
    'libs/marketing/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'mk' }),
    'apps/admin/package.json': manifest('@acme/admin', deps),
    'apps/admin/fudic.json': JSON.stringify({ kind: 'app', id: 'admin', prefix: 'adm', ...(locales !== undefined ? { locales } : {}) }),
    'apps/admin/src/routes/index.fud': INDEX,
    'apps/admin/src/layouts/_layout.fud': LAYOUT,
    'libs/ui/src/layouts/_layout.fud': LAYOUT,
    'libs/marketing/src/layouts/_layout.fud': LAYOUT,
    ...files,
  };
  for (const [path, contents] of Object.entries(tree)) {
    const abs = join(ws, path);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
  }
  const modules = join(ws, 'node_modules', '@acme');
  mkdirSync(modules, { recursive: true });
  symlinkSync(join(ws, 'libs', 'ui'), join(modules, 'ui'), 'junction');
  symlinkSync(join(ws, 'libs', 'marketing'), join(modules, 'marketing'), 'junction');
  return ws;
}

const admin = (ws: string): string => join(ws, 'apps', 'admin');
const posix = (path: string): string => path.replace(/\\/gu, '/');
const discover = (ws: string, locales?: readonly string[]) =>
  discoverRoutes(admin(ws), resolveOptions({}).options, locales);

describe('discoverRoutes and the page of a library (criterion 13)', () => {
  it('library: compiles its src/_error.fud as the app’s, and errorPageFrom is its package', () => {
    const ws = workspace(['@acme/ui'], { 'libs/ui/src/_error.fud': errorPage('ui') });
    const found = discover(ws);
    expect(found.errorPageFrom).toBe('@acme/ui');
    expect(found.errorPage?.route.file).toBe('_error.fud');
    expect(found.errorPage?.route.pattern).toBe('/_fudic/error/:status');
    expect(posix(found.errorPage!.absPath)).toMatch(/\/libs\/ui\/src\/_error\.fud$/u);
    expect(found.errorPages).toHaveLength(1);
    expect(found.diagnostics).toEqual([]);
  });

  it('own: the app’s page, and no errorPageFrom, though its chain has one', () => {
    const ws = workspace(['@acme/ui'], {
      'libs/ui/src/_error.fud': errorPage('ui'),
      'apps/admin/src/routes/_error.fud': errorPage('admin', APP_LAYOUT),
    });
    const found = discover(ws);
    expect(found).not.toHaveProperty('errorPageFrom');
    expect(posix(found.errorPage!.absPath)).toBe(posix(join(admin(ws), 'src/routes/_error.fud')));
  });

  it('ambiguous: FUD1570 on the app’s fudic.json, naming the packages and their files, and no page', () => {
    const ws = workspace(['@acme/ui', '@acme/marketing'], {
      'libs/ui/src/_error.fud': errorPage('ui'),
      'libs/marketing/src/_error.fud': errorPage('marketing'),
    });
    const found = discover(ws);
    expect(found.errorPage).toBeUndefined();
    expect(found.errorPages).toEqual([]);
    expect(found).not.toHaveProperty('errorPageFrom');
    const [d] = found.diagnostics;
    expect(found.diagnostics).toHaveLength(1);
    expect(d!.code).toBe('FUD1570');
    expect(d!.severity).toBe('error');
    expect(posix(d!.file)).toBe(posix(join(admin(ws), 'fudic.json')));
    expect(d!.message).toContain('@acme/ui at ../../libs/ui/src/_error.fud');
    expect(d!.message).toContain('@acme/marketing at ../../libs/marketing/src/_error.fud');
    expect(d!.message).toContain('fudic g error-page');
  });

  it('the library itself: its own src/_error.fud, read where it is, with no routes folder', () => {
    const ws = workspace([], { 'libs/ui/src/_error.fud': errorPage('ui') });
    const found = discoverRoutes(join(ws, 'libs', 'ui'), resolveOptions({}).options);
    expect(found).not.toHaveProperty('errorPageFrom');
    expect(posix(found.errorPage!.absPath)).toMatch(/\/libs\/ui\/src\/_error\.fud$/u);
    expect(found.diagnostics).toEqual([]);
    expect(found.parse).toEqual([]);
  });

  it('none: no page, no diagnostic', () => {
    const found = discover(workspace(['@acme/ui']));
    expect(found.errorPage).toBeUndefined();
    expect(found.diagnostics).toEqual([]);
  });

  it('with locales es and en, the library’s page once per locale (criterion 14)', () => {
    const ws = workspace(['@acme/ui'], { 'libs/ui/src/_error.fud': errorPage('ui') }, ['es', 'en']);
    const found = discover(ws, ['es', 'en']);
    expect(found.errorPages).toHaveLength(2);
    for (const page of found.errorPages) expect(posix(page.absPath)).toMatch(/\/libs\/ui\/src\/_error\.fud$/u);
    expect(found.errorPageFrom).toBe('@acme/ui');
  });
});

describe('errorPageLine (criterion 16)', () => {
  it('names the package and the file, relative to the app', () => {
    const ws = workspace(['@acme/ui'], { 'libs/ui/src/_error.fud': errorPage('ui') });
    expect(errorPageLine(discover(ws), admin(ws))).toBe('fudic: error page from @acme/ui (../../libs/ui/src/_error.fud)');
  });

  it('says nothing with the app’s own page or with none', () => {
    const own = workspace(['@acme/ui'], { 'apps/admin/src/routes/_error.fud': errorPage('admin', APP_LAYOUT), 'libs/ui/src/_error.fud': errorPage('ui') });
    expect(errorPageLine(discover(own), admin(own))).toBeUndefined();
    const none = workspace(['@acme/ui']);
    expect(errorPageLine(discover(none), admin(none))).toBeUndefined();
  });
});

function recorder(infos: string[]): Logger {
  const noop = (): void => {};
  return {
    info: (message: string) => infos.push(message),
    warn: noop,
    warnOnce: noop,
    error: noop,
    clearScreen: noop,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
}

async function buildAdmin(ws: string): Promise<{ readonly infos: readonly string[]; readonly error?: string }> {
  const infos: string[] = [];
  try {
    await build({
      root: admin(ws),
      logLevel: 'info',
      customLogger: recorder(infos),
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic({ liveCheck: false })],
      build: { write: false, minify: false },
    });
    return { infos };
  } catch (error) {
    return { infos, error: error instanceof Error ? error.message : String(error) };
  }
}

const LINE = 'fudic: error page from @acme/ui (../../libs/ui/src/_error.fud)';

describe('the build says where the error page comes from (criterion 16)', () => {
  it('with a library’s page: the line', async () => {
    const built = await buildAdmin(workspace(['@acme/ui'], { 'libs/ui/src/_error.fud': errorPage('ui') }));
    expect(built.error).toBeUndefined();
    expect(built.infos).toContain(LINE);
  }, 300000);

  it('with its own page or with none: no such line', async () => {
    const own = await buildAdmin(
      workspace(['@acme/ui'], { 'libs/ui/src/_error.fud': errorPage('ui'), 'apps/admin/src/routes/_error.fud': errorPage('admin', APP_LAYOUT) }),
    );
    expect(own.error).toBeUndefined();
    const none = await buildAdmin(workspace(['@acme/ui']));
    expect(none.error).toBeUndefined();
    for (const built of [own, none]) expect(built.infos.some((l) => l.includes('error page from'))).toBe(false);
  }, 300000);

  it('two libraries and none of the app’s: the build fails with FUD1570', async () => {
    const built = await buildAdmin(
      workspace(['@acme/ui', '@acme/marketing'], {
        'libs/ui/src/_error.fud': errorPage('ui'),
        'libs/marketing/src/_error.fud': errorPage('marketing'),
      }),
    );
    expect(built.error).toContain('FUD1570');
  }, 300000);
});

describe('dev: the page of a library, created while the server runs (criterion 15)', () => {
  let ws: string;
  let server: ViteDevServer;
  let origin: string;
  const infos: string[] = [];
  const page = async (path: string): Promise<{ status: number; html: string }> => {
    const res = await fetch(`${origin}${path}`, { headers: { accept: 'text/html' } });
    return { status: res.status, html: await res.text() };
  };

  beforeAll(async () => {
    ws = workspace(['@acme/ui']);
    server = await createServer({
      root: admin(ws),
      base: '/admin/',
      logLevel: 'info',
      customLogger: recorder(infos),
      resolve: { alias: { ...runtimeAlias } },
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

  it('without it, the minimal page', async () => {
    const res = await page('/admin/no-existe');
    expect(res.status).toBe(404);
    expect(res.html).toContain('<h1>404</h1>');
  });

  it('created in the library, the next URL that does not exist paints it, with the app’s home', async () => {
    mkdirSync(join(ws, 'libs/ui/src'), { recursive: true });
    writeFileSync(join(ws, 'libs/ui/src/_error.fud'), errorPage('ui'));
    const res = await page('/admin/tampoco');
    expect(res.status).toBe(404);
    expect(res.html).toContain('ui 404');
    expect(res.html).toMatch(/<a href="\/admin\/">Inicio<\/a>/u);
  });

  it('and removed, the minimal page again', async () => {
    rmSync(join(ws, 'libs/ui/src/_error.fud'));
    const res = await page('/admin/otra-vez');
    expect(res.status).toBe(404);
    expect(res.html).toContain('<h1>404</h1>');
    expect(res.html).not.toContain('ui 404');
  });
});
