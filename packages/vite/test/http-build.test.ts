/**
 * SDD-56 in a real `vite build` and `vite preview`.
 *
 * - Criteria 7 and 8: the client output carries no line of `handle`, nor what only `handle`
 *   imports, nor the argument of any `.server(…)` — a middleware module that imports
 *   `node:crypto` for its server half builds for the client without it.
 * - BUG-47 criterion 3: nor a server module with an effect on load that only `.server` used.
 * - Criterion 36: a component's function, used from two pages, is one URL by tag.
 * - Criterion 38: `vite preview` serves the functions from `.fudic/edge/functions.mjs`, with
 *   criteria 21, 23 and 35 repeated against it; and the error pages of §4.8.
 * - Criterion 37: a `load` that throws for a path of `paths()` fails the build, naming both.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const USERS = `import { Service } from '@fudic/di';

export class Users {
  readonly list: string[] = ['ana', 'luis'];
  all(): string[] { return this.list; }
  find(q: string): string[] { return ['USERS_SERVICE_MARK', ...this.list].filter((n) => n.includes(q)); }
}
Service(Users);
`;

const HTTP = `import { chain, csrf } from '@fudic/http';
export default chain().use(csrf);
`;

/**
 * A server service with an effect on load: `Service(Tokens)` keeps Rollup from dropping the
 * module even when nothing reads `Tokens` (BUG-47 §2.1).
 */
const TOKENS = `import { Service } from '@fudic/di';

const USERS_TABLE: Record<string, string> = { 'TOKENS_TABLE_MARK': 'ana' };

export class Tokens {
  verify(token: string): string {
    const user = USERS_TABLE[token];
    if (user === undefined) throw new Error('token desconocido');
    return user;
  }
}
Service(Tokens);
`;

/** A middleware whose server half reads a node builtin and a server service: what must never reach the client. */
const AUTH = `import { middleware } from '@fudic/http';
import { createHash } from 'node:crypto';
import { Tokens } from '../services/tokens';

export const auth = middleware()
  .client((ctx, next) => {
    ctx.headers.set('x-user', 'CLIENT_HALF_MARK');
    return next(ctx);
  })
  .server((ctx, next) => {
    const digest = createHash('sha256').update('SERVER_HALF_MARK').digest('hex');
    ctx.response.headers.set('x-digest', digest.slice(0, 8));
    ctx.response.headers.set('x-token-user', new Tokens().verify('TOKENS_TABLE_MARK'));
    return next(ctx);
  });
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
    import { auth } from '../middlewares/auth';

    export async function load() {
      return { count: inject(Users).all().length };
    }

    export const search = get()
      .use(auth)
      .args<{ q: string }>()
      .handle((ctx) => {
        const mark = 'HANDLE_BODY_MARK';
        return inject(Users).find(ctx.args.q).filter((n) => n !== mark);
      });

    export const remove = del().handle(() => {
      throw notFound('gone');
    });
  }
  @client {
    // Not \`search(…)\` by name: until the editor declares the stubs in @client (SDD-56 task
    // 44) the typecheck does not know it. The stub is emitted all the same.
    import { signal } from '@fudic/core';
    const clicks = signal(0);
    function find(): void { clicks.set(clicks() + 1); }
  }
}
</head>
<body><p>usuarios: @data.count</p><button @click=@find>buscar @clicks()</button><user-form></user-form></body>
</html>
`;

/** The root route, with a function and a client half: its URL has no segment of its own. */
const INDEX = `<!DOCTYPE html>
<html>
<head>
<title>Inicio</title>
@code {
  @server {
    import { get } from '@fudic/http';
    export const hola = get().handle(() => 'ROOT_HANDLE_MARK');
  }
  @client {
    import { signal } from '@fudic/core';
    const n = signal(0);
    function bump(): void { n.set(n() + 1); }
  }
}
</head>
<body><button @click=@bump>@n()</button></body>
</html>
`;

const OTRA = `<!DOCTYPE html>
<html>
<head>
<title>Otra</title>
<link rel="component" href="../components/user-form.fud">
</head>
<body><user-form></user-form></body>
</html>
`;

