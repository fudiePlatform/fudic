/**
 * SDD-88 §3.5, §4.2, criteria 8-10 and 12 (the build and dev half): the error page is a page, and
 * every page links a layout. An `_error.fud` that is not a route is FUD1581 over its first line
 * and is not compiled as the error page, so the app paints its errors with the minimal page; a
 * whole document says FUD1580 and nothing else. A library's error page that links a layout of
 * the library paints with that layout in the app that uses it.
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
import { runtimeAlias } from './helpers/alias.js';
import { httpAlias } from './helpers/http-project.js';

const manifest = (name: string, deps: readonly string[] = []): string =>
  JSON.stringify({ name, version: '1.0.0', type: 'module', dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) }, null, 2);

/** A layout that says whose it is, in its own markup: the page painted with it carries `mark`. */
const layout = (mark: string): string => `<!DOCTYPE html>
<html lang="es">
<head>@RenderHead()</head>
<body><header data-layout="${mark}">${mark}</header>@RenderBody()</body>
</html>
`;

/** A library's page links its layout from `src/`; an app's, from `src/routes/`. */
const LIB_LAYOUT = './layouts/_layout.fud';
const APP_LAYOUT = '../layouts/_layout.fud';

const errorRoute = (who: string, href: string): string => `<link rel="layout" href="${href}">
<head><title>@data.status @data.title</title></head>
<h1>${who} @data.status</h1>
<a href=@data.home>Inicio</a>
`;

/** An `_error.fud` with no doctype and no layout link: shaped as plain markup. */
const NO_LAYOUT = '<h1>@data.status</h1>\n<p>@data.title</p>\n';

/** An `_error.fud` written as the page without a layout it used to be. */
const WHOLE = '<!DOCTYPE html>\n<html lang="es">\n<head><title>@data.status</title></head>\n<body><h1>@data.status</h1></body>\n</html>\n';

