/**
 * `callJob` (SDD-78 §4.2, criterion 7): a function called as the page calls it — its codec, its
 * client halves, the form's rules in the browser — and the request sent over HTTP to a dev
 * server. The dev server here is a node:http server in front of the app's in-memory one, so the
 * answer goes through the chain, the rules and the handlers as `vite dev` would answer it.
 */

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { callJob as run, forward, type CallJob } from '../../src/call.js';
import { functions } from '../../src/server.js';
import * as alias from 'fudic:components/x-alias';
import * as finder from 'fudic:components/x-finder';
import * as guarded from 'fudic:components/x-guarded';
import * as hello from 'fudic:components/x-hello';
import * as tags from 'fudic:routes/tags/[tag]';
import { sides } from './src/data/sides';

/** The job with any function of the app: its generated type is narrower than a call's. */
const callJob = (job: Omit<CallJob, 'fn'> & { readonly fn: unknown }): ReturnType<typeof run> => run(job as CallJob);

// The data edge of the alias rule: `admin` is taken, on the server.
vi.mock('./src/data/aliases', () => ({ aliasTaken: async (value: string) => value === 'admin' }));

/** What the dev server was sent. */
interface Received {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

let received: Received[] = [];
/** When set, the dev server answers with this instead of the app. */
let raw: ((res: import('node:http').ServerResponse) => void) | undefined;
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      received.push({ method: req.method!, url: req.url!, headers: req.headers, body: body.toString('utf8') });
      if (raw !== undefined) return raw(res);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
      const request = new Request(new URL(req.url!, origin), {
        method: req.method!,
        headers,
        ...(body.length > 0 ? { body } : {}),
      });
      const response = (await functions()(request)) ?? new Response(null, { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received = [];
  raw = undefined;
  sides.length = 0;
});

describe('an answer (criterion 7)', () => {
  test('a function with a handler: its value and its status, through its client halves', async () => {
    expect(await callJob({ fn: hello.greet, args: { name: 'Ana' }, origin })).toEqual({ kind: 'answered', status: 200, value: 'Hello, Ana' });
    // The request left as the page sends it: its own origin, same-site, to the function's URL.
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'POST', url: '/_fudic/fn/components/x-hello/greet' });
    expect(received[0]!.headers).toMatchObject({ origin, 'sec-fetch-site': 'same-origin' });
    expect(received[0]!.headers['content-length']).toBe(String(Buffer.byteLength(received[0]!.body)));
    expect(sides).toContain('halves:client');
  });

  test('a GET with its args in the query', async () => {
    expect(await callJob({ fn: finder.find, args: { q: 'mesa' }, origin })).toEqual({ kind: 'answered', status: 200, value: 'found mesa' });
    expect(received[0]!.method).toBe('GET');
    expect(received[0]!.headers['content-length']).toBeUndefined();
  });

  test('the params of a route id with [tag], and of a function with a route of its own', async () => {
    expect(await callJob({ fn: tags.like, params: { tag: 'uno' }, origin })).toEqual({ kind: 'answered', status: 200, value: 'liked' });
    expect(received[0]!.url).toBe('/_fudic/fn/routes/tags/uno/like');
    expect(await callJob({ fn: finder.item, args: { id: 7 }, origin })).toEqual({ kind: 'answered', status: 200, value: 'item' });
    expect(received[1]!.url).toBe('/_fudic/fn/components/x-finder/item/7');
  });

  test('the door asks for its own headers: they go with the request', async () => {
    await callJob({ fn: guarded.whoami, origin, headers: { cookie: 'fudic-preview=abc' } });
    expect(received[0]!.headers['cookie']).toBe('fudic-preview=abc');
    // The client half of `auth` still set its header: the app's request is the page's.
    expect(received[0]!.headers['authorization']).toBe('Bearer good');
  });

  test('a function that answers nothing: null', async () => {
    expect(await callJob({ fn: async () => undefined, origin })).toEqual({ kind: 'answered', status: 0, value: null });
  });
});

describe('a Problem is an answer (criterion 7)', () => {
  test('what the server refuses: its problem with the status it answered', async () => {
    const out = await callJob({ fn: alias.save, args: { alias: 'admin' }, origin });
    expect(out).toEqual({ kind: 'problem', status: 422, problem: { status: 422, title: 'Unprocessable Content', errors: { alias: { aliasTaken: true } } } });
    expect(received).toHaveLength(1);
  });

  test('a rule of the form with no data edge: the server answers it as well', async () => {
    const out = await callJob({ fn: alias.save, args: { alias: '' }, origin });
    expect(out).toMatchObject({ kind: 'problem', status: 422, problem: { status: 422, errors: { alias: { required: true } } } });
    expect(received).toHaveLength(1);
  });

  test('a problem the page raised before sending: the status is the problem\'s', async () => {
    const fn = async (): Promise<never> => {
      throw Object.assign(new Error('refused'), { problem: { status: 422, title: 'Unprocessable Content' } });
    };
    expect(await callJob({ fn, origin })).toEqual({ kind: 'problem', status: 422, problem: { status: 422, title: 'Unprocessable Content' } });
    expect(received).toEqual([]);
  });

  test('a function without handler: its 404', async () => {
    expect(await callJob({ fn: finder.lost, origin })).toMatchObject({ kind: 'problem', status: 404 });
  });
});

describe('what is not an answer', () => {
  test('a dev server that is not there: threw, with why', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const out = await callJob({ fn: finder.find, args: { q: 'a' }, origin: `http://127.0.0.1:${port}` });
    expect(out.kind).toBe('threw');
    expect((out as { message: string }).message).not.toBe('');
  });

  test('something thrown that is no Error: its text', async () => {
    expect(
      await callJob({
        fn: async () => {
          throw 'plain';
        },
        origin,
      }),
    ).toEqual({ kind: 'threw', message: 'plain' });
  });

  test('the override is gone after the call: the page answers from the in-memory server again', async () => {
    await callJob({ fn: finder.find, args: { q: 'a' }, origin });
    received = [];
    expect(await finder.find({ q: 'b' })).toBe('found b');
    expect(received).toEqual([]);
  });
});

describe('forward', () => {
  test('a status without body comes back without one; a header sent twice is left out', async () => {
    for (const status of [204, 304]) {
      raw = (res) => {
        res.writeHead(status, { 'set-cookie': ['a=1', 'b=2'], 'x-kept': 'yes' });
        res.end();
      };
      const response = await forward(origin, {})(new Request(`http://page.test/_fudic/fn/x?y=1`));
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(response.headers.get('x-kept')).toBe('yes');
      expect(response.headers.get('set-cookie')).toBeNull();
      // The path and the query of the page's request, at the dev server.
      expect(received.at(-1)!.url).toBe('/_fudic/fn/x?y=1');
    }
  });

  test('a body with its status, and the extra headers over the request', async () => {
    raw = (res) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('broke');
    };
    const response = await forward(origin, { 'x-door': 'open' })(
      new Request('http://page.test/_fudic/fn/x', { method: 'POST', body: 'hi', headers: { 'x-door': 'closed' } }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('broke');
    expect(received.at(-1)).toMatchObject({ method: 'POST', body: 'hi' });
    expect(received.at(-1)!.headers).toMatchObject({ 'x-door': 'open', 'content-length': '2', origin });
  });
});
