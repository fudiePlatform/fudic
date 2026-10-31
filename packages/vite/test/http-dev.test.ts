/**
 * SDD-56 in a real Vite dev server: the server functions answer under `/_fudic/fn`, with the
 * global chain of `src/http.fudapi`; `load` runs through it with the request's container; and a
 * `load` that throws answers as §4.8 says — a redirect, or `_error.fud` with its status.
 *
 * Criteria 9, 21, 23, 27, 28, 29, 35 and 36, as a browser and a script would see them. In the
 * model of SDD-60: each route and component declares its server in a `.fudapi` beside it, and
 * `src/server` implements it with `.handle`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { framed } from './helpers/frames.js';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { binInit, binProblem, binQuery, binValue, type Ty } from './helpers/fud-bin.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

/** The package `@fudic/http`: its `fudapi/`, its compiled halves and its `dist`. */
const HTTP_PACKAGE = fileURLToPath(new URL('../../http', import.meta.url));

const USERS = `import { Service } from '@fudic/di';

export class Users {
  readonly list: string[] = ['ana', 'luis'];
  all(): string[] { return this.list; }
  find(q: string): string[] { return this.list.filter((n) => n.includes(q)); }
}
Service(Users);
`;

/**
 * The global chain (SDD-60 §3.5). `csrf` is `@fudic/http`'s, read off the `fudapi/` of a direct
 * dependency: the project lists it and carries it in `node_modules`, as an install leaves it.
 */
const HTTP = `chain
  use csrf
`;

/**
 * `@fudic/http` installed as a workspace links it (SDD-60 §3.10): the index reads its `fudapi/`
 * and the root loads its halves.
 */
function installHttp(root: string): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@fudic/http': '0.0.0' } }));
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  symlinkSync(HTTP_PACKAGE, join(root, 'node_modules', '@fudic', 'http'), 'junction');
}

const USUARIOS_API = `load
  count  i32

get search
  q  str
  -> str[]

delete remove

get crash
  -> str
`;

const USUARIOS = `<!DOCTYPE html>
<html>
<head>
<title>Usuarios</title>
<link rel="server" href="./usuarios.fudapi">
<link rel="component" href="../components/user-form.fud">
</head>
<body><p>usuarios: @data.count</p><user-form></user-form></body>
</html>
`;

const USUARIOS_SERVER = `import { inject } from '@fudic/di';
import { notFound } from '@fudic/http';
import { load, search, remove, crash } from 'fudic:routes/usuarios';
import { Users } from '../users';

load.handle(async () => ({ count: inject(Users).all().length }));
search.handle((ctx) => inject(Users).find(ctx.args.q));
remove.handle(() => {
  throw notFound('gone');
});
crash.handle((): string => {
  throw new Error('mal');
});
`;

const USER_FORM_API = `put save
  -> Saved

type Saved
  from   str
  count  i32
`;

const USER_FORM = `<link rel="server" href="./user-form.fudapi">

<user-form>
  <template shadowrootmode="open"><span>form</span></template>
</user-form>
`;

const USER_FORM_SERVER = `import { inject } from '@fudic/di';
import { save } from 'fudic:components/user-form';
import { Users } from '../users';

save.handle(() => ({ from: 'user-form', count: inject(Users).all().length }));
`;