const INDEX = `<link rel="layout" href="${APP_LAYOUT}">
<head><title>Inicio</title></head>
<p>inicio</p>
`;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A workspace with the library `ui` and the app `admin`, which depends on it. Its root. */
function workspace(files: Readonly<Record<string, string>> = {}): string {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-error-layout-'));
  roots.push(ws);
  const tree: Record<string, string> = {
    'libs/ui/package.json': manifest('@acme/ui'),
    'libs/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
    'libs/ui/src/layouts/_layout.fud': layout('ui-layout'),
    'apps/admin/package.json': manifest('@acme/admin', ['@acme/ui']),
    'apps/admin/fudic.json': JSON.stringify({ kind: 'app', id: 'admin', prefix: 'adm' }),
    'apps/admin/src/routes/index.fud': INDEX,
    'apps/admin/src/layouts/_layout.fud': layout('admin-layout'),
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
  return ws;
}

const admin = (ws: string): string => join(ws, 'apps', 'admin');
const posix = (path: string): string => path.replace(/\\/gu, '/');
const discover = (ws: string) => discoverRoutes(admin(ws), resolveOptions({}).options);

describe('discoverRoutes: an error page that links no layout (criteria 8, 9)', () => {
  it('the app’s own: FUD1581 over its first line, on its file, and no error page', () => {
    const ws = workspace({ 'apps/admin/src/routes/_error.fud': NO_LAYOUT });
    const found = discover(ws);
    expect(found.errorPage).toBeUndefined();
    expect(found.errorPages).toEqual([]);
    const fud1581 = found.parse.filter((d) => d.code === 'FUD1581');
    expect(fud1581).toHaveLength(1);
    expect(posix(fud1581[0]!.file ?? "")).toBe(posix(join(admin(ws), 'src/routes/_error.fud')));
    expect(fud1581[0]!.span).toEqual({ start: 0, end: NO_LAYOUT.indexOf('\n') });
    expect(fud1581[0]!.severity).toBe('error');
    expect(fud1581[0]!.message).toContain('<link rel="layout"');
  });

  it('a one-line file: the span is the whole of it', () => {
    const one = '<h1>@data.status</h1>';
    const found = discover(workspace({ 'apps/admin/src/routes/_error.fud': one }));
    expect(found.parse.find((d) => d.code === 'FUD1581')?.span).toEqual({ start: 0, end: one.length });
  });

  it('a library’s: FUD1581 on the library’s file, no error page and no errorPageFrom', () => {
    const ws = workspace({ 'libs/ui/src/_error.fud': NO_LAYOUT });
    const found = discover(ws);
    expect(found.errorPage).toBeUndefined();
    expect(found).not.toHaveProperty('errorPageFrom');
    const fud1581 = found.parse.filter((d) => d.code === 'FUD1581');
    expect(fud1581).toHaveLength(1);
    expect(posix(fud1581[0]!.file ?? "")).toMatch(/\/libs\/ui\/src\/_error\.fud$/u);
  });
});

describe('discoverRoutes: an error page with a doctype (criterion 10)', () => {
  it('a whole document: FUD1580 over the doctype, and not FUD1581; no error page', () => {
    const ws = workspace({ 'apps/admin/src/routes/_error.fud': WHOLE });
    const found = discover(ws);
    expect(found.errorPage).toBeUndefined();
    const codes = found.parse.filter((d) => posix(d.file ?? "").endsWith('_error.fud')).map((d) => d.code);
    expect(codes).toEqual(['FUD1580']);
    expect(found.parse.find((d) => d.code === 'FUD1580')?.span).toEqual({ start: 0, end: '<!DOCTYPE html>'.length });
  });

  it('a well-formed layout is no error page either: FUD1581, not silence', () => {
    // A layout links no layout: the error page it was meant to be is not compiled, and the
    // build says why instead of painting the minimal page with nothing to show for it.
    const ws = workspace({ 'apps/admin/src/routes/_error.fud': layout('wrong') });
    const found = discover(ws);
    expect(found.errorPage).toBeUndefined();
    const codes = found.parse.filter((d) => posix(d.file ?? "").endsWith('_error.fud')).map((d) => d.code);
    expect(codes).toEqual(['FUD1581']);
    expect(found.parse.find((d) => d.code === 'FUD1581')?.span).toEqual({ start: 0, end: '<!DOCTYPE html>'.length });
    const lib = discover(workspace({ 'libs/ui/src/_error.fud': layout('wrong') }));
    expect(lib.errorPage).toBeUndefined();
    expect(lib.parse.map((d) => d.code)).toEqual(['FUD1581']);
  });

  it('a library’s whole document the same, on the library’s file', () => {
    const found = discover(workspace({ 'libs/ui/src/_error.fud': WHOLE }));
    expect(found.errorPage).toBeUndefined();
    expect(found).not.toHaveProperty('errorPageFrom');
    expect(found.parse.map((d) => d.code)).toEqual(['FUD1580']);
  });
});

describe('discoverRoutes: an error page that links a layout', () => {
  it('the app’s and a library’s are the error page, with nothing to say', () => {
    const own = discover(workspace({ 'apps/admin/src/routes/_error.fud': errorRoute('admin', APP_LAYOUT) }));
    expect(own.errorPage?.analysis.isPage).toBe(true);
    expect(own.parse).toEqual([]);
    const lib = discover(workspace({ 'libs/ui/src/_error.fud': errorRoute('ui', LIB_LAYOUT) }));
    expect(lib.errorPageFrom).toBe('@acme/ui');
    expect(lib.parse).toEqual([]);
  });
});

function quiet(errors: string[]): Logger {
  const noop = (): void => {};
  return {
    info: noop,
    warn: noop,
    warnOnce: noop,
    error: (message: string) => errors.push(message),
    clearScreen: noop,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
}

/** What the build said when it failed: its error and what it logged as errors (each diagnostic). */
async function buildAdmin(ws: string): Promise<string | undefined> {
  const errors: string[] = [];
  try {
    await build({
      root: admin(ws),
      logLevel: 'error',
      customLogger: quiet(errors),
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic({ liveCheck: false })],
      build: { write: false, minify: false },
    });
    return undefined;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error), ...errors].join('\n');
  }
}

describe('the build (criteria 8, 9)', () => {
  it('fails with FUD1581 for the app’s own error page without a layout', async () => {
    expect(await buildAdmin(workspace({ 'apps/admin/src/routes/_error.fud': NO_LAYOUT }))).toContain('FUD1581');
  }, 300000);

  it('fails with FUD1581 for the library’s, in the app that uses it', async () => {
    expect(await buildAdmin(workspace({ 'libs/ui/src/_error.fud': NO_LAYOUT }))).toContain('FUD1581');
  }, 300000);

  it('builds a library’s page that links the library’s layout', async () => {
    expect(await buildAdmin(workspace({ 'libs/ui/src/_error.fud': errorRoute('ui', LIB_LAYOUT) }))).toBeUndefined();
  }, 300000);
});

