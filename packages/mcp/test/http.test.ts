/**
 * The HTTP entry (criterion 2): 127.0.0.1, only under `/mcp/<secret>`, one session per client.
 * `node:http` is the real one; the test only keeps the request listener, to hand it the requests
 * a socket cannot carry.
 */

import { createServer as createNetServer } from 'node:net';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttp, type HttpEntry } from '../src/http.js';
import { createServer } from '../src/server.js';
import { fakeProject } from './helpers.js';

const listeners: RequestListener[] = [];

vi.mock('node:http', async (original) => {
  const http = await original<typeof import('node:http')>();
  return {
    ...http,
    createServer: (listener: RequestListener) => {
      listeners.push(listener);
      return http.createServer(listener);
    },
  };
});

const SECRET = 'a'.repeat(64);
const entries: HttpEntry[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function start(create = () => createServer({ project: fakeProject(), entry: 'http' })): Promise<HttpEntry> {
  const entry = await startHttp({ port: await freePort(), secret: SECRET, create });
  entries.push(entry);
  return entry;
}

async function connectTo(url: string): Promise<Client> {
  const client = new Client({ name: 'chat', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'curl', version: '0' } },
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });

afterEach(async () => {
  await Promise.all(entries.splice(0).map((e) => e.close()));
});

describe('startHttp (criterion 2)', () => {
  it('listens on 127.0.0.1 under /mcp/<secret>, and a chat speaks MCP there', async () => {
    const entry = await start();
    expect(entry.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/mcp/${SECRET}$`, 'u'));
    const client = await connectTo(entry.url);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['fudic_guide']);
    const answer = await client.callTool({ name: 'fudic_guide', arguments: { topic: 'overview' } });
    expect(answer.structuredContent).toMatchObject({ topic: 'overview' });
    await client.close();
  });

  it('a server per session: two chats at once', async () => {
    const created = vi.fn(() => createServer({ project: fakeProject(), entry: 'http' }));
    const entry = await start(created);
    const a = await connectTo(entry.url);
    const b = await connectTo(entry.url);
    expect(created).toHaveBeenCalledTimes(2);
    await a.close();
    expect((await b.listTools()).tools).toHaveLength(1);
    await b.close();
  });

  it.each([['/'], ['/mcp'], ['/mcp/'], [`/mcp/${SECRET}x`], [`/mcp/${'b'.repeat(64)}`], [`/x/mcp/${SECRET}`]])('%s: 404 with no body', async (path) => {
    const entry = await start();
    const url = new URL(path, entry.url);
    for (const res of [await fetch(url), await post(url.href, initialize)]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');
    }
  });

  it('the secret path with a query is still the secret path', async () => {
    const entry = await start();
    const res = await post(`${entry.url}?x=1`, initialize);
    expect(res.status).toBe(200);
  });

  it('a session it does not have (it was restarted): 404, and the client starts again', async () => {
    const entry = await start();
    const res = await post(entry.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'gone' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  });

  it('a GET without a session: 404', async () => {
    const entry = await start();
    const res = await fetch(entry.url, { headers: { accept: 'text/event-stream' } });
    expect(res.status).toBe(404);
  });

  it('a first POST that is not initialize: refused, and no session is kept', async () => {
    const created = vi.fn(() => createServer({ project: fakeProject(), entry: 'http' }));
    const entry = await start(created);
    const res = await post(entry.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(400);
    // Its server was closed: a real session still works after it.
    const client = await connectTo(entry.url);
    expect((await client.listTools()).tools).toHaveLength(1);
    await client.close();
  });

  it('what fails while answering is a 500 with its message', async () => {
    const entry = await start(() => {
      throw new Error('cannot create');
    });
    const res = await post(entry.url, initialize);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Error: cannot create');
  });

  it('closes its open sessions when it closes', async () => {
    const entry = await start();
    const client = await connectTo(entry.url);
    const closed = new Promise<void>((resolve) => {
      client.onclose = () => resolve();
    });
    await entry.close();
    entries.splice(entries.indexOf(entry), 1);
    await client.close();
    await closed;
    await expect(fetch(entry.url)).rejects.toThrow();
  });

  it('a port in use: rejected', async () => {
    const entry = await start();
    const port = Number(new URL(entry.url).port);
    await expect(startHttp({ port, secret: SECRET, create: () => createServer({ project: fakeProject(), entry: 'http' }) })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

describe('requests a socket cannot carry', () => {
  function fakeRes(throwOnHead = false): ServerResponse & { readonly heads: unknown[][]; readonly ends: unknown[] } {
    const heads: unknown[][] = [];
    const ends: unknown[] = [];
    const res = {
      heads,
      ends,
      headersSent: throwOnHead,
      writeHead: (...args: unknown[]) => {
        if (throwOnHead) throw new Error('already sent');
        heads.push(args);
        return { end: (body?: unknown) => ends.push(body) };
      },
    };
    return res as unknown as ServerResponse & { heads: unknown[][]; ends: unknown[] };
  }

  const listener = (): RequestListener => listeners[listeners.length - 1]!;
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

  it('a request without a URL is at /: 404', async () => {
    await start();
    const res = fakeRes();
    listener()({ headers: {} } as IncomingMessage, res);
    await settle();
    expect(res.heads).toEqual([[404]]);
  });

  it('a session header given twice: the first one counts', async () => {
    await start();
    const res = fakeRes();
    listener()({ url: `/mcp/${SECRET}`, method: 'POST', headers: { 'mcp-session-id': ['gone', 'other'] } } as unknown as IncomingMessage, res);
    await settle();
    expect(res.heads).toEqual([[404, { 'content-type': 'application/json' }]]);
  });

  it('a failure after the headers went out writes nothing more', async () => {
    await start();
    const res = fakeRes(true);
    listener()({ url: '/', headers: {} } as IncomingMessage, res);
    await settle();
    expect(res.heads).toEqual([]);
  });
});
