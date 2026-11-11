/**
 * `fudic_call` and `fudic_preview` from end to end (SDD-78 criteria 7–10): a client of the server,
 * over an app of `fudic new` with a route that has `paths()`, functions with and without a
 * handler, a form rule and a middleware that wants a session; the project's own Vite, in process.
 * Over HTTP, the door with the real dev server behind it, HMR included. Slow: every call and
 * every list of routes is a run of the project's vitest.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer as createNetServer, type Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { cookieValue } from '../src/gate.js';
import { startHttp, type HttpEntry } from '../src/http.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { HttpSite, stdioSite, type Site } from '../src/site.js';
import { connect, newApp } from './helpers.js';

const HANDLERS = [
  "import { unauthorized } from '@fudic/http';",
  "import { auth } from 'fudic:middlewares/auth';",
  "import { load, paths } from 'fudic:routes/productos/[id]';",
  "import { mine, search } from 'fudic:routes/productos';",
  '',
  'auth.server(() => {',
  "  throw unauthorized('no session');",
  '});',
  '',
  'load.handle((ctx) => {',
  "  if (ctx.params.id === 'roto') throw new Error('the database is down');",
  '  return { name: `Producto ${ctx.params.id}` };',
  '});',
  '',
  "paths.handle(() => ['1', '2']);",
  '',
  'search.handle((ctx) => [`${ctx.args.q} 1`, `${ctx.args.q} 2`]);',
  '',
  "mine.handle(() => 'never');",
  '',
].join('\n');

const FILES: Readonly<Record<string, string>> = {
  'src/routes/productos.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./productos.fudapi">\n\n<h1>Productos</h1>\n',
  'src/routes/productos.fudapi': ['get search', '  q  str', '    max-length 5', '  -> str[]', '', 'get mine', '  use auth', '  -> str', '', 'post fresh', '  -> str', ''].join('\n'),
  'src/routes/productos/[id].fud': '<link rel="layout" href="../../layouts/_layout.fud">\n<link rel="server" href="./[id].fudapi">\n\n<h1>@data.name</h1>\n',
  'src/routes/productos/[id].fudapi': 'load\n  name  str\n\npaths\n',
  // Its fixture (SDD-82 §3.4), typed by the route's `.fudapi`: what fudic_preview opens it with.
  'src/routes/productos/[id].fixture.ts':
    "import type { Fixtures } from 'fudic:routes/productos/[id]';\n\nexport default { data: { vacio: { name: 'Vacío' } } } satisfies Fixtures;\n",
  'src/routes/clientes/[id].fud': '<link rel="layout" href="../../layouts/_layout.fud">\n\n<h1>Cliente</h1>\n',
  'src/middlewares/auth.fudapi': 'middleware auth\n  server\n',
  'src/server/handlers.ts': HANDLERS,
};

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function writeAll(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  // `max-length` is a rule of @fudic/forms: the app depends on it, as one that uses it would.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  writeFileSync(join(root, 'package.json'), JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, '@fudic/forms': 'workspace:*' } }, null, 2));
}

const SLOW = 300_000;

interface Called {
  readonly body: Record<string, unknown>;
  readonly isError: boolean;
  readonly diagnostics: readonly { code: string; message: string; at?: string }[];
}

async function callOn(client: Client, name: string, args: Record<string, unknown>): Promise<Called> {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 280_000 });
  const body = result.structuredContent as Record<string, unknown>;
  return { body, isError: result.isError === true, diagnostics: body['diagnostics'] as Called['diagnostics'] };
}

describe('over stdio', () => {
  let app: { readonly root: string; dispose(): void };
  let site: Site;
  let client: Client;
  const call = (args: Record<string, unknown>) => callOn(client, 'fudic_call', args);
  const preview = (args: Record<string, unknown> = {}) => callOn(client, 'fudic_preview', args);

  beforeAll(async () => {
    app = await newApp();
    writeAll(app.root, FILES);
    site = stdioSite(app.root, await freePort());
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio', site }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await site.dev.close();
    app.dispose();
  });

  it('the project is clean before anything is called', async () => {
    const r = await callOn(client, 'fudic_check', {});
    expect(r.diagnostics).toEqual([]);
  }, SLOW);

  describe('fudic_preview (criteria 8 and 10)', () => {
    it('starts the dev server once and reuses it; routes lists the static ones and those of paths()', async () => {
      const first = await preview();
      expect(first.isError).toBe(false);
      const local = site.dev.local!;
      expect(local).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect(first.body).toMatchObject({ state: 'ready', local: `${local}/` });
      expect(first.body).not.toHaveProperty('public');
      expect([...(first.body['routes'] as string[])].sort()).toEqual(['/', '/productos', '/productos/1', '/productos/2']);
      expect(first.body['next']).toBe(
        'Give the user the local URL. Opening it is how they see the app; it does not approve anything. /clientes/:id has params and no paths(): open it with concrete values.',
      );

      const second = await preview({ route: '/productos/2' });
      expect(site.dev.local).toBe(local);
      expect(second.body).toMatchObject({ state: 'ready', local: `${local}/productos/2` });

      // What it serves is the app.
      const page = await fetch(`${local}/productos/1`, { headers: { accept: 'text/html' } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('Producto 1');
    }, SLOW);

    it("with its fixture: the URL hands the browser the criterion, the page is the fixture's; without, the real one again (SDD-82 criterion 37)", async () => {
      const local = site.dev.local!;
      const r = await preview({ route: '/productos/1', fixture: { data: 'vacio' } });
      expect(r.isError).toBe(false);
      const url = r.body['local'] as string;
      expect(url).toMatch(new RegExp(`^${local}/_fudic/preview-fixture/preview-\\d+\\?to=%2Fproductos%2F1$`, 'u'));
      const door = await fetch(url, { redirect: 'manual' });
      expect(door.status).toBe(303);
      expect(door.headers.get('location')).toBe('/productos/1');
      const cookie = door.headers.get('set-cookie')!.split(';')[0]!;
      const html = async (headers: Record<string, string> = {}): Promise<string> =>
        (await fetch(`${local}/productos/1`, { headers: { accept: 'text/html', ...headers } })).text();
      expect(await html({ cookie })).toContain('Vacío');
      expect(await html()).toContain('Producto 1');
      await preview({ route: '/productos/1' });
      expect(await html({ cookie })).toContain('Producto 1');
    }, SLOW);

    it('a route no route answers: FUD1422; a pattern: FUD1422 with its paths()', async () => {
      const none = await preview({ route: '/nada' });
      expect(none.isError).toBe(true);
      expect(none.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1422', message: '/nada is not a concrete URL of a route' })]);
      const pattern = await preview({ route: '/productos/:id' });
      expect(pattern.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1422', message: expect.stringContaining('try one of: /productos/1, /productos/2') })]);
    }, SLOW);

    it('a handler that throws while it runs: once, in the next call, as FUD1425 at the throw', async () => {
      const local = site.dev.local!;
      const page = await fetch(`${local}/productos/roto`, { headers: { accept: 'text/html' } });
      expect(page.status).toBe(500);
      const next = await preview();
      expect(next.diagnostics).toEqual([
        expect.objectContaining({ code: 'FUD1425', message: 'the server failed while previewing: the database is down', at: expect.stringMatching(/^src\/server\/handlers\.ts:11:/u) }),
      ]);
      expect((await preview()).diagnostics).toEqual([]);
    }, SLOW);
  });

  describe('fudic_call (criterion 7)', () => {
    it('a function with a handler: its value', async () => {
      const r = await call({ fn: 'routes/productos.search', args: { q: 'mesa' } });
      expect(r.isError).toBe(false);
      expect(r.body).toMatchObject({ fn: 'routes/productos.search', status: 200, value: ['mesa 1', 'mesa 2'], next: null });
    }, SLOW);

    it('arguments the form\'s rule refuses: its Problem, with no isError', async () => {
      const r = await call({ fn: 'routes/productos.search', args: { q: 'demasiado largo' } });
      expect(r.isError).toBe(false);
      expect(r.body).toMatchObject({ fn: 'routes/productos.search', problem: expect.objectContaining({ status: r.body['status'] }) });
      expect(r.body['status']).toBeGreaterThanOrEqual(400);
      expect(r.body['status']).toBeLessThan(500);
      expect(r.body['next']).toBeNull();
    }, SLOW);

    it('a function behind a session middleware, called with none: its 401', async () => {
      const r = await call({ fn: 'routes/productos.mine' });
      expect(r.isError).toBe(false);
      expect(r.body).toMatchObject({ status: 401, problem: expect.objectContaining({ status: 401 }), next: null });
    }, SLOW);

    it('a missing one: FUD1423 without calling; one that does not exist: FUD1405 with the closest', async () => {
      const missing = await call({ fn: 'routes/productos.fresh' });
      expect(missing.isError).toBe(true);
      expect(missing.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1423', message: 'routes/productos.fresh has no handler yet' })]);
      expect(missing.body['next']).toBe('fudic_contract { id: "routes/productos" } says what to write.');
      const none = await call({ fn: 'routes/productos.serch' });
      expect(none.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1405', message: expect.stringContaining('did you mean routes/productos.search?') })]);
    }, SLOW);
  });
});

describe('over HTTP (criterion 9)', () => {
  const SECRET = 'c'.repeat(64);
  let app: { readonly root: string; dispose(): void };
  let site: HttpSite;
  let entry: HttpEntry;
  let origin: string;
  let client: Client;

  beforeAll(async () => {
    app = await newApp();
    writeAll(app.root, FILES);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    site = new HttpSite(app.root, SECRET, port);
    const project = openProject(app.root, () => 'b59fa7d');
    entry = await startHttp({ port, secret: SECRET, app: site.dev, create: () => createServer({ project, entry: 'http', site }) });
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const { Client: SdkClient } = await import('@modelcontextprotocol/sdk/client/index.js');
    client = new SdkClient({ name: 'chat', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(entry.url)));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await entry.close();
    await site.dev.close();
    app.dispose();
  });

  const COOKIE = (): string => `fudic-preview=${cookieValue(SECRET)}`;
  const get = (path: string, headers: Record<string, string> = {}) => fetch(`${origin}${path}`, { headers: { accept: 'text/html', ...headers }, redirect: 'manual' });

  it('the preview answers the door\'s URL; the app answers only with its cookie, the MCP all along', async () => {
    const r = await callOn(client, 'fudic_preview', { route: '/productos' });
    expect(r.body).toMatchObject({ state: 'ready', local: `${origin}/_fudic/preview/${SECRET}?to=/productos` });

    expect((await get('/productos')).status).toBe(404);
    const door = await get(`/_fudic/preview/${SECRET}?to=/productos`);
    expect(door.status).toBe(302);
    expect(door.headers.get('location')).toBe('/productos');
    const cookie = door.headers.get('set-cookie')!.split(';')[0]!;
    expect(cookie).toBe(COOKIE());
    const page = await get('/productos', { cookie });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<h1>Productos</h1>');

    // Another secret opens nothing.
    expect((await get(`/_fudic/preview/${'d'.repeat(64)}?to=/productos`)).status).toBe(404);
    expect((await get('/productos', { cookie: `fudic-preview=${cookieValue('d'.repeat(64))}` })).status).toBe(404);

    // The MCP, at the same time.
    expect((await callOn(client, 'fudic_guide', { topic: 'overview' })).body).toMatchObject({ topic: 'overview' });
  }, SLOW);

  it('HMR connects through the door; without the cookie the socket is cut', async () => {
    await callOn(client, 'fudic_preview', {});
    const hmr = (headers: Record<string, string>): Promise<string> =>
      new Promise((resolve) => {
        const req = request(`${origin}/`, {
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-version': '13',
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'sec-websocket-protocol': 'vite-hmr',
            ...headers,
          },
        });
        req.on('upgrade', (res, socket: Socket) => {
          socket.destroy();
          resolve(String(res.statusCode));
        });
        req.on('response', (res) => resolve(`response ${res.statusCode}`));
        req.on('error', () => resolve('cut'));
        req.end();
      });
    expect(await hmr({ cookie: COOKIE() })).toBe('101');
    expect(await hmr({})).toBe('cut');
  }, SLOW);

  it('a call goes through the door with its cookie', async () => {
    const r = await callOn(client, 'fudic_call', { fn: 'routes/productos.search', args: { q: 'silla' } });
    expect(r.body).toMatchObject({ status: 200, value: ['silla 1', 'silla 2'] });
  }, SLOW);
});

describe('a vite.config that is broken (criterion 10)', () => {
  let app: { readonly root: string; dispose(): void };
  let site: Site;
  let client: Client;

  beforeAll(async () => {
    app = await newApp();
    writeAll(app.root, FILES);
    const config = join(app.root, 'vite.config.ts');
    writeFileSync(config, `${readFileSync(config, 'utf8')}\nthrow new Error('the config is broken');\n`);
    site = stdioSite(app.root, await freePort());
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio', site }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await site.dev.close();
    app.dispose();
  });

  it('state "failed" and FUD1424 with what Vite said', async () => {
    const r = await callOn(client, 'fudic_preview', {});
    expect(r.isError).toBe(true);
    expect(r.body).toMatchObject({ state: 'failed' });
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1424', message: expect.stringContaining('the config is broken') })]);
  }, SLOW);
});