/** A layout with a required prop, which a route resolves with `layout` in its `.fudapi`. */
const AREA_LAYOUT = `<!DOCTYPE html>
<html lang="es">
<head>
  @code {
    const { area } = props<{ area: string }>();
  }
  @RenderHead()
</head>
<body><header data-area="@area">@area</header>@RenderBody()</body>
</html>
`;

describe('layout in _error.fudapi (criterion 11)', () => {
  const withArea = (extra: Readonly<Record<string, string>> = {}): string =>
    workspace({
      'apps/admin/src/layouts/_layout.fud': AREA_LAYOUT,
      'apps/admin/src/routes/index.fud': `<link rel="layout" href="${APP_LAYOUT}">\n<link rel="server" href="./index.fudapi">\n<p>inicio</p>\n`,
      'apps/admin/src/routes/index.fudapi': 'layout\n',
      'apps/admin/src/server/routes/index.ts': "import { layout } from 'fudic:routes/index';\n\nlayout.handle(() => ({ area: 'Inicio' }));\n",
      'apps/admin/src/routes/_error.fud': errorRoute('admin', APP_LAYOUT),
      ...extra,
    });

  it('an error page whose layout has a required prop, with no _error.fudapi: the build fails with FUD0702', async () => {
    expect(await buildAdmin(withArea())).toContain('FUD0702');
  }, 300000);

  it('with an _error.fudapi that declares layout, the build passes and dev paints what its handler returns', async () => {
    const ws = withArea({
      'apps/admin/src/routes/_error.fud': errorRoute('admin', APP_LAYOUT).replace(
        `<link rel="layout" href="${APP_LAYOUT}">\n`,
        `<link rel="layout" href="${APP_LAYOUT}">\n<link rel="server" href="./_error.fudapi">\n`,
      ),
      'apps/admin/src/routes/_error.fudapi': 'layout\n',
      // `data` is the error the page paints: its status reaches the layout.
      'apps/admin/src/server/routes/_error.ts': "import { layout } from 'fudic:routes/_error';\n\nlayout.handle((_ctx, data) => ({ area: `Error ${data.status}` }));\n",
    });
    expect(await buildAdmin(ws)).toBeUndefined();
    const server = await createServer({
      root: admin(ws),
      logLevel: 'silent',
      // The `.fudapi` modules import `@fudic/http/contract` and the server chain at runtime.
      resolve: { alias: httpAlias },
      plugins: [fudic({ liveCheck: false })],
      server: { port: 0 },
    });
    try {
      await server.listen();
      const origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
      await fetch(`${origin}/`, { headers: { accept: 'text/html' } });
      const res = await fetch(`${origin}/no-existe`, { headers: { accept: 'text/html' } });
      const html = await res.text();
      expect(res.status).toBe(404);
      expect(html).toContain('admin 404');
      expect(html).toContain('<header data-area="Error 404">Error 404</header>');
    } finally {
      await server.close();
    }
  }, 300000);
});

describe('dev: what the app paints (criteria 8, 12)', () => {
  let ws: string;
  let server: ViteDevServer;
  let origin: string;
  const page = async (path: string): Promise<{ status: number; html: string }> => {
    const res = await fetch(`${origin}${path}`, { headers: { accept: 'text/html' } });
    return { status: res.status, html: await res.text() };
  };

  beforeAll(async () => {
    ws = workspace({ 'apps/admin/src/routes/_error.fud': NO_LAYOUT });
    server = await createServer({
      root: admin(ws),
      base: '/admin/',
      logLevel: 'silent',
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

  it('an own _error.fud without a layout: a 404 with the minimal page, not that file', async () => {
    const res = await page('/admin/no-existe');
    expect(res.status).toBe(404);
    expect(res.html).toContain('<h1>404</h1>');
    expect(res.html).not.toContain('data-layout');
  });

  it('a library’s page that links the library’s layout paints with it (criterion 12)', async () => {
    rmSync(join(ws, 'apps/admin/src/routes/_error.fud'));
    writeFileSync(join(ws, 'libs/ui/src/_error.fud'), errorRoute('ui', LIB_LAYOUT));
    const res = await page('/admin/tampoco');
    expect(res.status).toBe(404);
    expect(res.html).toContain('ui 404');
    // The library's layout, resolved from the library's folder — not the app's.
    expect(res.html).toContain('data-layout="ui-layout"');
    expect(res.html).not.toContain('data-layout="admin-layout"');
    expect(res.html).toMatch(/^<!DOCTYPE html><html lang="es">/u);
    expect(res.html).toMatch(/<a href="\/admin\/">Inicio<\/a>/u);
  });
});
