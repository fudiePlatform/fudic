/**
 * SDD-56 in a real Vite dev server: the server functions answer under `/_fudic/fn`, with the
 * global chain of `src/http.ts`; `load` runs through it with the request's container; and a
 * `load` that throws answers as §4.8 says — a redirect, or `_error.fud` with its status.
 *
 * Criteria 9, 21, 23, 27, 28, 29, 35 and 36, as a browser and a script would see them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const USERS = `import { Service } from '@fudic/di';

export class Users {
  readonly list: string[] = ['ana', 'luis'];
  all(): string[] { return this.list; }
  find(q: string): string[] { return this.list.filter((n) => n.includes(q)); }
}
Service(Users);
`;

const HTTP = `import { chain, csrf } from '@fudic/http';
export default chain().use(csrf);
`;

const USUARIOS = `<!DOCTYPE html>
<html>
<head>
<title>Usuarios</title>
<link rel="component" href="../components/user-form.fud">
@code {
  @server {
    import { get, del, notFound } from '@fudic/http';
    import { inject } from '@fudic/di';
    import { Users } from '../users';

    export async function load() {
      return { count: inject(Users).all().length };
    }

    export const search = get()
      .args<{ q: string }>()
      .handle((ctx) => inject(Users).find(ctx.args.q));

    export const remove = del().handle(() => {
      throw notFound('gone');
    });

    export const crash = get().handle((): string => {
      throw new Error('mal');
    });
  }
}
</head>
<body><p>usuarios: @data.count</p><user-form></user-form></body>
</html>
`;

const USER_FORM = `@code {
  @server {
    import { put } from '@fudic/http';
    import { inject } from '@fudic/di';
    import { Users } from '../users';
    export const save = put().handle(() => ({ from: 'user-form', count: inject(Users).all().length }));
  }
}
<user-form>
  <template shadowrootmode="open"><span>form</span></template>
</user-form>
`;

const throwing = (body: string, imports = "import { notFound, redirect } from '@fudic/http';") => `<!DOCTYPE html>
<html>
<head>
<title>x</title>
@code {
  @server {
    ${imports}
    export async function load(): Promise<{ n: number }> {
      ${body}
    }
  }
}
</head>
<body><p>@data.n</p></body>
</html>
`;

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>status @data.status</h1><p>@data.title</p><p>detail: [@data.detail]</p></body>
</html>
`;

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-http-dev-'));
  writeHttpTypecheckConfig(root);
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  const files: Record<string, string> = {
    'src/users.ts': USERS,
    'src/http.ts': HTTP,
    'src/routes/usuarios.fud': USUARIOS,
    'src/components/user-form.fud': USER_FORM,
    'src/routes/missing.fud': throwing("throw notFound('no está');"),
    'src/routes/go.fud': throwing("throw redirect('/login');"),
    'src/routes/boom.fud': throwing("throw new Error('secreto');", ''),
    'src/routes/plain.fud': throwing("throw 'una cadena';", ''),
    'src/routes/nostack.fud': throwing("const e = new Error('sin pila');\n      e.stack = undefined;\n      throw e;", ''),
    'src/routes/_error.fud': ERROR_PAGE,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'test' }),
  };
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic()],
    server: { port: 0 },
  });
  await server.listen();
  origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
}, 120000);

afterAll(async () => {
  await server.close();
});

const page = (path: string) => fetch(`${origin}${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${origin}/_fudic/fn${path}`, { ...init, headers: { 'x-fudic-csrf': '1', ...(init.headers as Record<string, string>) } });

describe('server functions in dev', () => {
  it('criterion 21: GET …/search?a=… returns what handle returned', async () => {
    const a = encodeURIComponent(JSON.stringify({ q: 'an' }));
    const res = await call(`/r/usuarios/search?a=${a}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(['ana']);
  });

  it('criterion 23: a 404 thrown in handle comes back as a problem', async () => {
    const res = await call('/r/usuarios/remove', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toEqual({ status: 404, title: 'Not Found', detail: 'gone' });
  });

  it('criterion 36: a component function, by tag, resolving inject from the request root', async () => {
    const res = await call('/c/user-form/save', { method: 'PUT' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: 'user-form', count: 2 });
  });

  it('criterion 35: src/http.ts puts csrf in every chain', async () => {
    const bare = await fetch(`${origin}/_fudic/fn/c/user-form/save`, { method: 'PUT' });
    expect(bare.status).toBe(403);
    const cross = await call('/c/user-form/save', { method: 'PUT', headers: { 'sec-fetch-site': 'cross-site' } });
    expect(cross.status).toBe(403);
    const foreign = await call('/c/user-form/save', { method: 'PUT', headers: { origin: 'https://evil.test' } });
    expect(foreign.status).toBe(403);
    // A GET without the header passes.
    const a = encodeURIComponent(JSON.stringify({ q: 'l' }));
    expect((await fetch(`${origin}/_fudic/fn/r/usuarios/search?a=${a}`)).status).toBe(200);
  });

  it('a function that throws an Error: 500 with its message in dev', async () => {
    const res = await fetch(`${origin}/_fudic/fn/r/usuarios/crash`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 500, title: 'Internal Server Error', detail: 'mal' });
  });

  it('an unknown function, load, and the wrong verb', async () => {
    expect((await call('/r/usuarios/nope')).status).toBe(404);
    expect((await call('/r/usuarios/load')).status).toBe(404);
    expect((await call('/r/usuarios/search', { method: 'POST', body: '{}' })).status).toBe(405);
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
    expect(await res.json()).toEqual({ data: { count: 2 } });
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

  it('/_fudic/error/401?detail=… paints _error.fud with the detail errorPages put there (BUG-51)', async () => {
    const res = await page('/_fudic/error/401?detail=sin%20token');
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('status 401');
    expect(html).toContain('Unauthorized');
    expect(html).toContain('detail: [sin token]');
  });

  it('with no detail in the URL, or an empty one, the page has none', async () => {
    expect(await (await page('/_fudic/error/401')).text()).toContain('detail: []');
    expect(await (await page('/_fudic/error/401?detail=')).text()).toContain('detail: []');
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
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    writeFileSync(join(root, 'src', 'routes', 'missing.fud'), throwing("throw notFound('no está');"));
    writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
    writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'bare' }));
    bare = await createServer({
      root,
      logLevel: 'silent',
      resolve: { alias: httpAlias },
      plugins: [fudic()],
      server: { port: 0 },
    });
    await bare.listen();
    bareOrigin = `http://localhost:${(bare.httpServer!.address() as AddressInfo).port}`;
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
