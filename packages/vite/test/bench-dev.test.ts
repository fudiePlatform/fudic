/**
 * SDD-82 §3.8 and §4.2 in a real Vite dev server: with the workbench's hooks installed, a
 * request that carries a criterion's cookie gets what its fixture says — the `data` of the page
 * in place of `load`, in order across data requests; the answers of its functions without their
 * handlers; its services in the root of every request; its clock in the server's `Date` — and
 * the `layout` always for real, with the data it is handed. Every call is logged. A request
 * without the cookie is the app as it always was.
 *
 * Criteria 10–14, 16, 18 and 23 as a browser would see them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { createBench, fudic, installBench, type Bench } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const HTTP_PACKAGE = fileURLToPath(new URL('../../http', import.meta.url));

const FILES: Readonly<Record<string, string>> = {
  'src/http.fudapi': 'chain\n  use json\n',
  'src/users.ts': `import { Service } from '@fudic/di';

export class Users {
  readonly list: string[] = ['real'];
  all(): string[] { return this.list; }
}
Service(Users);
`,
  'src/_layout.fud': `<!DOCTYPE html>
<html lang="@culture">
<head>
@code {
  const { culture } = props<{ culture: string }>();
}
@RenderHead()
</head>
<body><main>@RenderBody()</main></body>
</html>
`,
  'src/routes/usuarios.fud': `<link rel="layout" href="../_layout.fud">
<link rel="server" href="./usuarios.fudapi">

<head><title>Usuarios</title></head>

<h1>@data.title</h1>
<ul>@foreach (const u of data.users) key (u) { <li>@u</li> }</ul>
@await data.total {
  <p class="total">total @data.total</p>
}
`,
  'src/routes/usuarios.fudapi': `load
  title  str
  lang   str
  users  str[]
  total  i32  later

layout

get search
  q  str
  -> str[]

put save
  name  str
  -> str
  fails ana 409 "A Ana no."

get exportar
  -> file

get clock
  -> str
`,
  'src/server/usuarios.ts': `import { inject } from '@fudic/di';
import { load, layout, search, save, exportar, clock } from 'fudic:routes/usuarios';
import { Users } from '../users';

load.handle(() => ({ title: 'de verdad', lang: 'es', users: inject(Users).all(), total: Promise.resolve(1) }));
layout.handle((_ctx, data) => ({ culture: data.lang }));
search.handle((ctx) => inject(Users).all().filter((u) => u.includes(ctx.args.q)));
save.handle(() => 'guardado de verdad');
exportar.handle(() => new File(['real'], 'real.csv', { type: 'text/csv' }));
clock.handle(() => new Date().toISOString());
`,
  'src/routes/_error.fud': `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>status @data.status</h1><p>@data.title</p></body>
</html>
`,
  'fudic.json': JSON.stringify({ id: 'bench' }),
};

let server: ViteDevServer;
let origin: string;
let bench: Bench;
let uninstall: () => void;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fudic-bench-dev-'));
  writeHttpTypecheckConfig(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@fudic/http': '0.0.0' } }));
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  symlinkSync(HTTP_PACKAGE, join(root, 'node_modules', '@fudic', 'http'), 'junction');
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, 'src/fixtures'), { recursive: true });
  writeFileSync(join(root, 'src/fixtures/personas.csv'), 'nombre\nana\n');
  bench = createBench();
  uninstall = installBench(bench);
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic({ liveCheck: false })],
    server: { port: 0 },
  });
  await server.listen();
  origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
  // The first request loads the server root (SDD-60 §4.4): here, not inside a case.
  await (await fetch(`${origin}/_fudic/data/usuarios`)).arrayBuffer();
}, 120000);

afterAll(async () => {
  await server.close();
  uninstall();
});

let n = 0;
/** A criterion begun with `setup`: its cookie. */
function criterion(setup: Parameters<Bench['begin']>[1]): { readonly id: string; readonly cookie: string } {
  const id = `run.c${++n}`;
  bench.begin(id, { route: 'routes/usuarios', dir: join(root, 'src/routes'), ...setup });
  return { id, cookie: `fudic-bench=${id}` };
}

const page = (cookie?: string) =>
  fetch(`${origin}/usuarios`, { headers: { accept: 'text/html', ...(cookie !== undefined ? { cookie } : {}) }, redirect: 'manual' });
const json = (name: string, cookie: string | undefined, init: RequestInit = {}, query = '') =>
  fetch(`${origin}/_fudic/fn/routes/usuarios/${name}${query}`, {
    ...init,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(cookie !== undefined ? { cookie } : {}) },
  });
const search = (q: string, cookie?: string) => json('search', cookie, {}, `?a=${encodeURIComponent(JSON.stringify({ q }))}`);

