/**
 * `@fudic/server/node` (SDD-81 §3.10): a Node request carried into a `Request` and a `Response`
 * back out, through a real Node HTTP server; the middleware with its `103`; the prerendered pages
 * of a directory. The first block came from the Vite plugin's tests with the module it tests.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter, once } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer as createH2Server, connect } from 'node:http2';
import { Agent, createServer as createHttpServer, request, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer, type FetchHooks, type FudicServer } from '../src/index.js';
import { htmlPathFor, LINGER_MS, nodeMiddleware, NOT_HTTP, sendResponse, staticPages, toRequest, wantsEarlyHints, type NodeMiddleware } from '../src/node/index.js';
import { pageModule, testApp } from './helpers.js';

describe('toRequest and sendResponse, over a real Node server', () => {
  let server: Server;
  let origin = '';
  let seen: { request: Request; text: string; aborted: () => boolean } | undefined;
  let answer: (request: Request) => Response | null | Promise<Response | null> = () => new Response('ok');

  beforeAll(async () => {
    server = createHttpServer((req, res) => {
      void (async () => {
        const request = toRequest(req, res);
        const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
        seen = { request, text, aborted: () => request.signal.aborted };
        // `next`: what Connect does when nobody answers — here, a plain 404.
        const response = await answer(request);
        if (response !== null) await sendResponse(res, response);
        else {
          res.statusCode = 404;
          res.end('next');
        }
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

  it('Response.error() is no response at all: the connection is cut (SDD-82 §3.5)', async () => {
    answer = () => Response.error();
    await expect(fetch(`${origin}/cut`)).rejects.toThrow();
  });

  it('Response.error() on a connection already used: no response, and nothing for a client to send again', async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const ask = (path: string): Promise<{ status?: number; error?: string; reused: boolean }> =>
      new Promise((resolve) => {
        const req = request(`${origin}${path}`, { agent }, (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode!, reused: req.reusedSocket }));
        });
        req.on('error', (error) => resolve({ error: error.message, reused: req.reusedSocket }));
        req.end();
      });
    let served = 0;
    answer = (r) => {
      served++;
      return new URL(r.url).pathname === '/cut' ? Response.error() : new Response('ok');
    };
    try {
      expect(await ask('/first')).toEqual({ status: 200, reused: false });
      // A bare cut here is what a browser retries; bytes that are not HTTP are a parse error.
      const cut = await ask('/cut');
      expect(cut).toMatchObject({ reused: true });
      expect(cut.status).toBeUndefined();
      expect(cut.error).toMatch(/parse error|invalid|expected http/iu);
      expect(served).toBe(2);
    } finally {
      agent.destroy();
    }
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

describe('a body read only as it is read', () => {
  it('a server that stops reading leaves the rest unread: the Node request is paused', () => {
    const paused = vi.fn();
    const req = Object.assign(Readable.from([Buffer.from('a'), Buffer.from('b')]), {
      headers: { host: 'h' },
      method: 'POST',
      url: '/x',
      pause: paused,
    });
    const res = { on: () => res, writableFinished: true };
    const request = toRequest(req as never, res as never);
    return request.body!.cancel().then(() => expect(paused).toHaveBeenCalledOnce());
  });

  /** A POST whose body comes in `chunks`, as a Node request carries it. */
  const posted = (chunks: string[]): Readable & { headers: Record<string, string>; method: string; url: string } =>
    Object.assign(Readable.from(chunks.map((c) => Buffer.from(c)), { objectMode: false }), { headers: { host: 'h' }, method: 'POST', url: '/x' });
  const res = { on: () => res, writableFinished: true };

  it('a body of several chunks, read to the end', async () => {
    const request = toRequest(posted(['a', 'b', 'c']) as never, res as never);
    expect(await request.text()).toBe('abc');
  });

  it('cancelled after a chunk: the request is let go and paused, and feeds nothing more', async () => {
    const req = posted(['a', 'b']);
    const reader = toRequest(req as never, res as never).body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('a');
    await reader.cancel();
    expect(req.listenerCount('data')).toBe(0);
    expect(req.listenerCount('end')).toBe(0);
    expect(req.listenerCount('error')).toBe(0);
    expect(req.isPaused()).toBe(true);
  });

  it('a request that fails fails its body', async () => {
    const req = new Readable({ read() {} });
    Object.assign(req, { headers: { host: 'h' }, method: 'POST', url: '/x' });
    const reading = toRequest(req as never, res as never).text();
    req.destroy(new Error('gone'));
    await expect(reading).rejects.toThrow('gone');
  });
});

