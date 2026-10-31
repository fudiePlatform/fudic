/**
 * SDD-56 §4.12 and §4.15 in the plugin: a Node request carried into a `Request` and a
 * `Response` back out, through a real Node HTTP server, and the 404 of an app without a
 * `.fudapi`. The text of `functions.mjs` is `api-units`'s.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { isFnPath, noFunction, sendResponse, toRequest } from '../src/functions.js';

describe('isFnPath', () => {
  it('under base + /_fudic/fn/ only', () => {
    expect(isFnPath('/_fudic/fn/routes/a/save', '/')).toBe(true);
    expect(isFnPath('/app/_fudic/fn/components/x/save', '/app/')).toBe(true);
    expect(isFnPath('/_fudic/fn/routes/a/save', '/app/')).toBe(false);
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
    const res = await fetch(`${origin}/_fudic/fn/routes/a/save?a=1`, { headers: { 'x-one': 'uno', cookie: 'a=1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(seen!.request.method).toBe('GET');
    expect(new URL(seen!.request.url).pathname + new URL(seen!.request.url).search).toBe('/_fudic/fn/routes/a/save?a=1');
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
    const res = await fetch(`${origin}/_fudic/fn/routes/a/save`, { method: 'PUT', body: '{"x":1}' });
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

  it('over HTTP/2: no pseudo-header among the headers, the host from `:authority`, https over TLS', () => {
    const res = { on: () => res, writableFinished: true };
    const req = {
      headers: { ':method': 'GET', ':path': '/x', ':authority': 'app.test:4443', accept: 'text/html' },
      method: 'GET',
      url: '/x',
      socket: { encrypted: true },
    };
    const request = toRequest(req as never, res as never);
    expect(request.url).toBe('https://app.test:4443/x');
    expect([...request.headers.keys()]).toEqual(['accept']);
  });

  it('HEAD has no body either', () => {
    const res = { on: () => res, writableFinished: true };
    const request = toRequest({ headers: { host: 'h' }, method: 'HEAD', url: '/x' } as never, res as never);
    expect(request.body).toBeNull();
  });
});

describe('noFunction', () => {
  it('the 404 of a function URL in an app without a .fudapi', async () => {
    const response = noFunction();
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toEqual({ status: 404, title: 'Not Found', detail: 'no such server function' });
  });
});