/** A route whose `load` throws: its page, its `.fudapi` and its handler. */
const throwing = (
  name: string,
  body: string,
  imports = "import { notFound, redirect } from '@fudic/http';",
): Record<string, string> => ({
  [`src/routes/${name}.fud`]: `<!DOCTYPE html>
<html>
<head>
<title>x</title>
<link rel="server" href="./${name}.fudapi">
</head>
<body><p>@data.n</p></body>
</html>
`,
  [`src/routes/${name}.fudapi`]: 'load\n  n  i32\n',
  [`src/server/${name}.ts`]: `${imports}
import { load } from 'fudic:routes/${name}';

load.handle(async (): Promise<{ n: number }> => {
  ${body}
});
`,
});

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>status @data.status</h1><p>@data.title</p><p>detail: [@data.detail]</p><p>path: [@data.path]</p><p>back: [@data.back]</p></body>
</html>
`;

/** Each file under `root`, its folders made. */
function writeAll(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-http-dev-'));
  writeHttpTypecheckConfig(root);
  installHttp(root);
  writeAll(root, {
    'src/users.ts': USERS,
    'src/http.fudapi': HTTP,
    'src/routes/usuarios.fud': USUARIOS,
    'src/routes/usuarios.fudapi': USUARIOS_API,
    'src/server/usuarios.ts': USUARIOS_SERVER,
    'src/components/user-form.fud': USER_FORM,
    'src/components/user-form.fudapi': USER_FORM_API,
    'src/server/user-form.ts': USER_FORM_SERVER,
    ...throwing('missing', "throw notFound('no está');"),
    ...throwing('go', "throw redirect('/login');"),
    ...throwing('boom', "throw new Error('secreto');", ''),
    ...throwing('plain', "throw 'una cadena';", ''),
    ...throwing('nostack', "const e = new Error('sin pila');\n  e.stack = undefined;\n  throw e;", ''),
    'src/routes/_error.fud': ERROR_PAGE,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'test' }),
  });
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic({ liveCheck: false })],
    server: { port: 0 },
  });
  await server.listen();
  origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
  // The first request loads the server root (SDD-60 §4.4): here, not inside a case's 5 s.
  await fetch(`${origin}/_fudic/data/usuarios`);
}, 120000);

afterAll(async () => {
  await server.close();
});

const page = (path: string) => fetch(`${origin}${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
/** A navigation that comes from `referer`, as the browser says it. */
const refered = (path: string, referer: string) =>
  fetch(`${origin}${path}`, { headers: { accept: 'text/html', referer }, redirect: 'manual' });
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${origin}/_fudic/fn${path}`, { ...init, headers: { 'x-fudic-csrf': '1', ...(init.headers as Record<string, string>) } });

/** The canonical texts of SDD-67 §4.3 of these functions: the signatures their page sends. */
const SEARCH = 'route()|query()|body(q:str)|->str[]';
const REMOVE = 'route()|query()|body()|->';
const SAVE = 'route()|query()|body()|->{from:str,count:i32}';
const CRASH = 'route()|query()|body()|->str';
const SAVED: Ty = { fields: () => ({ from: 'str', count: 'i32' }) };

describe('server functions in dev, in fud-bin', () => {
  it('criterion 21: GET …/search?a=… returns what handle returned', async () => {
    const a = binQuery({ q: 'str' }, { q: 'an' });
    const res = await call(`/routes/usuarios/search?a=${a}`, binInit(SEARCH));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/fud+bin');
    expect(await binValue(res, { list: 'str' })).toEqual(['ana']);
  });

  it('criterion 23: a 404 thrown in handle comes back as a problem', async () => {
    const res = await call('/routes/usuarios/remove', binInit(REMOVE, {}, {}, { method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+fud');
    expect(await binProblem(res)).toEqual({ status: 404, title: 'Not Found', detail: 'gone' });
  });

  it('criterion 36: a component function, by its <id>, resolving inject from the request root', async () => {
    const res = await call('/components/user-form/save', binInit(SAVE, {}, {}, { method: 'PUT' }));
    expect(res.status).toBe(200);
    expect(await binValue(res, SAVED)).toEqual({ from: 'user-form', count: 2 });
  });

  it('criterion 8: a page built against another contract is a 412', async () => {
    const res = await call('/components/user-form/save', binInit(`${SAVE}?`, {}, {}, { method: 'PUT' }));
    expect(res.status).toBe(412);
    expect((await binProblem(res)).detail).toBe('the page is older than the server');
  });

  it('criterion 35: src/http.fudapi puts csrf in every chain', async () => {
    const bare = await fetch(`${origin}/_fudic/fn/components/user-form/save`, binInit(SAVE, {}, {}, { method: 'PUT' }));
    expect(bare.status).toBe(403);
    const cross = await call('/components/user-form/save', binInit(SAVE, {}, {}, { method: 'PUT', headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(cross.status).toBe(403);
    const foreign = await call('/components/user-form/save', binInit(SAVE, {}, {}, { method: 'PUT', headers: { origin: 'https://evil.test' } }));
    expect(foreign.status).toBe(403);
    // A GET without the header passes.
    const a = binQuery({ q: 'str' }, { q: 'l' });
    expect((await fetch(`${origin}/_fudic/fn/routes/usuarios/search?a=${a}`, binInit(SEARCH))).status).toBe(200);
  });

  it('a function that throws an Error: 500 with its message in dev', async () => {
    const res = await fetch(`${origin}/_fudic/fn/routes/usuarios/crash`, binInit(CRASH));
    expect(res.status).toBe(500);
    expect(await binProblem(res)).toEqual({ status: 500, title: 'Internal Server Error', detail: 'mal' });
  });

  it('criterion 14: an unknown function is a 404, in JSON to whoever accepts it; load, and the wrong verb', async () => {
    expect((await call('/routes/usuarios/nope')).status).toBe(404);
    const json = await call('/routes/usuarios/nope', { headers: { accept: 'application/json' } });
    expect(json.headers.get('content-type')).toBe('application/problem+json');
    expect(((await json.json()) as { detail?: string }).detail).toBe('no such server function');
    expect((await call('/routes/usuarios/nope')).headers.get('content-type')).toBe('application/problem+fud');
    expect((await call('/routes/usuarios/load')).status).toBe(404);
    expect((await call('/routes/usuarios/search', { method: 'POST', body: '{}' })).status).toBe(405);
  });
});

describe('load through the chain', () => {
  it('a page renders with the data its load injected', async () => {
    const res = await page('/usuarios');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('usuarios: 2');
  });

  it('criterion 9: the data endpoint runs only server halves — csrf.server lets the GET through', async () => {
    const res = await fetch(`${origin}/_fudic/data/usuarios`);
    expect(res.status).toBe(200);
    expect(await framed(res, { fields: { count: 'i32' } })).toEqual({ data: { count: 2 } });
  });

  it('the data endpoint answers the status of what load threw, as a problem', async () => {
    const missing = await fetch(`${origin}/_fudic/data/missing`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('application/problem+json');
    expect(await missing.json()).toEqual({ status: 404, title: 'Not Found', detail: 'no está' });

    const go = await fetch(`${origin}/_fudic/data/go`);
    expect(go.status).toBe(303);
    expect(await go.json()).toEqual({ status: 303, title: 'Redirect', location: '/login' });

    const boom = await fetch(`${origin}/_fudic/data/boom`);
    expect(boom.status).toBe(500);
    expect(((await boom.json()) as { detail?: string }).detail).toBe('secreto');
  });
});

describe('errors that reach a page (§4.8)', () => {
  it('criterion 27: load throwing notFound paints _error.fud with 404', async () => {
    const res = await page('/missing');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('status 404');
    expect(html).toContain('Not Found');
  });

  it('criterion 28: load throwing redirect answers 303 with Location', async () => {
    const res = await page('/go');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('anything else is _error.fud as a 500', async () => {
    const res = await page('/boom');
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('status 500');
  });

  it('a thrown value that is not an Error is a 500 too', async () => {
    const res = await page('/plain');
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('status 500');
  });

  it('an Error without a stack still goes to the overlay and answers 500', async () => {
    const sent: unknown[] = [];
    const original = server.ws.send.bind(server.ws);
    server.ws.send = ((payload: unknown) => {
      sent.push(payload);
    }) as typeof server.ws.send;
    try {
      const res = await page('/nostack');
      expect(res.status).toBe(500);
    } finally {
      server.ws.send = original;
    }
    expect(sent).toContainEqual({ type: 'error', err: { message: 'sin pila', stack: '' } });
  });

  it('criterion 29: /_fudic/error/500 paints _error.fud, and it is no route of its own', async () => {
    const res = await page('/_fudic/error/500');
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('status 500');
    const manifest = (await (await fetch(`${origin}/fudic-routes.json`)).json()) as { routes: { pattern: string }[] };
    expect(manifest.routes.map((r) => r.pattern)).not.toContain('/_fudic/error/:status');
    expect(manifest.routes.map((r) => r.pattern).some((p) => p.includes('_error'))).toBe(false);
  });

  it('criterion 14: nothing of the query of /_fudic/error/401 reaches the page', async () => {
    const res = await page('/_fudic/error/401?detail=Llama+al+900&back=https://evil.com');
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('status 401');
    expect(html).toContain('Unauthorized');
    expect(html).toContain('detail: []');
    expect(html).toContain('back: []');
    expect(html).not.toContain('900');
    expect(html).not.toContain('evil');
  });

  it('criterion 13: a call of /usuarios?p=2 that failed comes back to it, by the Referer', async () => {
    const html = await (await refered('/_fudic/error/401', `${origin}/usuarios?p=2`)).text();
    expect(html).toContain('path: [/usuarios]');
    expect(html).toContain('back: [/usuarios?p=2]');
  });

  it('criterion 13: no way back from another origin, a `\\` path or a Referer that is no URL', async () => {
    for (const referer of ['https://evil.com/usuarios', `${origin}/\\evil.com`, 'no es una url']) {
      expect(await (await refered('/_fudic/error/401', referer)).text()).toContain('back: []');
    }
  });

  it('criterion 12: load that throws paints the path asked for and the way back', async () => {
    const html = await (await refered('/missing', `${origin}/usuarios`)).text();
    expect(html).toContain('path: [/missing]');
    expect(html).toContain('back: [/usuarios]');
    expect(await (await page('/missing')).text()).toContain('back: []');
  });

  it('no route: _error.fud as a 404, with its path (SDD-73 §4.3)', async () => {
    const res = await page('/test');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('path: [/test]');
  });

  it('criterion 14: page responses state their Referrer-Policy', async () => {
    for (const path of ['/missing', '/_fudic/error/401', '/test']) {
      expect((await page(path)).headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    }
  });

  it('/_fudic/error/<not a 4xx or 5xx> is no error page', async () => {
    expect((await page('/_fudic/error/200')).status).toBe(404);
    expect((await page('/_fudic/error/abc')).status).toBe(404);
  });
});

describe('a project without _error.fud', () => {
  let bare: ViteDevServer;
  let bareOrigin: string;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-http-dev-bare-'));
    writeHttpTypecheckConfig(root);
    writeAll(root, {
      ...throwing('missing', "throw notFound('no está');"),
      'sw.json': JSON.stringify({ shell: [] }),
      'fudic.json': JSON.stringify({ id: 'bare' }),
    });
    bare = await createServer({
      root,
      logLevel: 'silent',
      resolve: { alias: httpAlias },
      plugins: [fudic({ liveCheck: false })],
      server: { port: 0 },
    });
    await bare.listen();
    bareOrigin = `http://localhost:${(bare.httpServer!.address() as AddressInfo).port}`;
    await fetch(`${bareOrigin}/_fudic/data/missing`); // loads the server root, as above
  }, 120000);

  afterAll(async () => {
    await bare.close();
  });

  it('criterion 27: the minimal page with the status', async () => {
    const res = await fetch(`${bareOrigin}/missing`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('Not Found');
  });

  it('and /_fudic/error/<status> is the minimal page too', async () => {
    const res = await fetch(`${bareOrigin}/_fudic/error/503`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Service Unavailable');
  });
});