/** A `ServerResponse` stand-in that records what is written and lets a test steer it. */
class FakeRes extends EventEmitter {
  statusCode = 0;
  readonly headers: Record<string, unknown> = {};
  readonly chunks: string[] = [];
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  destroyedWith: unknown;
  /** What `write` answers: false to ask the writer to wait for `drain`. */
  full = false;
  setHeader(name: string, value: unknown): void {
    this.headers[name] = value;
  }
  write(chunk: Uint8Array): boolean {
    this.chunks.push(new TextDecoder().decode(chunk));
    return !this.full;
  }
  end(): void {
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit('finish');
  }
  destroy(error?: unknown): void {
    this.destroyed = true;
    this.destroyedWith = error;
    this.emit('close');
  }
}

/** A body the test feeds one chunk at a time. */
function fed(): { body: ReadableStream<Uint8Array>; push(text: string): void; fail(error: unknown): void; close(): void; cancelled: Promise<void> } {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancel!: () => void;
  const cancelled = new Promise<void>((r) => (cancel = r));
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancel();
    },
  });
  return {
    body,
    push: (text) => controller.enqueue(new TextEncoder().encode(text)),
    fail: (error) => controller.error(error),
    close: () => controller.close(),
    cancelled,
  };
}

describe('sendResponse of Response.error()', () => {
  it('writes what is not HTTP on the socket and closes it', async () => {
    const res = new FakeRes();
    const ended: string[] = [];
    Object.assign(res, { socket: { end: (bytes: string) => void ended.push(bytes) } });
    await sendResponse(res as never, Response.error());
    expect(ended).toEqual([NOT_HTTP]);
    expect(res.destroyed).toBe(false);
  });

  it('with no socket, or on an HTTP/2 stream, the response is destroyed', async () => {
    const bare = new FakeRes();
    Object.assign(bare, { socket: null });
    await sendResponse(bare as never, Response.error());
    const h2 = new FakeRes();
    Object.assign(h2, { socket: { end: () => undefined }, stream: {} });
    await sendResponse(h2 as never, Response.error());
    expect([bare.destroyed, h2.destroyed]).toEqual([true, true]);
  });
});

