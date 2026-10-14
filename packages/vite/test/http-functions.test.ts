/**
 * SDD-56 §4.12 and §4.15 in the plugin: a Node request carried into a `Request` and a
 * `Response` back out, through a real Node HTTP server; where the dev server finds each
 * `?server`; the table of an app's functions; and the text of `functions.mjs`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appFunctions,
  devSource,
  emitFunctionsModule,
  functionsOf,
  httpFileOf,
  isFnPath,
  sendResponse,
  toRequest,
} from '../src/functions.js';
import type { RouteBuild } from '../src/discover.js';

describe('isFnPath', () => {
  it('under base + /_fudic/fn/ only', () => {
    expect(isFnPath('/_fudic/fn/r/a/save', '/')).toBe(true);
    expect(isFnPath('/app/_fudic/fn/c/x/save', '/app/')).toBe(true);
    expect(isFnPath('/_fudic/fn/r/a/save', '/app/')).toBe(false);
    expect(isFnPath('/_fudic/fnord', '/')).toBe(false);
    expect(isFnPath('/_fudic/data/a', '/')).toBe(false);
  });
});

describe('toRequest and sendResponse, over a real Node server', () => {
  let server: Server;
  let origin = '';
  let seen: { request: Request; text: string; aborted: () => boolean } | undefined;
  let answer: (request: Request) => Response | null | Promise<Response | null> = () => new Response('ok');

  beforeAll(async () => {
    server = createServer((req, res) => {
      void (async () => {
        const request = toRequest(req, res);
        const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
        seen = { request, text, aborted: () => request.signal.aborted };
        // `next`: what Connect does when nobody answers — here, a plain 404.
        await sendResponse(res, await answer(request), () => {
          res.statusCode = 404;
          res.end('next');
        });
      })();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address() as { port: number };
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('a GET: method, URL with its query, headers, no body', async () => {
    answer = () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await fetch(`${origin}/_fudic/fn/r/a/save?a=1`, { headers: { 'x-one': 'uno', cookie: 'a=1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(seen!.request.method).toBe('GET');
    expect(new URL(seen!.request.url).pathname + new URL(seen!.request.url).search).toBe('/_fudic/fn/r/a/save?a=1');
    expect(seen!.request.headers.get('x-one')).toBe('uno');
    expect(seen!.request.headers.get('cookie')).toBe('a=1');
    expect(seen!.aborted()).toBe(false);
  });

  it('a PUT carries its body, and several set-cookie come back as several', async () => {
    answer = () => {
      const headers = new Headers({ 'content-type': 'text/plain' });
      headers.append('set-cookie', 'a=1');
      headers.append('set-cookie', 'b=2; HttpOnly');
      return new Response('done', { status: 201, headers });
    };
    const res = await fetch(`${origin}/_fudic/fn/r/a/save`, { method: 'PUT', body: '{"x":1}' });
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('done');
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2; HttpOnly']);
    expect(seen!.text).toBe('{"x":1}');
    expect(seen!.request.method).toBe('PUT');
  });

  it('binary bytes travel untouched, both ways', async () => {
    const bytes = new Uint8Array([0, 255, 7, 128]);
    answer = async (request) => new Response(new Uint8Array(await request.clone().arrayBuffer()));
    const res = await fetch(`${origin}/x`, { method: 'POST', body: bytes });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('no response (not a function of this app) hands the request on with next', async () => {
    answer = () => null;
    const res = await fetch(`${origin}/elsewhere`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('next');
  });

  it('a response without set-cookie writes none, and a 204 has no body', async () => {
    answer = () => new Response(null, { status: 204 });
    const res = await fetch(`${origin}/x`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('criterion 24, server side: a client that goes away aborts the signal', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    answer = async () => {
      await held;
      return new Response('late');
    };
    const controller = new AbortController();
    const p = fetch(`${origin}/slow`, { signal: controller.signal }).catch(() => 'aborted');
    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    expect(await p).toBe('aborted');
    await new Promise((r) => setTimeout(r, 50));
    expect(seen!.aborted()).toBe(true);
    release();
  });

  it('a finished response does not abort', async () => {
    answer = () => new Response('ok');
    await (await fetch(`${origin}/x`)).text();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen!.aborted()).toBe(false);
  });

  it('originalUrl wins over url (Connect, base still on it), and a missing host or method has defaults', () => {
    const listeners: Record<string, () => void> = {};
    const res = { on: (e: string, l: () => void) => (listeners[e] = l), writableFinished: false };
    const req = { headers: { 'x-many': ['a', 'b'], skip: undefined }, url: '/inner', originalUrl: '/app/inner' };
    const request = toRequest(req as never, res as never);
    expect(new URL(request.url).pathname).toBe('/app/inner');
    expect(new URL(request.url).host).toBe('localhost');
    expect(request.method).toBe('GET');
    expect(request.headers.get('x-many')).toBe('a, b');
    expect(request.headers.has('skip')).toBe(false);
    const bare = toRequest({ headers: {} } as never, res as never);
    expect(new URL(bare.url).pathname).toBe('/');
    listeners['close']!();
    expect(bare.signal.aborted).toBe(true);
  });

  it('HEAD has no body either', () => {
    const res = { on: () => res, writableFinished: true };
    const request = toRequest({ headers: { host: 'h' }, method: 'HEAD', url: '/x' } as never, res as never);
    expect(request.body).toBeNull();
  });
});

describe('where the modules are', () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-fn-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  mkdirSync(join(root, 'src', 'layouts'), { recursive: true });

  const write = (rel: string, text: string): string => {
    const path = join(root, rel);
    writeFileSync(path, text);
    return path;
  };

  const usuarios = write(
    'src/routes/usuarios.fud',
    `<!DOCTYPE html><html><head>
@code {
  @server {
    import { get, put } from '@fudic/http';
    export async function load() { return {}; }
    export const search = get().handle(() => []);
    export const save = put().handle(() => 1);
  }
}
</head><body></body></html>`,
  );
  const home = write('src/routes/index.fud', '<!DOCTYPE html><html><head></head><body><p>x</p></body></html>');
  const loadOnly = write(
    'src/routes/about.fud',
    '<!DOCTYPE html><html><head>@code {\n  @server {\n    export async function load() { return {}; }\n  }\n}\n</head><body></body></html>',
  );
  const userForm = write(
    'src/components/user-form.fud',
    `@code {
  @server {
    import { del } from '@fudic/http';
    export const remove = del().handle(() => 1);
  }
}
<user-form><template shadowrootmode="open"><span></span></template></user-form>`,
  );
  const plain = write('src/components/x-plain.fud', '<x-plain><template shadowrootmode="open"><span></span></template></x-plain>');
  const fragment = write(
    'src/layouts/main.fud',
    '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
  );

  const build = (pattern: string, absPath: string) => ({ route: { pattern }, absPath }) as unknown as RouteBuild;

  it('httpFileOf: src/http.ts when the project has one', () => {
    expect(httpFileOf(root)).toBeUndefined();
    write('src/http.ts', 'export default 1;');
    expect(httpFileOf(root)).toBe(`${root.replace(/\\/gu, '/')}/src/http.ts`);
  });

  it('functionsOf: by name and method, load aside; none for a file that has none or is no document', () => {
    expect(functionsOf(usuarios)).toEqual([
      { name: 'search', method: 'GET' },
      { name: 'save', method: 'PUT' },
    ]);
    expect(functionsOf(userForm)).toEqual([{ name: 'remove', method: 'DELETE' }]);
    expect(functionsOf(loadOnly)).toEqual([]);
    expect(functionsOf(home)).toEqual([]);
    expect(functionsOf(fragment)).toEqual([]);
  });

  it('appFunctions: only the files with functions, and the table by URL and method', () => {
    const app = appFunctions(
      [build('/usuarios', usuarios), build('/', home), build('/about', loadOnly)],
      [
        { tag: 'user-form', path: userForm },
        { tag: 'x-plain', path: plain },
      ],
    );
    expect(app.routes).toEqual([{ pattern: '/usuarios', path: usuarios }]);
    expect(app.components).toEqual([{ tag: 'user-form', path: userForm }]);
    expect(app.table).toEqual([
      { url: '/_fudic/fn/r/usuarios/search', method: 'GET' },
      { url: '/_fudic/fn/r/usuarios/save', method: 'PUT' },
      { url: '/_fudic/fn/c/user-form/remove', method: 'DELETE' },
    ]);
  });

  it('appFunctions: the root route has no segment of its own', () => {
    const index = write(
      'src/routes/root.fud',
      "<!DOCTYPE html><html><head>@code {\n  @server {\n    import { get } from '@fudic/http';\n    export const hi = get().handle(() => 1);\n  }\n}\n</head><body></body></html>",
    );
    expect(appFunctions([build('/', index)], []).table).toEqual([{ url: '/_fudic/fn/r/hi', method: 'GET' }]);
  });

  it('devSource: each ?server loaded through the graph, on demand', async () => {
    const loaded: string[] = [];
    const source = devSource({
      builds: [build('/usuarios', 'C:\\app\\src\\routes\\usuarios.fud'), build('/', '/app/index.fud')],
      componentPath: (tag) => (tag === 'user-form' ? '/app/user-form.fud' : undefined),
      load: async (id) => (loaded.push(id), { id, default: 'GLOBAL' }),
      httpFile: '/app/src/http.ts',
    });
    expect(source.routes).toEqual(['/usuarios', '/']);
    expect(await source.route('/usuarios')).toMatchObject({ id: 'C:/app/src/routes/usuarios.fud?server' });
    expect(await source.route('/nada')).toBeUndefined();
    expect(await source.component('user-form')).toMatchObject({ id: '/app/user-form.fud?server' });
    expect(await source.component('nobody')).toBeUndefined();
    expect(await source.global()).toBe('GLOBAL');
    expect(loaded).toEqual(['C:/app/src/routes/usuarios.fud?server', '/app/user-form.fud?server', '/app/src/http.ts']);
  });

  it('devSource: without src/http.ts, no global level', async () => {
    const source = devSource({ builds: [], componentPath: () => undefined, load: async () => ({}), httpFile: undefined });
    expect(await source.global()).toBeUndefined();
  });
});

describe('emitFunctionsModule (§4.15)', () => {
  const table = [
    { url: '/_fudic/fn/r/usuarios/save', method: 'PUT' },
    { url: '/_fudic/fn/c/user-form/save', method: 'PUT' },
  ];

  it('every ?server behind one handle, with the global chain and the table', () => {
    const text = emitFunctionsModule({
      routes: [{ pattern: '/usuarios', path: 'C:\\app\\src\\routes\\usuarios.fud' }],
      components: [{ tag: 'user-form', path: '/app/src/components/user-form.fud' }],
      httpFile: '/app/src/http.ts',
      base: '/app/',
      table,
    });
    expect(text).toContain("import { functionsHandler } from '@fudic/http/server';");
    expect(text).toContain('import $global from "/app/src/http.ts";');
    expect(text).toContain('"/usuarios": () => import("C:/app/src/routes/usuarios.fud?server"),');
    expect(text).toContain('"user-form": () => import("/app/src/components/user-form.fud?server"),');
    expect(text).toContain('  global: async () => $global,');
    expect(text).toContain('export const handle = functionsHandler(source, { base: "/app/" });');
    expect(text).toContain(`export const functions = ${JSON.stringify(table)}.map((entry) => ({ ...entry, handle }));`);
  });

  it('without src/http.ts the global level is undefined, and nothing imports it', () => {
    const text = emitFunctionsModule({ routes: [], components: [], httpFile: undefined, base: '/', table: [] });
    expect(text).not.toContain('$global');
    expect(text).toContain('  global: async () => undefined,');
  });
});