describe('a page of a criterion (criteria 10–12, 14, 16)', () => {
  it('criterion 10: its data paints the page without load; without the cookie, load runs', async () => {
    const c = criterion({ data: [{ title: 'Usuarios', lang: 'es', users: ['ana', 'luis'], total: 2 }] });
    const html = await (await page(c.cookie)).text();
    expect(html).toContain('<h1>Usuarios</h1>');
    expect(html).toMatch(/<li>ana<\/li>\s*<li>luis<\/li>/u);
    expect(html).toContain('total 2');
    const real = await (await page()).text();
    expect(real).toContain('<h1>de verdad</h1>');
  });

  it('criterion 16: the layout runs for real, with the fixture data', async () => {
    const c = criterion({ data: [{ title: 'Posts', lang: 'en', users: [], total: 0 }] });
    expect(await (await page(c.cookie)).text()).toMatch(/<html lang="en"/u);
  });

  it('criterion 11: a data request after the first takes the next data', async () => {
    const c = criterion({ data: [{ title: 'uno', lang: 'es', users: [], total: 0 }, { title: 'dos', lang: 'es', users: [], total: 0 }] });
    expect(await (await page(c.cookie)).text()).toContain('<h1>uno</h1>');
    const again = await fetch(`${origin}/_fudic/data/usuarios`, { headers: { cookie: c.cookie } });
    expect(again.status).toBe(200);
    // The frames carry the title as its UTF-8 bytes.
    expect(await again.text()).toContain('dos');
  });

  it('criterion 12: a failure is the error page with its status; a redirect, its 303', async () => {
    const failing = criterion({ data: [{ $fails: { status: 503, title: 'la base de datos no responde' } }] });
    const down = await page(failing.cookie);
    expect(down.status).toBe(503);
    expect(await down.text()).toContain('status 503');
    const redirecting = criterion({ data: [{ $redirects: '/entrar', status: 303 }] });
    const moved = await page(redirecting.cookie);
    expect(moved.status).toBe(303);
    expect(moved.headers.get('location')).toBe('/entrar');
    await moved.arrayBuffer();
  });

  it('criterion 14: a later field waits on the criterion clock', async () => {
    const c = criterion({ clock: 0, data: [{ title: 'espera', lang: 'es', users: [], total: { $later: 2000, value: 7 } }] });
    const response = page(c.cookie);
    // Nothing settles until the clock gets there.
    await new Promise((r) => setTimeout(r, 300));
    bench.advance(c.id, 2000);
    expect(await (await response).text()).toContain('total 7');
  });
});

describe('the functions of a criterion (criteria 13, 18, 23)', () => {
  it('criterion 13: the fixture answers search without its handler; save runs for real; both logged', async () => {
    const c = criterion({ answers: { search: ['luis'] } });
    expect(await (await search('lu', c.cookie)).json()).toEqual(['luis']);
    const saved = await json('save', c.cookie, { method: 'PUT', body: JSON.stringify({ name: 'marta' }) });
    expect(await saved.json()).toBe('guardado de verdad');
    expect(bench.calls(c.id)).toEqual([
      { id: 'routes/usuarios', name: 'search', args: { q: 'lu' }, faked: true, status: 200 },
      { id: 'routes/usuarios', name: 'save', args: { name: 'marta' }, faked: false, status: 200 },
    ]);
  });

  it('fails by a declared code: its status and its code', async () => {
    const c = criterion({ answers: { save: { $fails: { code: 'ana' } } } });
    const res = await json('save', c.cookie, { method: 'PUT', body: JSON.stringify({ name: 'ana' }) });
    expect(res.status).toBe(409);
    expect(res.headers.get('fud-code')).toBe('ana');
    await res.arrayBuffer();
  });

  it('criterion 18: a file(…) of the fixture is the body of a -> file function', async () => {
    const c = criterion({ answers: { exportar: { $file: '../fixtures/personas.csv', type: 'text/csv' } } });
    const res = await json('exportar', c.cookie);
    expect(res.headers.get('content-type')).toBe('text/csv');
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''personas.csv");
    expect(await res.text()).toBe('nombre\nana\n');
  });

  it('criterion 23: fails(0) cuts the connection', async () => {
    const c = criterion({ answers: { save: { $fails: { status: 0, title: 'network' } } } });
    await expect(json('save', c.cookie, { method: 'PUT', body: JSON.stringify({ name: 'x' }) })).rejects.toThrow();
    expect(bench.calls(c.id)).toMatchObject([{ name: 'save', faked: true, status: 0 }]);
  });
});

describe('the services and the clock of a criterion', () => {
  it('its services answer the page and the functions; each made once for the criterion', async () => {
    // The class the server's graph holds: what `inject(Users)` asks for there.
    const { Users } = (await server.ssrLoadModule(join(root, 'src/users.ts'))) as { Users: new () => { list: string[] } };
    let made = 0;
    const c = criterion({ data: [], services: [{ provide: Users, use: () => (made++, { list: ['memoria'], all: () => ['memoria'] }) }] });
    expect(await (await page(c.cookie)).text()).toContain('<li>memoria</li>');
    expect(await (await search('mem', c.cookie)).json()).toEqual(['memoria']);
    expect(made).toBe(1);
    // Another request, without the cookie, is the real one.
    expect(await (await search('re')).json()).toEqual(['real']);
  });

  it('the server Date reads its clock', async () => {
    const at = Date.parse('2026-11-08T10:00:00Z');
    const c = criterion({ clock: at });
    expect(await (await json('clock', c.cookie)).json()).toBe('2026-11-08T10:00:00.000Z');
    bench.advance(c.id, 1000);
    expect(await (await json('clock', c.cookie)).json()).toBe('2026-11-08T10:00:01.000Z');
    expect(await (await json('clock', undefined)).json()).not.toBe('2026-11-08T10:00:01.000Z');
  });
});