describe('sendResponse, as the body comes', () => {
  it('waits for drain when the socket is full, and goes on after it', async () => {
    const res = new FakeRes();
    res.full = true;
    const feed = fed();
    const sent = sendResponse(res as never, new Response(feed.body));
    feed.push('a');
    feed.push('b');
    feed.close();
    await vi.waitFor(() => expect(res.chunks).toEqual(['a']));
    res.full = false;
    res.emit('drain');
    await sent;
    expect(res.chunks).toEqual(['a', 'b']);
    expect(res.writableEnded).toBe(true);
  });

  it('a client gone while waiting for drain: the body is cancelled and nothing more is written', async () => {
    const res = new FakeRes();
    res.full = true;
    const feed = fed();
    const sent = sendResponse(res as never, new Response(feed.body));
    feed.push('a');
    await vi.waitFor(() => expect(res.chunks).toEqual(['a']));
    res.destroyed = true;
    res.emit('close');
    await feed.cancelled;
    await sent;
    expect(res.chunks).toEqual(['a']);
  });

  it('a socket already destroyed when a chunk arrives: it stops there', async () => {
    const res = new FakeRes();
    const feed = fed();
    const sent = sendResponse(res as never, new Response(feed.body));
    res.destroyed = true;
    feed.push('late');
    await sent;
    expect(res.chunks).toEqual([]);
    expect(res.writableEnded).toBe(false);
  });

  it('a body that fails half-way cuts the connection: its status is already out', async () => {
    const res = new FakeRes();
    const feed = fed();
    const sent = sendResponse(res as never, new Response(feed.body, { status: 200 }));
    feed.push('half');
    const broken = new Error('render broke');
    await vi.waitFor(() => expect(res.chunks).toEqual(['half']));
    feed.fail(broken);
    await sent;
    expect(res.statusCode).toBe(200);
    expect(res.destroyedWith).toBe(broken);
  });

  it('a close after the end cancels nothing', async () => {
    const res = new FakeRes();
    const cancel = vi.fn();
    await sendResponse(res as never, new Response(new ReadableStream({ start: (c) => c.close(), cancel })));
    res.emit('close');
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('wantsEarlyHints', () => {
  it('a navigation over HTTP/2 or later, and nothing else', () => {
    expect(wantsEarlyHints({ httpVersionMajor: 2, headers: { 'sec-fetch-mode': 'navigate' } } as never)).toBe(true);
    expect(wantsEarlyHints({ httpVersionMajor: 1, headers: { 'sec-fetch-mode': 'navigate' } } as never)).toBe(false);
    expect(wantsEarlyHints({ httpVersionMajor: 2, headers: { 'sec-fetch-mode': 'cors' } } as never)).toBe(false);
  });
});

/** A server that answers with `fn`, for the middleware. */
function fakeServer(over: Partial<FudicServer> = {}): FudicServer {
  return {
    fetch: async () => null,
    notFound: async () => null,
    staticHeaders: () => null,
    ...over,
  };
}

/** A request for the middleware. */
const nodeReq = (over: Record<string, unknown> = {}): never =>
  ({ headers: { host: 'app.test', accept: 'text/html' }, method: 'GET', url: '/x', httpVersionMajor: 1, ...over }) as never;

/** The middleware run once: what it wrote, and what next got. */
function run(mw: NodeMiddleware, req: never, res: FakeRes = new FakeRes()): Promise<{ res: FakeRes; next: unknown[] | undefined }> {
  return new Promise((resolve) => {
    res.on('finish', () => resolve({ res, next: undefined }));
    mw(req, res as never, (...args: unknown[]) => resolve({ res, next: args }));
  });
}

describe('a body left unread lingers, then goes (SDD-81 §3.5)', () => {
  /** A PUT whose body the server stops reading, and its socket. */
  function unreadPut() {
    const destroy = vi.fn();
    const req = Object.assign(new EventEmitter(), {
      headers: { host: 'h' },
      method: 'PUT',
      url: '/x',
      httpVersionMajor: 1,
      complete: false,
      socket: { destroy },
      resume: vi.fn(),
    });
    return { req, destroy };
  }

  const answering = nodeMiddleware(fakeServer({ fetch: async () => new Response('413', { status: 413 }) }));

  it('the client never finishes: the connection goes LINGER_MS after the response, not before', async () => {
    vi.useFakeTimers();
    try {
      const { req, destroy } = unreadPut();
      await run(answering, req as never);
      expect(destroy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(LINGER_MS - 1);
      expect(destroy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the client finishes in time: the connection stays', async () => {
    vi.useFakeTimers();
    try {
      const { req, destroy } = unreadPut();
      await run(answering, req as never);
      req.emit('end');
      vi.advanceTimersByTime(LINGER_MS * 2);
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a body that was done by the time the response ended: nothing to wait for', async () => {
    vi.useFakeTimers();
    try {
      const { req, destroy } = unreadPut();
      const res = new FakeRes();
      // The last bytes of the body arrive while the response is being written.
      const write = res.write.bind(res);
      res.write = (chunk: Uint8Array): boolean => {
        req.complete = true;
        return write(chunk);
      };
      await run(answering, req as never, res);
      vi.advanceTimersByTime(LINGER_MS * 2);
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('over a real socket, a body the client finishes after the response ends the request and keeps the connection', async () => {
    let served: IncomingMessage | undefined;
    const server = createHttpServer((req, res) => {
      served = req;
      answering(req, res, () => undefined);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const agent = new Agent({ keepAlive: true });
    try {
      const { port } = server.address() as AddressInfo;
      const client = request({ port, host: '127.0.0.1', method: 'PUT', agent, headers: { 'content-length': '4' } });
      client.write('ab');
      const response = await new Promise<IncomingMessage>((r) => client.once('response', r));
      response.resume();
      await once(response, 'end');
      expect(response.statusCode).toBe(413);
      client.end('cd');
      await once(served!, 'end');
      expect(served!.socket.destroyed).toBe(false);
    } finally {
      agent.destroy();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a complete body, a GET, or HTTP/2 never linger', async () => {
    vi.useFakeTimers();
    try {
      for (const over of [{ complete: true }, { method: 'GET' }, { httpVersionMajor: 2 }]) {
        const { req, destroy } = unreadPut();
        Object.assign(req, over);
        await run(answering, req as never);
        vi.advanceTimersByTime(LINGER_MS * 2);
        expect(destroy).not.toHaveBeenCalled();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('nodeMiddleware', () => {
  it('the extra headers of the app’s static files, then on to the host', async () => {
    const fetch = vi.fn();
    const { res, next } = await run(
      nodeMiddleware(fakeServer({ staticHeaders: () => ({ 'cache-control': 'no-cache' }), fetch })),
      nodeReq({ url: '/sw.js' }),
    );
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(next).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('what fetch answers is sent', async () => {
    const { res, next } = await run(nodeMiddleware(fakeServer({ fetch: async () => new Response('page', { status: 201 }) })), nodeReq());
    expect(next).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(res.chunks.join('')).toBe('page');
  });

  it('null goes on to next, or with notFound to the 404 page', async () => {
    const notFound = vi.fn(async () => new Response('404 page', { status: 404 }));
    expect((await run(nodeMiddleware(fakeServer({ notFound })), nodeReq())).next).toEqual([]);
    expect(notFound).not.toHaveBeenCalled();
    const { res } = await run(nodeMiddleware(fakeServer({ notFound }), { notFound: true }), nodeReq());
    expect(res.statusCode).toBe(404);
    // And when the 404 page has nothing to say either, next.
    expect((await run(nodeMiddleware(fakeServer(), { notFound: true }), nodeReq())).next).toEqual([]);
  });

  it('an error of the server itself goes to next(error)', async () => {
    const refused = new Error('the graph has errors');
    const { next } = await run(nodeMiddleware(fakeServer({ fetch: () => Promise.reject(refused) })), nodeReq());
    expect(next).toEqual([refused]);
  });

  it('a 103 for a navigation over HTTP/2, with the hints as Node takes them', async () => {
    const res = Object.assign(new FakeRes(), { writeEarlyHints: vi.fn() });
    const fetch = vi.fn(async (_request: Request, hooks?: FetchHooks) => {
      hooks!.earlyHints!({ link: ['</a.css>'], 'referrer-policy': 'strict-origin-when-cross-origin' });
      return new Response('ok');
    });
    await run(nodeMiddleware(fakeServer({ fetch })), nodeReq({ httpVersionMajor: 2, headers: { host: 'h', 'sec-fetch-mode': 'navigate' } }), res);
    expect(res.writeEarlyHints).toHaveBeenCalledWith({ link: ['</a.css>'], 'referrer-policy': 'strict-origin-when-cross-origin' });
  });

  it('no 103 over HTTP/1.1, or where Node cannot send one', async () => {
    const seen: (FetchHooks | undefined)[] = [];
    const fetch = async (_request: Request, hooks?: FetchHooks) => {
      seen.push(hooks);
      return new Response('ok');
    };
    const res = Object.assign(new FakeRes(), { writeEarlyHints: vi.fn() });
    await run(nodeMiddleware(fakeServer({ fetch })), nodeReq({ headers: { host: 'h', 'sec-fetch-mode': 'navigate' } }), res);
    await run(nodeMiddleware(fakeServer({ fetch })), nodeReq({ httpVersionMajor: 2, headers: { host: 'h', 'sec-fetch-mode': 'navigate' } }));
    expect(seen).toEqual([{}, {}]);
  });
});

describe('a real 103 over HTTP/2 (SDD-73, criterion 39)', () => {
  it('reaches the client before the response', async () => {
    const server = createServer(
      testApp({ csp: "script-src 'nonce-{nonce}'", routes: [{ pattern: '/', module: pageModule(), hints: ['</a.css>; rel=preload; as=style'] }] }),
    );
    const h2 = createH2Server(nodeMiddleware(server) as never);
    await new Promise<void>((r) => h2.listen(0, '127.0.0.1', r));
    const { port } = h2.address() as { port: number };
    const client = connect(`http://127.0.0.1:${port}`);
    try {
      const statuses: number[] = [];
      let early: Record<string, unknown> = {};
      const body = await new Promise<string>((resolve, reject) => {
        const stream = client.request({ ':path': '/', accept: 'text/html', 'sec-fetch-mode': 'navigate' });
        stream.on('headers', (headers) => {
          statuses.push(Number(headers[':status']));
          early = headers;
        });
        stream.on('response', (headers) => statuses.push(Number(headers[':status'])));
        let text = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => (text += chunk));
        stream.on('end', () => resolve(text));
        stream.on('error', reject);
      });
      expect(statuses).toEqual([103, 200]);
      expect(early['link']).toBe('</a.css>; rel=preload; as=style');
      const nonce = /'nonce-([^']+)'/u.exec(String(early['content-security-policy']))?.[1];
      expect(body).toContain(`nonce="${nonce}"`);
    } finally {
      client.close();
      await new Promise<void>((r) => h2.close(() => r()));
    }
  });
});

describe('htmlPathFor / staticPages', () => {
  it('where the build writes a prerendered page', () => {
    expect(htmlPathFor('/')).toBe('index.html');
    expect(htmlPathFor('/blog/hola/')).toBe('blog/hola/index.html');
  });

  it('the page of a path under the directory; none for a missing one or one that would leave it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-pages-'));
    mkdirSync(join(dir, 'about'));
    writeFileSync(join(dir, 'about', 'index.html'), '<p>about</p>');
    writeFileSync(join(dir, 'index.html'), '<p>home</p>');
    writeFileSync(join(tmpdir(), 'index.html'), '<p>outside</p>');
    const pages = staticPages(dir);
    expect(await pages('/about')).toBe('<p>about</p>');
    expect(await pages('/')).toBe('<p>home</p>');
    expect(await pages('/nope')).toBeNull();
    expect(await pages('/../')).toBeNull();
    expect(await pages(`/../${basename(dir)}/about`)).toBe('<p>about</p>');
  });
});