const USER_FORM = `@code {
  @server {
    import { put } from '@fudic/http';
    import { inject } from '@fudic/di';
    import { Users } from '../users';
    export const save = put().handle(() => ({ from: 'COMPONENT_HANDLE_MARK', count: inject(Users).all().length }));
  }
  @client {
    import { signal } from '@fudic/core';
    const sent = signal(0);
    function go(): void { sent.set(sent() + 1); }
  }
}
<user-form>
  <template shadowrootmode="open"><button @click=@go>guardar</button></template>
</user-form>
`;

const throwing = (body: string) => `<!DOCTYPE html>
<html>
<head>
<title>x</title>
@code {
  @server {
    import { notFound, redirect } from '@fudic/http';
    export async function load(): Promise<{ n: number }> {
      ${body}
    }
  }
}
</head>
<body><p>@data.n</p></body>
</html>
`;

/** `data` is cast: nothing types `_error.fud`'s data yet (reported, not in any task). */
const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title>
@code {
  const problem = data as { status: number; title: string; detail?: string };
}
</head>
<body><h1>status @problem.status</h1><p>@problem.title</p><p>detail: [@problem.detail]</p></body>
</html>
`;

/**
 * `verbatimModuleSyntax`, as `examples/basic` and any strict project: without it the TS strip
 * that runs after the erasure elides an import left unused on its own, and BUG-47 §2.1 could
 * never be seen here.
 */
function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-http-build-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const config = (root: string) => ({
  root,
  logLevel: 'silent' as const,
  resolve: { alias: httpAlias },
  plugins: [fudic()],
  build: { minify: false },
  preview: { port: 0 },
});

/** Every file under `dir`, recursively, with its text. */
function filesUnder(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

let root: string;
let server: PreviewServer;
let origin: string;

beforeAll(async () => {
  root = project({
    'src/users.ts': USERS,
    'src/http.ts': HTTP,
    'src/middlewares/auth.ts': AUTH,
    'src/services/tokens.ts': TOKENS,
    'src/routes/usuarios.fud': USUARIOS,
    'src/routes/otra.fud': OTRA,
    'src/routes/index.fud': INDEX,
    'src/components/user-form.fud': USER_FORM,
    'src/routes/missing.fud': throwing("throw notFound('no está');"),
    'src/routes/go.fud': throwing("throw redirect('/login');"),
    'src/routes/boom.fud': throwing("throw new Error('secreto');"),
    'src/routes/_error.fud': ERROR_PAGE,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'test' }),
  });
  await build(config(root));
  server = await preview(config(root));
  origin = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}, 240000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

describe('criteria 7 and 8: the client output', () => {
  const client = () =>
    filesUnder(join(root, 'dist')).filter((f) => f.path.endsWith('.js') || f.path.endsWith('.html'));

  it('the client stubs are there: the browser can call search and save', () => {
    const all = client().map((f) => f.text).join('\n');
    expect(all).toContain('/_fudic/fn/r/usuarios/search');
    expect(all).toContain('/_fudic/fn/c/user-form/save');
    expect(all).toContain('CLIENT_HALF_MARK');
    // The root route's function hangs from /_fudic/fn/r directly.
    expect(all).toContain('"/_fudic/fn/r/hola"');
    expect(all).not.toContain('ROOT_HANDLE_MARK');
  });

  it('carries nothing of handle, nor what only handle imports, nor any .server argument', () => {
    for (const file of client()) {
      for (const mark of ['HANDLE_BODY_MARK', 'COMPONENT_HANDLE_MARK', 'USERS_SERVICE_MARK', 'SERVER_HALF_MARK']) {
        expect(file.text, `${mark} in ${file.path}`).not.toContain(mark);
      }
    }
  });

  it('criterion 8: the middleware module builds for the client without node:crypto', () => {
    for (const file of client()) {
      expect(file.text, file.path).not.toContain('node:crypto');
      expect(file.text, file.path).not.toContain('createHash');
    }
  });

  it('BUG-47 criterion 3: nothing of a server module with an effect on load, reached only from .server', () => {
    for (const file of client()) {
      for (const mark of ['TOKENS_TABLE_MARK', 'token desconocido', 'USERS_TABLE', 'class Tokens', 'Service(Tokens)']) {
        expect(file.text, `${mark} in ${file.path}`).not.toContain(mark);
      }
    }
  });

  it('the server side keeps all of it: .fudic/edge/functions.mjs and its chunks', () => {
    expect(existsSync(join(root, '.fudic', 'edge', 'functions.mjs'))).toBe(true);
    const edge = filesUnder(join(root, '.fudic', 'edge')).map((f) => f.text).join('\n');
    expect(edge).toContain('HANDLE_BODY_MARK');
    expect(edge).toContain('SERVER_HALF_MARK');
    expect(edge).toContain('node:crypto');
    expect(edge).toContain('token desconocido');
  });
});

describe('criterion 38: vite preview serves the functions from functions.mjs', () => {
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}/_fudic/fn${path}`, { ...init, headers: { 'x-fudic-csrf': '1', ...(init.headers as Record<string, string>) } });

  it('functions.mjs exports the handler and the table', async () => {
    const mod = (await import(join(root, '.fudic', 'edge', 'functions.mjs').replace(/\\/gu, '/').replace(/^(?=[A-Za-z]:)/u, 'file:///'))) as {
      functions: { url: string; method: string }[];
      handle: (r: Request) => Promise<Response | null>;
    };
    // What an adapter does with it: a Request in, a Response out, in plain Node.
    const res = await mod.handle(
      new Request('http://x/_fudic/fn/c/user-form/save', { method: 'PUT', headers: { 'x-fudic-csrf': '1' } }),
    );
    expect(res!.status).toBe(200);
    expect(await mod.handle(new Request('http://x/usuarios'))).toBeNull();
    expect(mod.functions.map((f) => [f.url, f.method]).sort()).toEqual([
      ['/_fudic/fn/c/user-form/save', 'PUT'],
      ['/_fudic/fn/r/hola', 'GET'],
      ['/_fudic/fn/r/usuarios/remove', 'DELETE'],
      ['/_fudic/fn/r/usuarios/search', 'GET'],
    ]);
  });

  it('criterion 21: GET search?a=… returns what handle returned, through the server half of auth', async () => {
    const a = encodeURIComponent(JSON.stringify({ q: 'an' }));
    const res = await call(`/r/usuarios/search?a=${a}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(['ana']);
    expect(res.headers.get('x-digest')).toMatch(/^[0-9a-f]{8}$/u);
    expect(res.headers.get('x-token-user')).toBe('ana');
  });

  it('criterion 23: a 404 thrown in handle is a problem', async () => {
    const res = await call('/r/usuarios/remove', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 404, title: 'Not Found', detail: 'gone' });
  });

  it('criterion 35: csrf from src/http.ts', async () => {
    expect((await fetch(`${origin}/_fudic/fn/c/user-form/save`, { method: 'PUT' })).status).toBe(403);
    expect((await call('/c/user-form/save', { method: 'PUT', headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await call('/c/user-form/save', { method: 'PUT', headers: { origin: 'https://evil.test' } })).status).toBe(403);
    const a = encodeURIComponent(JSON.stringify({ q: 'l' }));
    expect((await fetch(`${origin}/_fudic/fn/r/usuarios/search?a=${a}`)).status).toBe(200);
  });

  it('criterion 36: the component function, one URL by tag, inject from the request root', async () => {
    const res = await call('/c/user-form/save', { method: 'PUT' });
    expect(await res.json()).toEqual({ from: 'COMPONENT_HANDLE_MARK', count: 2 });
  });

  it('the root route function answers at /_fudic/fn/r/hola', async () => {
    expect(await (await call('/r/hola')).json()).toBe('ROOT_HANDLE_MARK');
  });

  it('a path that is no function is 404, and what is not under /_fudic/fn goes on', async () => {
    expect((await call('/r/nada/x')).status).toBe(404);
  });
});

describe('§4.8 in preview', () => {
  const page = (path: string) => fetch(`${origin}${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' });

  it('a page whose load works renders', async () => {
    const res = await page('/usuarios');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('usuarios: 2');
  });

  it('criterion 27: notFound paints _error.fud with 404', async () => {
    const res = await page('/missing');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('status 404');
  });

  it('criterion 28: redirect is 303 with Location', async () => {
    const res = await page('/go');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('anything else is a 500, without its message', async () => {
    const res = await page('/boom');
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain('status 500');
    expect(html).not.toContain('secreto');
  });

  it('criterion 29: /_fudic/error/500 paints _error.fud; a non-error status is not one', async () => {
    const res = await page('/_fudic/error/500');
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('status 500');
    expect((await page('/_fudic/error/204')).status).toBe(404);
  });

  it('/_fudic/error/401?detail=… paints _error.fud with the detail errorPages put there (BUG-51)', async () => {
    const res = await page('/_fudic/error/401?detail=sin%20token');
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('status 401');
    expect(html).toContain('detail: [sin token]');
    expect(await (await page('/_fudic/error/401')).text()).toContain('detail: []');
  });

  it('the data endpoint answers the status of what load threw', async () => {
    const ok = await fetch(`${origin}/_fudic/data/usuarios`);
    expect(await ok.json()).toEqual({ data: { count: 2 } });
    // A route that resolves nothing answers an empty object.
    expect(await (await fetch(`${origin}/_fudic/data/otra`)).json()).toEqual({});
    const missing = await fetch(`${origin}/_fudic/data/missing`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('application/problem+json');
    const go = await fetch(`${origin}/_fudic/data/go`);
    expect(go.status).toBe(303);
    expect(await go.json()).toEqual({ status: 303, title: 'Redirect', location: '/login' });
    const boom = await fetch(`${origin}/_fudic/data/boom`);
    expect(boom.status).toBe(500);
    expect(await boom.text()).not.toContain('secreto');
  });
});

describe('without _error.fud', () => {
  let bare: PreviewServer;
  let bareOrigin: string;

  beforeAll(async () => {
    const r = project({
      'src/routes/missing.fud': throwing("throw notFound('no está');"),
      'sw.json': JSON.stringify({ shell: [] }),
      'fudic.json': JSON.stringify({ id: 'bare' }),
    });
    await build(config(r));
    bare = await preview(config(r));
    bareOrigin = `http://localhost:${(bare.httpServer.address() as AddressInfo).port}`;
  }, 240000);

  afterAll(async () => {
    await new Promise<void>((resolve) => bare.httpServer.close(() => resolve()));
  });

  it('criterion 27: the minimal page with the 404', async () => {
    const res = await fetch(`${bareOrigin}/missing`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('Not Found');
  });

  it('no functions.mjs without functions, and /_fudic/fn goes on to a 404', async () => {
    const res = await fetch(`${bareOrigin}/_fudic/fn/r/missing/x`);
    expect(res.status).toBe(404);
  });
});

describe('criterion 37: the prerender of a path that throws', () => {
  it('fails the build naming the URL and the status', async () => {
    const r = project({
      'src/routes/blog/[slug].fud': `<!DOCTYPE html>
<html>
<head>
<title>Blog</title>
@code {
  @server {
    import { notFound } from '@fudic/http';
    export function paths(): string[] { return ['a', 'b']; }
    export async function load(ctx: { params: Record<string, string> }): Promise<{ slug: string }> {
      if (ctx.params['slug'] === 'b') throw notFound();
      return { slug: ctx.params['slug'] ?? '' };
    }
  }
}
</head>
<body><h1>@data.slug</h1></body>
</html>
`,
    });
    await expect(build({ ...config(r), build: { minify: false, write: false } })).rejects.toThrow(
      /FUD0620[\s\S]*\/blog\/b answered 404 Not Found/u,
    );
  }, 240000);

  it('a redirect for a path names its location', async () => {
    const r = project({
      'src/routes/old/[slug].fud': `<!DOCTYPE html>
<html>
<head>
<title>Old</title>
@code {
  @server {
    import { redirect } from '@fudic/http';
    export function paths(): string[] { return ['a']; }
    export async function load(): Promise<{ n: number }> {
      throw redirect('/new');
    }
  }
}
</head>
<body><h1>@data.n</h1></body>
</html>
`,
    });
    await expect(build({ ...config(r), build: { minify: false, write: false } })).rejects.toThrow(
      /\/old\/a answered 303 → \/new/u,
    );
  }, 240000);
});
