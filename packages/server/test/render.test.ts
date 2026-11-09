/** One route rendered for one URL (SDD-20 §4.11, SDD-70 §4.3), and the response it writes to. */

import { describe, expect, it, vi } from 'vitest';
import {
  drainStream,
  edgeContext,
  matchesPattern,
  openStream,
  pageData,
  paramsOf,
  pendingResponse,
  readsSession,
  renderPage,
  withRequest,
  type PendingResponse,
} from '../src/index.js';
import { streamOf } from './helpers.js';

describe('matchesPattern / paramsOf / edgeContext', () => {
  it('a static route exactly, a param route by its segments, the query and empty segments ignored', () => {
    expect(matchesPattern('/about', '/about')).toBe(true);
    expect(matchesPattern('/blog/:slug', '/blog//hola/?x=1')).toBe(true);
    expect(matchesPattern('/blog/:slug', '/blog')).toBe(false);
    expect(matchesPattern('/a/b', '/a/c')).toBe(false);
  });

  it('the params a path fills, decoded; one the path lacks is not there', () => {
    expect(paramsOf('/blog/:slug', '/blog/hola%20mundo')).toEqual({ slug: 'hola mundo' });
    expect(paramsOf('/a/:b/:c', '/a/1')).toEqual({ b: '1' });
  });

  it('the context of one URL: edge by default, sw mode', () => {
    const ctx = edgeContext('/blog/:slug', '/blog/x', 'n');
    expect(ctx).toMatchObject({ origin: 'edge', mode: 'sw', nonce: 'n', params: { slug: 'x' } });
    expect(ctx.url.href).toBe('http://localhost/blog/x');
    expect(edgeContext('/', '/', 'n', 'ssg').origin).toBe('ssg');
  });
});

describe('withRequest', () => {
  const ctx = edgeContext('/a', '/a?q=1', 'n');

  it('no request (the prerender): the context, with the response when given', () => {
    expect(withRequest(ctx, undefined)).toBe(ctx);
    const response: PendingResponse = { status: 200, headers: new Headers() };
    expect(withRequest(ctx, undefined, response)).toEqual({ ...ctx, response });
  });

  it('a request: its origin on the URL, and the request itself', () => {
    const request = new Request('https://app.example/a?q=1');
    const out = withRequest(ctx, request) as typeof ctx & { request: Request };
    expect(out.url.href).toBe('https://app.example/a?q=1');
    expect(out.request).toBe(request);
  });
});

describe('drainStream / openStream', () => {
  it('drains every chunk into one string, a character split between chunks whole', async () => {
    const bytes = new TextEncoder().encode('ñ');
    const split = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.subarray(0, 1));
        c.enqueue(bytes.subarray(1));
        c.close();
      },
    });
    expect(await drainStream(split)).toBe('ñ');
  });

  it('opens up to </head>, even when it is cut between chunks, and hands the rest as it comes', async () => {
    const opened = await openStream(streamOf('<html><head></he', 'ad><body>', '</body>'));
    expect(opened).toMatchObject({ head: '<html><head></head>', whole: false });
    const rest: string[] = [];
    for await (const chunk of opened.rest) rest.push(new TextDecoder().decode(chunk));
    expect(rest).toEqual(['<body>', '</body>']);
  });

  it('a </head> that ends its chunk leaves nothing over for the rest’s first yield', async () => {
    const opened = await openStream(streamOf('<head></head>', '<body>'));
    const rest: string[] = [];
    for await (const chunk of opened.rest) rest.push(new TextDecoder().decode(chunk));
    expect(rest).toEqual(['<body>']);
  });

  it('no </head>: the whole page, and nothing behind it', async () => {
    const opened = await openStream(streamOf('<p>', 'x</p>'));
    expect(opened).toMatchObject({ head: '<p>x</p>', whole: true });
    for await (const _ of opened.rest) expect.unreachable();
    opened.cancel();
  });

  it('cancel stops the stream', async () => {
    const cancel = vi.fn();
    const opened = await openStream(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('<head></head>'));
        },
        cancel,
      }),
    );
    opened.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});

describe('renderPage / pageData', () => {
  it('renders with the request, the response and onError when given', async () => {
    const seen: unknown[] = [];
    const mod = {
      render: (ctx: Record<string, unknown>) => {
        seen.push(ctx);
        return streamOf('<head></head>');
      },
    };
    const response: PendingResponse = { status: 200, headers: new Headers() };
    const onError = (): void => undefined;
    await renderPage(mod as never, '/a', '/a', 'n', undefined, response);
    await renderPage(mod as never, '/a', '/a', 'n', new Request('http://x/a'), response, onError);
    expect(seen[0]).not.toHaveProperty('onError');
    expect(seen[1]).toMatchObject({ onError, response });
  });

  it('the data endpoint: none without data, the frames without the nonce otherwise', async () => {
    const response: PendingResponse = { status: 200, headers: new Headers() };
    expect(await pageData({ render: () => streamOf('') }, '/a', '/a', undefined, response)).toBeNull();
    let given: Record<string, unknown> = {};
    const frames = await pageData(
      {
        render: () => streamOf(''),
        data: async (ctx) => {
          given = ctx as never;
          return streamOf('f');
        },
      },
      '/a/:id',
      '/a/1',
      undefined,
      response,
    );
    expect(await drainStream(frames!)).toBe('f');
    expect(given).not.toHaveProperty('nonce');
    expect(given).toMatchObject({ params: { id: '1' }, response });
  });
});

describe('pendingResponse / readsSession', () => {
  it('a fresh response, with the server’s settings under the registered symbol', () => {
    const response = pendingResponse({ secureCookies: false, secret: 's' });
    expect(response.status).toBe(200);
    expect((response as unknown as Record<symbol, unknown>)[Symbol.for('fudic.serverSettings')]).toEqual({ secureCookies: false, secret: 's' });
  });

  it('readsSession reads the note @fudic/http leaves', () => {
    const response = pendingResponse({ secureCookies: true });
    expect(readsSession(response)).toBe(false);
    Object.defineProperty(response, Symbol.for('fudic.sessionRead'), { value: true });
    expect(readsSession(response)).toBe(true);
  });
});
